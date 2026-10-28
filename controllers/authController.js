const jwt = require('jsonwebtoken');
const crypto = require('crypto'); 
const SibApiV3Sdk = require('sib-api-v3-sdk'); 
const { User } = require('../models');
const supabase = require('../config/supabaseConfig');
const { isDisposableEmail } = require('../utils/emailValidator');

// 👈 ফিক্স ২: রেসপন্স পাঠানোর আগে ইউজার অবজেক্ট স্যানিটাইজ করার হেল্পার ফাংশন
const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  delete userObj.refreshToken;
  delete userObj.encryptedPrivateKey;
  delete userObj.keyBackupSalt;
  delete userObj.__v;
  return userObj;
};

// টোকেন জেনারেট করার হেল্পার ফাংশন (Access Token ১৫ মিনিটের জন্য)
const generateToken = (user) => {
  return jwt.sign({ id: user._id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m', 
  });
};

// Refresh Token (৭ দিন) জেনারেট করার হেল্পার ফাংশন
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
        user: sanitizeUser(user), // 👈 ফিক্স: স্যানিটাইজ করা হলো
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
    }).select('+password +refreshToken'); // 👈 ফিক্স: টোকেন সেভ করার জন্য রিড করা হলো

    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Account temporarily locked due to too many failed attempts. Please try again after 15 minutes.' 
      });
    } else if (user.lockUntil && user.lockUntil <= Date.now()) {
      user.loginAttempts = 0;
      user.lockUntil = null;
      await user.save();
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

    res.status(200).json({
      status: 'success',
      data: {
        user: sanitizeUser(user), // 👈 ফিক্স: স্যানিটাইজ করা হলো
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
        data: { user: sanitizeUser(user), token: newAccessToken, refreshToken: refreshToken }, // 👈 ফিক্স
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
      data: { user: sanitizeUser(user), token: newAccessToken, refreshToken: refreshToken }, // 👈 ফিক্স
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
// 4. Forget Password (OTP Flow with Brevo)
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

    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = "Password Reset OTP";
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Password Reset Request</h2>
        <p>Your OTP for resetting your password is:</p>
        <h1 style="color: #007bff; letter-spacing: 5px;">${otp}</h1>
        <p>This OTP is valid for <strong>10 minutes</strong>.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `;
    
    sendSmtpEmail.sender = { "name": "Guti Chat", "email": "mike.2000.tysn@gmail.com" }; 
    sendSmtpEmail.to = [{ "email": user.email }];

    try {
      await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ OTP Email successfully sent to ${user.email} via Brevo`);
      res.status(200).json({ status: 'success', message: 'OTP sent to email successfully' });
    } catch (err) {
      console.error('❌ Brevo Email Error:', err.response ? err.response.body : err);
      
      user.resetPasswordOTP = undefined;
      user.resetPasswordExpire = undefined;
      user.resetPasswordAttempts = 0; 
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({ status: 'error', message: 'Email could not be sent. Please try again later.' });
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
    
    user.loginAttempts = 0;
    user.lockUntil = null;

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
    // 👈 ফিক্স: রেসপন্স পাঠানোর আগে স্যানিটাইজ করা হলো
    res.status(200).json({ status: 'success', data: sanitizeUser(req.user) });
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
    
    // 👈 ফিক্স ৩: select: false এর কারণে টোকেনটি এক্সপ্লিসিটলি রিড করতে হবে
    const user = await User.findById(decoded.id).select('+refreshToken');
    
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
// 6. Update Password (Change Password)
// ==========================================

const updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Old password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ status: 'error', message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    if (user.authProvider !== 'local') {
      return res.status(400).json({ 
        status: 'error', 
        message: `Your account is managed by ${user.authProvider}. Password change is not applicable.` 
      });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ status: 'error', message: 'New password cannot be the same as the old password' });
    }

    user.password = newPassword;
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
  updatePassword 
};