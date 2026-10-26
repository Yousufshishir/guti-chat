// 👈 নতুন যোগ করা হলো: Group মডেল ইমপোর্ট (মিউট গ্রুপের জন্য)
const { User, Group } = require('../models'); 
const bcrypt = require('bcryptjs'); 

// @desc    Advanced search with Privacy Filter
const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ status: 'error', message: 'Search query is required' });
    }

    if (typeof query !== 'string' || query.length > 50) {
      return res.status(400).json({ status: 'error', message: 'Invalid search query. Maximum 50 characters allowed.' });
    }

    const safeQuery = typeof query === 'string' ? query : '';
    const escapedQuery = safeQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const loggedInUser = await User.findById(req.user._id).select('friends blockedUsers');

    const users = await User.find({
      $and: [
        { _id: { $ne: req.user._id } }, 
        { _id: { $nin: loggedInUser.blockedUsers } }, 
        { blockedUsers: { $ne: req.user._id } }, 
        {
          $or: [
            { name: { $regex: escapedQuery, $options: 'i' } },
            { username: { $regex: escapedQuery, $options: 'i' } },
          ],
        },
      ],
    }).select('name username avatarUrl bio isPrivate isProfileLocked email'); 

    const filteredUsers = users.map((user) => {
      const isFriend = loggedInUser.friends.includes(user._id);
      
      if (user.isProfileLocked && !isFriend) {
        return {
          _id: user._id,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl,
          isProfileLocked: true, 
        };
      }

      return user;
    });

    res.status(200).json({ status: 'success', results: filteredUsers.length, data: filteredUsers });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's public key for E2EE
const getUserPublicKey = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id).select('publicKey blockedUsers');
    
    if (!targetUser) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const loggedInUser = await User.findById(req.user._id).select('blockedUsers');
    if (targetUser.blockedUsers.includes(req.user._id) || loggedInUser.blockedUsers.includes(req.params.id)) {
      return res.status(403).json({ status: 'error', message: 'Cannot get key due to block settings' });
    }

    if (!targetUser.publicKey) {
      return res.status(404).json({ status: 'error', message: 'This user has not set up E2EE keys yet' });
    }

    res.status(200).json({ 
      status: 'success', 
      data: { publicKey: targetUser.publicKey } 
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle Profile Lock (Facebook style)
const toggleProfileLock = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    user.isProfileLocked = !user.isProfileLocked;
    await user.save();

    res.status(200).json({ 
      status: 'success', 
      message: `Profile is now ${user.isProfileLocked ? 'Locked' : 'Unlocked'}`,
      isProfileLocked: user.isProfileLocked
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// FRIEND REQUEST WORKFLOW
// ==========================================

const sendFriendRequest = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const currentUserId = req.user._id;

    if (targetId === currentUserId.toString()) {
      return res.status(400).json({ status: 'error', message: 'You cannot send a friend request to yourself' });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetId);

    if (!targetUser) {
      return res.status(404).json({ status: 'error', message: 'Target user not found' });
    }

    if (currentUser.friends.includes(targetId)) {
      return res.status(400).json({ status: 'error', message: 'You are already friends' });
    }
    if (targetUser.friendRequests.includes(currentUserId)) {
      return res.status(400).json({ status: 'error', message: 'Friend request already pending' });
    }
    if (currentUser.blockedUsers.includes(targetId) || targetUser.blockedUsers.includes(currentUserId)) {
      return res.status(403).json({ status: 'error', message: 'Cannot send request due to block settings' });
    }

    await User.findByIdAndUpdate(targetId, { $addToSet: { friendRequests: currentUserId } });

    res.status(200).json({ status: 'success', message: 'Friend request sent successfully' });
  } catch (error) {
    next(error);
  }
};

const acceptFriendRequest = async (req, res, next) => {
  try {
    const senderId = req.params.id;
    const currentUserId = req.user._id;

    const currentUser = await User.findById(currentUserId);
    if (!currentUser.friendRequests.includes(senderId)) {
      return res.status(400).json({ status: 'error', message: 'No pending friend request from this user' });
    }

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { friendRequests: senderId },
      $addToSet: { friends: senderId },
    });

    await User.findByIdAndUpdate(senderId, {
      $addToSet: { friends: currentUserId },
    });

    res.status(200).json({ status: 'success', message: 'Friend request accepted' });
  } catch (error) {
    next(error);
  }
};

const rejectFriendRequest = async (req, res, next) => {
  try {
    const senderId = req.params.id;
    const currentUserId = req.user._id;

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { friendRequests: senderId },
    });

    res.status(200).json({ status: 'success', message: 'Friend request rejected' });
  } catch (error) {
    next(error);
  }
};

const unfriendUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const currentUserId = req.user._id;

    await User.findByIdAndUpdate(currentUserId, { $pull: { friends: targetId } });
    await User.findByIdAndUpdate(targetId, { $pull: { friends: currentUserId } });

    res.status(200).json({ status: 'success', message: 'User unfriended successfully' });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// PREVIOUS FUNCTIONS
// ==========================================

const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    user.name = req.body.name || user.name;
    user.bio = req.body.bio || user.bio;
    user.avatarUrl = req.body.avatarUrl || user.avatarUrl;
    user.isPrivate = req.body.isPrivate !== undefined ? req.body.isPrivate : user.isPrivate;

    if (req.body.publicKey) {
      user.publicKey = req.body.publicKey;
    }

    if (req.body.fcmToken) {
      user.fcmToken = req.body.fcmToken;
    }

    const updatedUser = await user.save();
    res.status(200).json({ status: 'success', data: updatedUser });
  } catch (error) {
    next(error);
  }
};

const blockUser = async (req, res, next) => {
  try {
    const userToBlock = req.params.id;
    if (userToBlock === req.user._id.toString()) return res.status(400).json({ status: 'error', message: 'You cannot block yourself' });

    const user = await User.findById(req.user._id);
    if (!user.blockedUsers.includes(userToBlock)) {
      user.blockedUsers.push(userToBlock);
      await user.save();
    }
    res.status(200).json({ status: 'success', message: 'User blocked successfully' });
  } catch (error) {
    next(error);
  }
};

const unblockUser = async (req, res, next) => {
  try {
    const userToUnblock = req.params.id;
    const user = await User.findById(req.user._id);
    user.blockedUsers = user.blockedUsers.filter((id) => id.toString() !== userToUnblock);
    await user.save();
    res.status(200).json({ status: 'success', message: 'User unblocked successfully' });
  } catch (error) {
    next(error);
  }
};

const updateBackupSettings = async (req, res, next) => {
  try {
    const { isBackupEnabled, backupFrequency } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    if (backupFrequency && !['daily', 'weekly', 'manual'].includes(backupFrequency)) {
      return res.status(400).json({ status: 'error', message: 'Invalid backup frequency' });
    }

    if (isBackupEnabled !== undefined) user.backupSettings.isBackupEnabled = isBackupEnabled;
    if (backupFrequency) user.backupSettings.backupFrequency = backupFrequency;

    await user.save();
    res.status(200).json({ status: 'success', data: user.backupSettings });
  } catch (error) {
    next(error);
  }
};

const updateBackupTimestamp = async (req, res, next) => {
  try {
    const { googleDriveFolderId } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    user.backupSettings.lastBackupAt = Date.now();
    if (googleDriveFolderId) user.backupSettings.googleDriveFolderId = googleDriveFolderId;

    await user.save();
    res.status(200).json({ status: 'success', data: user.backupSettings });
  } catch (error) {
    next(error);
  }
};

const getBackupStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('backupSettings');
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    res.status(200).json({ status: 'success', data: user.backupSettings });
  } catch (error) {
    next(error);
  }
};

const requestAccountDeletion = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    const deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    user.isDeletionScheduled = true;
    user.deletionScheduledAt = deleteAt;
    await user.save();

    res.status(200).json({ 
      status: 'success', 
      message: 'Account deletion scheduled. You have 24 hours to cancel this action.',
      deletionScheduledAt: deleteAt 
    });
  } catch (error) {
    next(error);
  }
};

const cancelAccountDeletion = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    user.isDeletionScheduled = false;
    user.deletionScheduledAt = null;
    await user.save();

    res.status(200).json({ status: 'success', message: 'Account deletion cancelled successfully.' });
  } catch (error) {
    next(error);
  }
};

const restoreCryptoVault = async (req, res, next) => {
  try {
    const { backupPin } = req.body;

    if (!backupPin) {
      return res.status(400).json({ status: 'error', message: 'Backup PIN is required' });
    }

    const user = await User.findById(req.user._id).select('+encryptedPrivateKey +keyBackupSalt');

    if (!user.encryptedPrivateKey || !user.keyBackupSalt) {
      return res.status(404).json({ status: 'error', message: 'No crypto vault found for this user.' });
    }

    const isMatch = await bcrypt.compare(backupPin, user.keyBackupSalt);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid backup PIN.' });
    }

    res.status(200).json({
      status: 'success',
      data: {
        encryptedPrivateKey: user.encryptedPrivateKey
      }
    });
  } catch (error) {
    next(error);
  }
};

const getFriendRequests = async (req, res, next) => {
  try {
    const incomingUser = await User.findById(req.user._id).populate('friendRequests', 'name username avatarUrl bio');
    const outgoingUsers = await User.find({ friendRequests: req.user._id }).select('name username avatarUrl bio');

    res.status(200).json({
      status: 'success',
      data: {
        incoming: incomingUser.friendRequests,
        outgoing: outgoingUsers,
        incomingCount: incomingUser.friendRequests.length,
        outgoingCount: outgoingUsers.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUserFriends = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'name username avatarUrl bio isPrivate isProfileLocked lastSeen');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    res.status(200).json({ status: 'success', results: user.friends.length, data: user.friends });
  } catch (error) {
    next(error);
  }
};

const getBlockedUsers = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('blockedUsers', 'name username avatarUrl bio');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    res.status(200).json({ status: 'success', results: user.blockedUsers.length, data: user.blockedUsers });
  } catch (error) {
    next(error);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const targetId = req.params.id;

    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ status: 'error', message: 'Use /api/auth/me to get your own profile.' });
    }

    const targetUser = await User.findById(targetId).select('name username avatarUrl bio isPrivate isProfileLocked blockedUsers friends publicKey');
    if (!targetUser) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const loggedInUser = await User.findById(req.user._id).select('friends blockedUsers');

    if (targetUser.blockedUsers.includes(req.user._id) || loggedInUser.blockedUsers.includes(targetId)) {
      return res.status(403).json({ status: 'error', message: 'Cannot view this profile due to block settings' });
    }

    const isFriend = loggedInUser.friends.map(f => f.toString()).includes(targetId);

    if (targetUser.isProfileLocked && !isFriend) {
      return res.status(200).json({
        status: 'success',
        data: {
          _id: targetUser._id,
          name: targetUser.name,
          username: targetUser.username,
          avatarUrl: targetUser.avatarUrl,
          isProfileLocked: true,
        },
      });
    }

    res.status(200).json({ status: 'success', data: targetUser });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 👈 নতুন যোগ করা হলো: Chat Mute ফিচার
// ==========================================

// @desc    Mute a specific user
// @route   PUT /api/users/mute/:id
// @access  Private
const muteUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ status: 'error', message: 'You cannot mute yourself' });
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ status: 'error', message: 'Target user not found' });
    }

    // $addToSet ডুপ্লিকেট প্রতিরোধ করে
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { mutedUsers: targetId } });

    res.status(200).json({ status: 'success', message: 'User muted successfully. You will not receive notifications from them.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Unmute a specific user
// @route   PUT /api/users/unmute/:id
// @access  Private
const unmuteUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    
    await User.findByIdAndUpdate(req.user._id, { $pull: { mutedUsers: targetId } });

    res.status(200).json({ status: 'success', message: 'User unmuted successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Mute a specific group
// @route   PUT /api/users/mute-group/:groupId
// @access  Private
const muteGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ status: 'error', message: 'You are not a member of this group' });
    }

    await User.findByIdAndUpdate(req.user._id, { $addToSet: { mutedGroups: groupId } });

    res.status(200).json({ status: 'success', message: 'Group muted successfully. You will not receive notifications from this group.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Unmute a specific group
// @route   PUT /api/users/unmute-group/:groupId
// @access  Private
const unmuteGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    
    await User.findByIdAndUpdate(req.user._id, { $pull: { mutedGroups: groupId } });

    res.status(200).json({ status: 'success', message: 'Group unmuted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  searchUsers,
  getUserPublicKey,
  updateProfile,
  blockUser,
  unblockUser,
  updateBackupSettings,
  updateBackupTimestamp,
  getBackupStatus,
  toggleProfileLock,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  unfriendUser,
  requestAccountDeletion, 
  cancelAccountDeletion,
  restoreCryptoVault,
  getFriendRequests,
  getUserFriends,
  getBlockedUsers,
  getUserProfile,
  // 👈 নতুন ফাংশনগুলো এক্সপোর্ট করা হলো
  muteUser,
  unmuteUser,
  muteGroup,
  unmuteGroup
};