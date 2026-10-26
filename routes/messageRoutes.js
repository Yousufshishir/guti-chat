const express = require('express');
const { 
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
  // 👈 নতুন যোগ করা হলো: forwardMessage ইমপোর্ট
  forwardMessage
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Unread Count (এটি অবশ্যই /:id এর আগে থাকবে)
router.get('/unread-count', getUnreadCount);

router.post('/send', sendMessage);

// 👈 নতুন যোগ করা হলো: Forward Message রাউট
router.post('/forward', forwardMessage);

// Bulk Delete (এটি পোস্ট রিকোয়েস্ট)
router.post('/bulk-delete', bulkDeleteMessages);

// Clear Chat for Me (এটি অবশ্যই /chat/:userId এর আগে থাকবে)
router.delete('/chat/:userId/me', clearChatForMe);
router.delete('/group/:groupId/me', clearGroupChatForMe);

// Delete Entire Chat (For Everyone)
router.delete('/chat/:userId', deleteChat);

// Group Search (এটি /search/:userId এর আগে থাকতে হবে)
router.get('/search/group/:groupId', searchGroupMessages);

// Search Messages in 1-to-1 chat
router.get('/search/:userId', searchMessages);

router.get('/chat/:userId', getChatHistory);
router.get('/group/:groupId', getGroupChatHistory);
router.put('/seen/:senderId', markMessagesAsSeen);
router.put('/:id/react', reactToMessage);

// Delete for Me (এটি /:id এর আগে থাকতে হবে)
router.delete('/:id/me', deleteMessageForMe);

// Get Message Info (Read Receipts)
router.get('/:id/info', getMessageInfo);

// Delete for Everyone
router.delete('/:id', deleteMessage); 

module.exports = router;