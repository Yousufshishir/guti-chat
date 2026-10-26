const express = require('express');
// 👈 নতুন যোগ করা হলো: getSinglePost, getUserPosts এবং togglePostVisibility ইমপোর্ট
const { 
  createPost, 
  getFeed, 
  editPost, 
  deletePost, 
  reactToPost, 
  getSinglePost, 
  getUserPosts,
  togglePostVisibility // 👈 নতুন ফাংশন ইমপোর্ট
} = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/create', createPost);
router.get('/feed', getFeed);

// 👈 নতুন যোগ করা হলো: Get User Posts রাউট (এটি /:id এর আগে থাকতে হবে)
router.get('/user/:userId', getUserPosts);

// 👈 Get Single Post রাউট
router.get('/:id', getSinglePost); 

router.route('/:id')
  .put(editPost)
  .delete(deletePost);
  
// 👈 রিঅ্যাকশন রাউট
router.put('/:id/react', reactToPost);

// 👈 নতুন যোগ করা হলো: Toggle Post Visibility রাউট
router.put('/:id/visibility', togglePostVisibility);

module.exports = router;