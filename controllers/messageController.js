const { Message, User, Group } = require('../models'); 
const { sendPushNotification } = require('../utils/sendPushNotification');
const { activeUsers, offlineMessageQueue } = require('../sockets/chatSocket'); 

// @desc    Send a message (1-to-1 or Group)
const sendMessage = async (req, res, next) => {
  try {
    const { receiverId, groupId, messageType, content, isDisappearing, timerInSeconds, mediaPublicId } = req.body;

    if (!receiverId && !groupId) {
      return res.status(400).json({ status: 'error', message: 'Please provide either a receiverId or a groupId' });
    }
    if (receiverId && groupId) {
      return res.status(400).json({ status: 'error', message: 'Cannot send a message to both a user and a group at the same time' });
    }
    if (!content) {
      return res.status(400).json({ status: 'error', message: 'Message content cannot be empty' });
    }

    if ((messageType === 'image' || messageType === 'video') && !content.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ status: 'error', message: 'Invalid media URL. Only Cloudinary URLs are allowed for images/videos.' });
    }

    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: 'error', message: 'Group not found' });
      }
      const isMember = group.members.some((memberId) => memberId.toString() === req.user._id.toString());
      if (!isMember) {
        return res.status(403).json({ status: 'error', message: 'You are not a member of this group' });
      }
    }

    if (receiverId) {
      const receiver = await User.findById(receiverId).select('blockedUsers');
      if (receiver && (receiver.blockedUsers.includes(req.user._id) || req.user.blockedUsers.includes(receiverId))) {
        return res.status(403).json({ status: 'error', message: 'You are blocked by this user or you blocked them' });
      }
    }

    let expireAt = null;
    if (isDisappearing && timerInSeconds > 0) {
      expireAt = new Date(Date.now() + timerInSeconds * 1000);
    }

    const message = await Message.create({
      sender: req.user._id,
      receiver: receiverId || null,
      groupId: groupId || null,
      messageType: messageType || 'text',
      content: content,
      mediaPublicId: mediaPublicId || null,
      isDisappearing: isDisappearing || false,
      timerInSeconds: isDisappearing ? timerInSeconds : 0,
      expireAt,
    });

    const io = req.app.get('io');
    if (io) {
      const populatedMessage = await message.populate('sender', 'name username avatarUrl');
      
      if (receiverId) {
        io.to(receiverId.toString()).emit('receive-message', populatedMessage);
        io.to(req.user._id.toString()).emit('message-sent-sync', populatedMessage);
        
        if (!activeUsers.has(receiverId.toString())) {
           await sendPushNotification(receiverId, req.user.username);
           
           const currentQueue = offlineMessageQueue.get(receiverId.toString()) || [];
           if (currentQueue.length < 50) {
             currentQueue.push({ event: 'receive-message', payload: populatedMessage });
             offlineMessageQueue.set(receiverId.toString(), currentQueue);
             console.log(`📥 REST API: Queued offline message for user ${receiverId}`);
           }
        }
      } else if (groupId) {
        io.to(groupId.toString()).emit('receive-group-message', populatedMessage);
      }
    }

    res.status(201).json({ status: 'success', data: message });
  } catch (error) {
    next(error);
  }
};

// @desc    Get 1-to-1 chat history (With Pagination)
const getChatHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user._id;

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); 
    const skip = (page - 1) * limit;

    const otherUser = await User.findById(userId).select('blockedUsers');
    const isBlocked = otherUser 
      ? (otherUser.blockedUsers.includes(loggedInUserId) || req.user.blockedUsers.includes(userId)) 
      : false;

    const query = {
      $or: [
        { sender: loggedInUserId, receiver: userId },
        { sender: userId, receiver: loggedInUserId },
      ],
      deletedFor: { $ne: loggedInUserId }, 
    };

    const totalMessages = await Message.countDocuments(query);

    const messages = await Message.find(query)
      .sort({ createdAt: -1 }) 
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name username avatarUrl')
      .populate('receiver', 'name username avatarUrl')
      .populate('readBy', 'name username')
      .populate('reactions.user', 'name username');

    res.status(200).json({ 
      status: 'success', 
      isBlocked, 
      currentPage: page,
      totalPages: Math.ceil(totalMessages / limit),
      totalResults: totalMessages,
      results: messages.length, 
      data: messages 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get group chat history (With Pagination)
const getGroupChatHistory = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }
    const isMember = group.members.some((memberId) => memberId.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ status: 'error', message: 'You are not a member of this group' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const query = { 
      groupId, 
      deletedFor: { $ne: req.user._id } 
    };

    const totalMessages = await Message.countDocuments(query);

    const messages = await Message.find(query)
      .sort({ createdAt: -1 }) 
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name username avatarUrl')
      .populate('readBy', 'name username')
      .populate('reactions.user', 'name username');

    res.status(200).json({ 
      status: 'success', 
      currentPage: page,
      totalPages: Math.ceil(totalMessages / limit),
      totalResults: totalMessages,
      results: messages.length, 
      data: messages 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark messages as seen/read
const markMessagesAsSeen = async (req, res, next) => {
  try {
    const { senderId } = req.params;
    const loggedInUserId = req.user._id;

    const unreadMessages = await Message.find({
      sender: senderId,
      receiver: loggedInUserId,
      readBy: { $ne: loggedInUserId },
    });

    if (unreadMessages.length > 0) {
      await Message.updateMany(
        { sender: senderId, receiver: loggedInUserId, readBy: { $ne: loggedInUserId } },
        { $push: { readBy: loggedInUserId } }
      );

      const io = req.app.get('io');
      if (io) {
        io.to(senderId.toString()).emit('messages-seen', { by: loggedInUserId });
        
        if (!activeUsers.has(senderId.toString())) {
          const currentQueue = offlineMessageQueue.get(senderId.toString()) || [];
          if (currentQueue.length < 50) {
            currentQueue.push({ event: 'messages-seen', payload: { by: loggedInUserId } });
            offlineMessageQueue.set(senderId.toString(), currentQueue);
            console.log(`📥 REST API: Queued offline 'messages-seen' event for user ${senderId}`);
          }
        }
      }
    }

    res.status(200).json({ status: 'success', message: 'Messages marked as seen' });
  } catch (error) {
    next(error);
  }
};

// @desc    React to a message
const reactToMessage = async (req, res, next) => {
  try {
    const { reactionType } = req.body;
    const allowedReactions = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

    if (!allowedReactions.includes(reactionType)) {
      return res.status(400).json({ status: 'error', message: 'Invalid reaction type' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ status: 'error', message: 'Message not found' });

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (existingReactionIndex > -1) {
      if (message.reactions[existingReactionIndex].type === reactionType) {
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        message.reactions[existingReactionIndex].type = reactionType;
      }
    } else {
      message.reactions.push({ user: req.user._id, type: reactionType });
    }

    await message.save();

    const io = req.app.get('io');
    if (io) {
      if (message.receiver) {
        io.to(message.receiver.toString()).emit('message-reaction-updated', message);
      } else if (message.groupId) {
        io.to(message.groupId.toString()).emit('message-reaction-updated', message);
      }
    }

    res.status(200).json({ status: 'success', data: message });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a message (Delete for Everyone)
const deleteMessage = async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ status: 'error', message: 'Message not found' });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'You can only delete your own messages' });
    }

    await message.deleteOne();

    const io = req.app.get('io');
    if (io) {
      if (message.receiver) {
        io.to(message.receiver.toString()).emit('message-deleted', { messageId: message._id });
        io.to(req.user._id.toString()).emit('message-deleted', { messageId: message._id });
      } else if (message.groupId) {
        io.to(message.groupId.toString()).emit('message-deleted', { messageId: message._id });
      }
    }

    res.status(200).json({ status: 'success', message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get unread message count
const getUnreadCount = async (req, res, next) => {
  try {
    const loggedInUserId = req.user._id;

    const totalUnread = await Message.countDocuments({
      receiver: loggedInUserId,
      readBy: { $ne: loggedInUserId },
      deletedFor: { $ne: loggedInUserId }
    });

    const unreadBySender = await Message.aggregate([
      {
        $match: {
          receiver: loggedInUserId,
          readBy: { $ne: loggedInUserId },
          deletedFor: { $ne: loggedInUserId }
        },
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 },
          lastMessageAt: { $max: '$createdAt' },
        },
      },
      {
        $sort: { lastMessageAt: -1 },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'senderInfo',
        },
      },
      {
        $unwind: '$senderInfo',
      },
      {
        $project: {
          _id: 0,
          senderId: '$_id',
          name: '$senderInfo.name',
          username: '$senderInfo.username',
          avatarUrl: '$senderInfo.avatarUrl',
          count: 1,
          lastMessageAt: 1,
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalUnread,
        unreadBySender,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete entire chat thread with a specific user
const deleteChat = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user._id;

    const query = {
      $or: [
        { sender: loggedInUserId, receiver: userId },
        { sender: userId, receiver: loggedInUserId },
      ],
    };

    const messages = await Message.find(query);
    if (messages.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No chat history found' });
    }

    for (let msg of messages) {
      await msg.deleteOne();
    }

    const io = req.app.get('io');
    if (io) {
      io.to(userId.toString()).emit('chat-deleted', { by: loggedInUserId });
      io.to(loggedInUserId.toString()).emit('chat-deleted', { by: loggedInUserId });
    }

    res.status(200).json({ status: 'success', message: 'Entire chat deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Search messages inside a 1-to-1 chat
const searchMessages = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { query } = req.query;
    const loggedInUserId = req.user._id;

    if (!query) {
      return res.status(400).json({ status: 'error', message: 'Search query is required' });
    }

    const searchQuery = {
      $and: [
        {
          $or: [
            { sender: loggedInUserId, receiver: userId },
            { sender: userId, receiver: loggedInUserId },
          ],
        },
        { content: { $regex: query, $options: 'i' } },
        { deletedFor: { $ne: loggedInUserId } }
      ]
    };

    const messages = await Message.find(searchQuery)
      .sort({ createdAt: -1 })
      .populate('sender', 'name username avatarUrl')
      .populate('receiver', 'name username avatarUrl');

    res.status(200).json({ 
      status: 'success', 
      results: messages.length, 
      data: messages 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk delete messages (Delete for Everyone)
const bulkDeleteMessages = async (req, res, next) => {
  try {
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Valid messageIds array is required' });
    }

    const messages = await Message.find({ 
      _id: { $in: messageIds },
      sender: req.user._id
    });

    if (messages.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No valid messages found to delete' });
    }

    const deletedIds = [];
    for (let msg of messages) {
      deletedIds.push(msg._id);
      await msg.deleteOne(); 
    }

    const io = req.app.get('io');
    if (io) {
      messages.forEach((msg) => {
        if (msg.receiver) {
          io.to(msg.receiver.toString()).emit('message-deleted', { messageId: msg._id });
        } else if (msg.groupId) {
          io.to(msg.groupId.toString()).emit('message-deleted', { messageId: msg._id });
        }
      });
    }

    res.status(200).json({ 
      status: 'success', 
      message: `${deletedIds.length} messages deleted successfully` 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a message for the logged-in user only (Delete for Me)
const deleteMessageForMe = async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ status: 'error', message: 'Message not found' });
    }

    if (message.deletedFor.includes(req.user._id)) {
      return res.status(400).json({ status: 'error', message: 'Message already deleted for you' });
    }

    message.deletedFor.push(req.user._id);
    await message.save();

    res.status(200).json({ status: 'success', message: 'Message deleted for you successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Search messages inside a group
const searchGroupMessages = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { query } = req.query;
    const loggedInUserId = req.user._id;

    if (!query) {
      return res.status(400).json({ status: 'error', message: 'Search query is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }
    const isMember = group.members.some((memberId) => memberId.toString() === loggedInUserId.toString());
    if (!isMember) {
      return res.status(403).json({ status: 'error', message: 'You are not a member of this group' });
    }

    const searchQuery = {
      groupId,
      content: { $regex: query, $options: 'i' },
      deletedFor: { $ne: loggedInUserId }
    };

    const messages = await Message.find(searchQuery)
      .sort({ createdAt: -1 })
      .populate('sender', 'name username avatarUrl');

    res.status(200).json({ 
      status: 'success', 
      results: messages.length, 
      data: messages 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get message read info (Who read the message)
const getMessageInfo = async (req, res, next) => {
  try {
    const message = await Message.findById(req.params.id)
      .populate('readBy', 'name username avatarUrl')
      .populate('sender', 'name username');

    if (!message) {
      return res.status(404).json({ status: 'error', message: 'Message not found' });
    }

    const loggedInUserId = req.user._id.toString();
    const isSender = message.sender._id.toString() === loggedInUserId;
    const isReceiver = message.receiver && message.receiver.toString() === loggedInUserId;

    if (!isSender && !isReceiver) {
      if (message.groupId) {
        const group = await Group.findById(message.groupId);
        const isMember = group && group.members.some(m => m.toString() === loggedInUserId);
        if (!isMember) {
          return res.status(403).json({ status: 'error', message: 'Unauthorized to view message info' });
        }
      } else {
        return res.status(403).json({ status: 'error', message: 'Unauthorized to view message info' });
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        messageId: message._id,
        sender: message.sender,
        totalRead: message.readBy.length,
        readBy: message.readBy,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Clear entire 1-to-1 chat for logged-in user only
const clearChatForMe = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user._id;

    const result = await Message.updateMany(
      {
        $or: [
          { sender: loggedInUserId, receiver: userId },
          { sender: userId, receiver: loggedInUserId },
        ],
      },
      { $addToSet: { deletedFor: loggedInUserId } }
    );

    res.status(200).json({ 
      status: 'success', 
      message: 'Chat cleared for you successfully', 
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Clear entire group chat for logged-in user only
const clearGroupChatForMe = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const loggedInUserId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ status: 'error', message: 'Group not found' });
    
    const isMember = group.members.some((m) => m.toString() === loggedInUserId.toString());
    if (!isMember) return res.status(403).json({ status: 'error', message: 'You are not a member of this group' });

    const result = await Message.updateMany(
      { groupId },
      { $addToSet: { deletedFor: loggedInUserId } }
    );

    res.status(200).json({ 
      status: 'success', 
      message: 'Group chat cleared for you successfully', 
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 👈 নতুন যোগ করা হলো: Forward Message
// ==========================================

// @desc    Forward a message to a user or group
// @route   POST /api/messages/forward
// @access  Private
const forwardMessage = async (req, res, next) => {
  try {
    const { messageId, receiverId, groupId, isDisappearing, timerInSeconds } = req.body;
    const loggedInUserId = req.user._id;

    // ১. ভ্যালিডেশন
    if (!messageId) {
      return res.status(400).json({ status: 'error', message: 'Original messageId is required' });
    }
    if (!receiverId && !groupId) {
      return res.status(400).json({ status: 'error', message: 'Please provide either a receiverId or a groupId' });
    }
    if (receiverId && groupId) {
      return res.status(400).json({ status: 'error', message: 'Cannot forward to both a user and a group at the same time' });
    }

    // ২. মেইন মেসেজটি খোঁজা
    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({ status: 'error', message: 'Original message not found' });
    }

    // ৩. টার্গেট চেক (গ্রুপ বা ইউজার)
    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: 'error', message: 'Group not found' });
      }
      const isMember = group.members.some((m) => m.toString() === loggedInUserId.toString());
      if (!isMember) {
        return res.status(403).json({ status: 'error', message: 'You are not a member of this group' });
      }
    }

    if (receiverId) {
      const receiver = await User.findById(receiverId).select('blockedUsers');
      if (receiver && (receiver.blockedUsers.includes(loggedInUserId) || req.user.blockedUsers.includes(receiverId))) {
        return res.status(403).json({ status: 'error', message: 'You are blocked by this user or you blocked them' });
      }
    }

    // ৪. TTL লজিক (ফরওয়ার্ডের সময় নতুন করে ডিসঅ্যাপিয়ারিং সেট করা যাবে)
    let expireAt = null;
    if (isDisappearing && timerInSeconds > 0) {
      expireAt = new Date(Date.now() + timerInSeconds * 1000);
    }

    // ৫. নতুন মেসেজ তৈরি (কন্টেন্ট কপি করা হয়েছে)
    const forwardedMessage = await Message.create({
      sender: loggedInUserId,
      receiver: receiverId || null,
      groupId: groupId || null,
      messageType: originalMessage.messageType,
      content: originalMessage.content,
      isDisappearing: isDisappearing || false,
      timerInSeconds: isDisappearing ? timerInSeconds : 0,
      expireAt,
    });

    // ৬. Socket.io ইভেন্ট পাঠানো
    const io = req.app.get('io');
    if (io) {
      const populatedMessage = await forwardedMessage.populate('sender', 'name username avatarUrl');
      
      if (receiverId) {
        io.to(receiverId.toString()).emit('receive-message', populatedMessage);
        io.to(loggedInUserId.toString()).emit('message-sent-sync', populatedMessage);
        
        if (!activeUsers.has(receiverId.toString())) {
           await sendPushNotification(receiverId, req.user.username);
        }
      } else if (groupId) {
        io.to(groupId.toString()).emit('receive-group-message', populatedMessage);
      }
    }

    res.status(201).json({ status: 'success', data: forwardedMessage });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMessage,
  getChatHistory,
  getGroupChatHistory,
  markMessagesAsSeen,
  reactToMessage,
  deleteMessage,
  getUnreadCount,
  deleteChat,
  searchMessages,
  bulkDeleteMessages,
  deleteMessageForMe,
  searchGroupMessages,
  getMessageInfo,
  clearChatForMe,
  clearGroupChatForMe,
  forwardMessage // 👈 নতুন ফাংশন এক্সপোর্ট করা হলো
};