const jwt = require('jsonwebtoken');
const { User } = require('../models');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        res.status(401);
        throw new Error('Not authorized, user not found');
      }

      // 👈 চেক করা হচ্ছে টোকেনটি বাতিল (Logout) করা হয়েছে কিনা
      if (decoded.tokenVersion !== req.user.tokenVersion) {
        return res.status(401).json({ status: 'error', message: 'Session expired. Please login again.' });
      }

      next(); 
    } catch (error) {
      console.error('JWT Verification Error:', error.message);
      return res.status(401).json({ status: 'error', message: 'Not authorized, token failed or expired' });
    }
  }

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Not authorized, no token provided' });
  }
};

module.exports = { protect };