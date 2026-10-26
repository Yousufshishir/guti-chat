const jwt = require('jsonwebtoken');
const crypto = require('crypto'); 
const { User } = require('../models');
const supabase = require('../config/supabaseConfig');
const { isDisposableEmail } = require('../utils/emailValidator');
const sendEmail = require('../utils/sendEmail');

// টোকেন জেনারেট করার হেল্পার ফাংশন (এখন এটি Access Token ১৫ মিনিটের জন্য কাজ করবে)
const generateToken = (user) => {
  return jwt.sign({ id: user._id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m', 
  });
};

// 👈 নতুন যোগ করা হলো: Refresh Token (৭ দিন) জেনারেট করার হেল্পার ফাংশন
const generateRefreshToken = (user) => {
  return jwt.sign({ id: user._id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
};

// ==========================================
// 1. Local Auth (Register & Login)
// ==========================================

const registerUser = async (req, res, next) => {
  try {
    const { name, username, email, password, publicKey } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ status: 'error', message: 'Please add all required fields' });
    }

    if (isDisposableEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Temporary or Disposable emails are not allowed.' });
    }

    const userExists = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (userExists) {
      return res.status(409).json({ 
        status: 'error', 
        message: 'Duplicate credentials... Try something new.' 
      });
    }

    const user = await User.create({
      name,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      authProvider: 'local',
      publicKey: publicKey || null,
    });

    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      status: 'success',
      data: {
        user,
        token: accessToken,
        refreshToken: refreshToken, 
      },
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { loginId, password } = req.body;

    if (typeof loginId !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Invalid input format' });
    }

    if (!loginId || !password) {
      return res.status(400).json({ status: 'error', message: 'Please provide email/username and password' });
    }

    const user = await User.findOne({
      $or: [
        { email: loginId.toLowerCase() },
        { username: loginId.toLowerCase() },
      ],
    }).select('+password');

    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Account temporarily locked due to too many failed attempts. Please try again after 15 minutes.' 
      });
    }

    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; 
      }
      await user.save();
      
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = null;
    }

    user.tokenVersion += 1;
    
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    await user.save();

    user.password = undefined; 

    res.status(200).json({
      status: 'success',
      data: {
        user,
        token: accessToken,
        refreshToken: refreshToken, 
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. Supabase (Gmail) Auth
// ==========================================

const supabaseEmailLogin = async (req, res, next) => {
  try {
    const { accessToken, publicKey } = req.body;

    if (!accessToken) {
      return res.status(400).json({ status: 'error', message: 'Supabase accessToken is required' });
    }

    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(accessToken);

    if (error || !supabaseUser || !supabaseUser.email) {
      console.error('🔥 Supabase Verification Error:', error?.message);
      return res.status(401).json({ status: 'error', message: 'Invalid or expired Supabase token' });
    }

    const { email } = supabaseUser;

    if (isDisposableEmail(email)) {
      return res.status(400).json({ status: 'error', message: 'Temporary or Disposable emails are not allowed.' });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      if (publicKey && !user.publicKey) {
        user.publicKey = publicKey;
      }
      user.tokenVersion += 1;
      
      const newAccessToken = generateToken(user);
      const refreshToken = generateRefreshToken(user);
      user.refreshToken = refreshToken;
      await user.save();

      return res.status(200).json({
        status: 'success',
        message: 'Logged in successfully',
        data: { user, token: newAccessToken, refreshToken: refreshToken },
      });
    }

    let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    let username = baseUsername;
    let isUnique = false;
    
    while (!isUnique) {
      const existingUser = await User.findOne({ username });
      if (!existingUser) {
        isUnique = true;
      } else {
        username = `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    const name = baseUsername.charAt(0).toUpperCase() + baseUsername.slice(1);

    user = await User.create({
      name: name,
      username: username,
      email: email.toLowerCase(),
      authProvider: 'google',
      publicKey: publicKey || null,
    });

    const newAccessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully via Email',
      data: { user, token: newAccessToken, refreshToken: refreshToken },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. Logout (Token Revocation & FCM Delete)
// ==========================================

const logoutUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.tokenVersion += 1;
    user.fcmToken = null; 
    user.refreshToken = null; 
    await user.save();

    res.status(200).json({ status: 'success', message: 'Logged out successfully. Session invalidated.' });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. Forget Password (OTP Flow)
// ==========================================

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Please provide an email' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'There is no user with that email' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');

    user.resetPasswordOTP = hashedOTP; 
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; 
    user.resetPasswordAttempts = 0; 
    await user.save({ validateBeforeSave: false });

    const message = `Your password reset OTP is: ${otp}\n\nThis OTP is valid for 10 minutes.`;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset OTP',
        message,
      });
      res.status(200).json({ status: 'success', message: 'OTP sent to email successfully' });
    } catch (err) {
      user.resetPasswordOTP = undefined;
      user.resetPasswordExpire = undefined;
      user.resetPasswordAttempts = 0; 
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ status: 'error', message: 'Email could not be sent' });
    }
  } catch (error) {
    next(error);
  }
};

const verifyResetOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ status: 'error', message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP' });
    }

    if (!user.resetPasswordOTP || user.resetPasswordExpire < Date.now() || user.resetPasswordAttempts >= 3) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP. Too many attempts.' });
    }

    const hashedInputOTP = crypto.createHash('sha256').update(otp).digest('hex');
    if (user.resetPasswordOTP !== hashedInputOTP) {
      user.resetPasswordAttempts += 1; 
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP' });
    }

    res.status(200).json({ status: 'success', message: 'OTP verified successfully. You can now reset your password.' });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Email, OTP, and new password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP' });
    }

    if (!user.resetPasswordOTP || user.resetPasswordExpire < Date.now() || user.resetPasswordAttempts >= 3) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP. Too many attempts.' });
    }

    const hashedInputOTP = crypto.createHash('sha256').update(otp).digest('hex');
    if (user.resetPasswordOTP !== hashedInputOTP) {
      user.resetPasswordAttempts += 1;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP' });
    }

    user.password = newPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpire = undefined;
    user.resetPasswordAttempts = 0; 
    user.tokenVersion += 1; 
    user.refreshToken = null;
    
    await user.save();

    res.status(200).json({ status: 'success', message: 'Password reset successfully. You can now login.' });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. Profile & Refresh Token
// ==========================================

const getMe = async (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', data: req.user });
  } catch (error) {
    next(error);
  }
};

const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ status: 'error', message: 'Refresh Token is required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    
    if (!user || user.refreshToken !== refreshToken || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(403).json({ status: 'error', message: 'Invalid or expired refresh token' });
    }

    const newAccessToken = generateToken(user);

    res.status(200).json({
      status: 'success',
      data: {
        token: newAccessToken,
      },
    });
  } catch (error) {
    console.error('Refresh Token Error:', error.message);
    return res.status(403).json({ status: 'error', message: 'Invalid or expired refresh token' });
  }
};

// ==========================================
// 👈 নতুন যোগ করা হলো: Update Password (Change Password)
// ==========================================

// @desc    Update password while logged in
// @route   PUT /api/auth/update-password
// @access  Private
const updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    // ১. বেসিক ভ্যালিডেশন
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Old password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ status: 'error', message: 'New password must be at least 6 characters' });
    }

    // ২. ইউজার খোঁজা (পাসওয়ার্ড সহ)
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // ৩. Google/Supabase ইউজার হলে পাসওয়ার্ড চেঞ্জ করার দরকার নেই
    if (user.authProvider !== 'local') {
      return res.status(400).json({ 
        status: 'error', 
        message: `Your account is managed by ${user.authProvider}. Password change is not applicable.` 
      });
    }

    // ৪. পুরনো পাসওয়ার্ড ভেরিফাই করা
    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
    }

    // ৫. নতুন ও পুরনো পাসওয়ার্ড একই হলে ব্লক করা
    if (oldPassword === newPassword) {
      return res.status(400).json({ status: 'error', message: 'New password cannot be the same as the old password' });
    }

    // ৬. নতুন পাসওয়ার্ড সেট (pre-save hook অটোমেটিক হ্যাশ করবে)
    user.password = newPassword;
    
    // ৭. সিকিউরিটি: টোকেন ইনভ্যালিডেট ও রিফ্রেশ টোকেন ডিলিট
    user.tokenVersion += 1;
    user.refreshToken = null;
    
    await user.save();

    res.status(200).json({ 
      status: 'success', 
      message: 'Password updated successfully. Please login again on all devices.' 
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  supabaseEmailLogin, 
  logoutUser,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  getMe,
  refreshAccessToken,
  updatePassword // 👈 নতুন ফাংশন এক্সপোর্ট করা হলো
};