const express = require('express');
const { 
  registerUser, 
  loginUser, 
  getMe, 
  supabaseEmailLogin,
  logoutUser, 
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  refreshAccessToken,
  // 👈 নতুন যোগ করা হলো: updatePassword কন্ট্রোলার ইমপোর্ট
  updatePassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public Routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/supabase-email-login', supabaseEmailLogin);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyResetOTP);
router.put('/reset-password', resetPassword);
router.post('/refresh-token', refreshAccessToken); 

// Private Routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logoutUser); 

// 👈 নতুন যোগ করা হলো: Update Password রাউট (লগইন থাকা অবস্থায় পাসওয়ার্ড পরিবর্তন)
router.put('/update-password', protect, updatePassword);

module.exports = router;