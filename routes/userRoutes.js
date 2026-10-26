const express = require('express');
const { 
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
  // 👈 নতুন যোগ করা হলো: Mute/Unmute কন্ট্রোলার ইমপোর্ট
  muteUser,
  unmuteUser,
  muteGroup,
  unmuteGroup
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// সব route-এ authentication প্রয়োগ
router.use(protect);

// ==========================================
// Search & Profile
// ==========================================
router.get('/search', searchUsers);
router.get('/keys/:id', getUserPublicKey); 
router.put('/profile', updateProfile);
router.put('/toggle-profile-lock', toggleProfileLock);

// ==========================================
// Crypto Vault Restore
// ==========================================
router.post('/restore-crypto-vault', restoreCryptoVault);

// ==========================================
// Friends, Requests & Blocked Lists
// ==========================================
router.get('/friend-requests', getFriendRequests);
router.get('/friends', getUserFriends);
router.get('/blocked', getBlockedUsers);

// ==========================================
// Moderation (Block/Unblock)
// ==========================================
router.put('/block/:id', blockUser);
router.put('/unblock/:id', unblockUser);

// ==========================================
// Friend Requests & Social
// ==========================================
router.post('/friend-request/send/:id', sendFriendRequest);
router.post('/friend-request/accept/:id', acceptFriendRequest);
router.post('/friend-request/reject/:id', rejectFriendRequest);
router.post('/unfriend/:id', unfriendUser);

// ==========================================
// 👈 নতুন যোগ করা হলো: Mute / Unmute Routes
// ==========================================
router.put('/mute/:id', muteUser);
router.put('/unmute/:id', unmuteUser);
router.put('/mute-group/:groupId', muteGroup);
router.put('/unmute-group/:groupId', unmuteGroup);

// ==========================================
// Backup Settings
// ==========================================
router.put('/backup-settings', updateBackupSettings);
router.put('/update-backup-timestamp', updateBackupTimestamp);
router.get('/backup-status', getBackupStatus);

// ==========================================
// Account Deletion Routes
// ==========================================
router.delete('/request-deletion', requestAccountDeletion);
router.post('/cancel-deletion', cancelAccountDeletion);

// ==========================================
// ⚠️ Get Specific User Profile
// (এটি অবশ্যই সবার শেষে থাকবে, কারণ /:id সব route কে catch করে)
// ==========================================
router.get('/:id', getUserProfile);

module.exports = router;