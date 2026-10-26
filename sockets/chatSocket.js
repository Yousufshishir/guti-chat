const jwt = require('jsonwebtoken');
const { User, Group } = require('../models'); 

const activeUsers = new Map();
// 👈 নতুন যোগ করা হলো: Socket Flooding ঠেকাতে IP ট্র্যাকিং
const ipConnections = new Map(); 
const MAX_CONNECTIONS_PER_IP = 5;

// 👈 নতুন যোগ করা হলো: অফলাইন মেসেজ কিউ (Queue Resilience)
const offlineMessageQueue = new Map();
const MAX_QUEUE_SIZE = 50; // মেমোরি ওভারফ্লো ঠেকাতে সর্বোচ্চ ৫০টি মেসেজ কিউতে রাখা হবে

const chatSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) throw new Error('Authentication error: No token provided');

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) throw new Error('User not found');
      
      // 👈 Security Fix: Token Version Check
      if (decoded.tokenVersion !== user.tokenVersion) {
        throw new Error('Session expired. Please login again.');
      }

      // 👈 নতুন যোগ করা হলো: IP Connection Limit Check
      const clientIp = socket.handshake.address;
      const currentConnections = ipConnections.get(clientIp) || 0;
      if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
        throw new Error('Too many connections from this IP.');
      }
      
      socket.user = user; 
      next();
    } catch (error) {
      console.error('Socket Auth Error:', error.message);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    // 👈 নতুন যোগ করা হলো: কানেকশন কাউন্ট করা
    const clientIp = socket.handshake.address;
    ipConnections.set(clientIp, (ipConnections.get(clientIp) || 0) + 1);

    console.log(`🔌 User Connected: ${socket.user.username} (${socket.id})`);

    if (activeUsers.has(userId)) {
      const oldSocketId = activeUsers.get(userId);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) {
        oldSocket.emit('force-logout', { message: 'Logged in from another device.' });
        oldSocket.disconnect(true);
      }
    }

    activeUsers.set(userId, socket.id);
    socket.join(userId);

    await User.findByIdAndUpdate(userId, { lastSeen: Date.now() });

    // 👈 নতুন যোগ করা হলো: কানেক্ট হওয়া মাত্রই অফলাইন কিউ ফ্লাশ করা (Catch-Up Logic)
    if (offlineMessageQueue.has(userId)) {
      const queuedEvents = offlineMessageQueue.get(userId);
      if (queuedEvents.length > 0) {
        socket.emit('sync-offline-events', queuedEvents);
        console.log(`📦 Synced ${queuedEvents.length} offline events to ${socket.user.username}`);
      }
      offlineMessageQueue.delete(userId); // ফ্লাশ করার পর কিউ ক্লিয়ার
    }

    try {
      const userWithFriends = await User.findById(userId).populate('friends', '_id');
      const friendIds = userWithFriends.friends.map((f) => f._id.toString());

      friendIds.forEach((friendId) => {
        if (activeUsers.has(friendId)) {
          io.to(activeUsers.get(friendId)).emit('online-status', {
            userId: userId,
            isOnline: true,
          });
        }
      });
    } catch (err) {
      console.error('Error broadcasting online status:', err);
    }

    // 👈 নতুন যোগ করা হলো: Group Membership Check (Room Hijacking প্রতিরোধ)
    socket.on('join-group', async (groupId) => {
      try {
        const group = await Group.findById(groupId);
        if (!group) {
          return; // গ্রুপ না থাকলে কিছুই করবে না
        }

        const isMember = group.members.some((memberId) => memberId.toString() === userId);
        if (!isMember) {
          console.log(`🚫 Blocked unauthorized join attempt to group ${groupId} by ${socket.user.username}`);
          return; // মেম্বার না হলে রুমে জয়েন করতে দেবে না
        }

        socket.join(groupId);
        console.log(`👥 User ${socket.user.username} joined group: ${groupId}`);
      } catch (error) {
        console.error('Error joining group socket:', error.message);
      }
    });

    socket.on('typing', ({ receiverId }) => {
      if (socket.user.blockedUsers.includes(receiverId)) return;

      const receiverSocketId = activeUsers.get(receiverId);
      if (receiverSocketId) io.to(receiverSocketId).emit('typing', { senderId: userId, isTyping: true });
    });

    socket.on('stop-typing', ({ receiverId }) => {
      const receiverSocketId = activeUsers.get(receiverId);
      if (receiverSocketId) io.to(receiverSocketId).emit('typing', { senderId: userId, isTyping: false });
    });

    socket.on('group-typing', ({ groupId }) => {
      socket.to(groupId).emit('group-typing', { senderId: userId, groupId, isTyping: true });
    });

    socket.on('group-stop-typing', ({ groupId }) => {
      socket.to(groupId).emit('group-typing', { senderId: userId, groupId, isTyping: false });
    });

    socket.on('instant-message', async ({ receiverId, groupId, messagePayload }) => {
      if (receiverId) {
        const receiver = await User.findById(receiverId).select('blockedUsers');
        if (receiver && (receiver.blockedUsers.includes(userId) || socket.user.blockedUsers.includes(receiverId))) {
           return; 
        }

        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('receive-message', messagePayload);
        } else {
          // 👈 নতুন যোগ করা হলো: রিসিভার অফলাইন থাকলে কিউতে সেভ করা
          const currentQueue = offlineMessageQueue.get(receiverId) || [];
          if (currentQueue.length < MAX_QUEUE_SIZE) {
            currentQueue.push({ event: 'receive-message', payload: messagePayload });
            offlineMessageQueue.set(receiverId, currentQueue);
            console.log(`📥 Queued offline message for user: ${receiverId}`);
          }
        }
      } else if (groupId) {
        // 👈 নতুন যোগ করা হলো: মেসেজ পাঠানোর আগেও গ্রুপ মেম্বারশিপ চেক করা (Double Security)
        const group = await Group.findById(groupId);
        const isMember = group && group.members.some((m) => m.toString() === userId);
        
        if (isMember) {
          socket.to(groupId).emit('receive-group-message', messagePayload);
        }
      }
    });

    socket.on('disconnect', async () => {
      console.log(`🔌 User Disconnected: ${socket.user.username}`);
      
      // 👈 নতুন যোগ করা হলো: ডিসকানেক্ট হলে কাউন্ট কমানো
      const currentIpCount = ipConnections.get(clientIp) || 1;
      if (currentIpCount <= 1) ipConnections.delete(clientIp);
      else ipConnections.set(clientIp, currentIpCount - 1);

      if (activeUsers.get(userId) === socket.id) {
        activeUsers.delete(userId);

        const lastSeenTime = Date.now();
        await User.findByIdAndUpdate(userId, { lastSeen: lastSeenTime });

        try {
          const userWithFriends = await User.findById(userId).populate('friends', '_id');
          const friendIds = userWithFriends.friends.map((f) => f._id.toString());

          friendIds.forEach((friendId) => {
            if (activeUsers.has(friendId)) {
              io.to(activeUsers.get(friendId)).emit('online-status', {
                userId: userId,
                isOnline: false,
                lastSeen: lastSeenTime,
              });
            }
          });
        } catch (err) {
          console.error('Error broadcasting offline status:', err);
        }
      }
    });
  });
};

// 👈 নতুন যোগ করা হলো: কিউটি এক্সপোর্ট করা হলো যাতে messageController.js-তে 'seen' ইভেন্ট কিউ করা যায়
module.exports = { chatSocket, activeUsers, offlineMessageQueue };