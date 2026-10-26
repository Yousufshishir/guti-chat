const { MoodLog } = require('../models');

// @desc    Set today's mood
// @route   POST /api/moods/set
// @access  Private
const setMood = async (req, res, next) => {
  try {
    const { currentMood } = req.body;
    const allowedMoods = ['Happy', 'Sad', 'Angry', 'Missing You'];

    if (!allowedMoods.includes(currentMood)) {
      return res.status(400).json({ status: 'error', message: 'Invalid mood type' });
    }

    // আজকের দিনের শুরু (00:00:00) বের করা
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // আজকের মুড আপডেট করা, না থাকলে নতুন তৈরি করা (Upsert)
    const moodLog = await MoodLog.findOneAndUpdate(
      { user: req.user._id, createdAt: { $gte: startOfToday } },
      { currentMood },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ status: 'success', data: moodLog });
  } catch (error) {
    next(error);
  }
};

// @desc    Get mood dashboard with curated message
// @route   GET /api/moods/dashboard
// @access  Private
const getMoodDashboard = async (req, res, next) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // আজকের মুড খোঁজা
    const moodLog = await MoodLog.findOne({
      user: req.user._id,
      createdAt: { $gte: startOfToday },
    });

    if (!moodLog) {
      return res.status(200).json({
        status: 'success',
        data: {
          currentMood: null,
          message: 'You have not set your mood for today. How are you feeling?',
        },
      });
    }

    // মুড অনুযায়ী মেসেজ
    let curatedMessage = '';
    switch (moodLog.currentMood) {
      case 'Happy':
        curatedMessage = 'That is wonderful to hear! Keep spreading the joy today. 😊';
        break;
      case 'Sad':
        curatedMessage = 'It is okay to feel sad. Take a deep breath, better days are coming. 💙';
        break;
      case 'Angry':
        curatedMessage = 'Take a moment to breathe. Do not let anger ruin your peace. 🧘‍♂️';
        break;
      case 'Missing You':
        curatedMessage = 'Missing someone means you have a heart full of love. Send them a message! 💌';
        break;
      default:
        curatedMessage = 'Have a great day!';
    }

    res.status(200).json({
      status: 'success',
      data: {
        currentMood: moodLog.currentMood,
        message: curatedMessage,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 👈 নতুন যোগ করা হলো: Get Mood History
// ==========================================

// @desc    Get mood history (With Pagination)
// @route   GET /api/moods/history
// @access  Private
const getMoodHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100); // ডিফল্ট ৩০ দিনের ডেটা
    const skip = (page - 1) * limit;

    const totalLogs = await MoodLog.countDocuments({ user: req.user._id });

    const history = await MoodLog.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      currentPage: page,
      totalPages: Math.ceil(totalLogs / limit),
      totalResults: totalLogs,
      results: history.length,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { 
  setMood, 
  getMoodDashboard,
  getMoodHistory // 👈 নতুন ফাংশন এক্সপোর্ট করা হলো
};