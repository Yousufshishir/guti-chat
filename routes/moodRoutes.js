const express = require('express');
// 👈 নতুন যোগ করা হলো: getMoodHistory ইমপোর্ট করা হলো
const { setMood, getMoodDashboard, getMoodHistory } = require('../controllers/moodController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/set', setMood);
router.get('/dashboard', getMoodDashboard);

// 👈 নতুন যোগ করা হলো: Mood History রাউট
router.get('/history', getMoodHistory);

module.exports = router;