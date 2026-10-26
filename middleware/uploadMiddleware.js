const cloudinary = require('../config/cloudinaryConfig');

const generateSignature = async (req, res, next) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // ফাইল ফরম্যাট রুলস (Frontend এ দেখানোর জন্য)
    const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4'];
    const maxFileSize = 20 * 1024 * 1024; 

    // Security Fix: ফোল্ডার হাইজ্যাকিং বন্ধ
    if (!req.user || !req.user._id) {
      return res.status(401).json({ status: 'error', message: 'User not authenticated' });
    }
    const secureFolder = `e2ee_app_uploads/${req.user._id}`;

    // 👈 Signature-তে allowed_formats যুক্ত করা হলো (upload_preset বাদ দেওয়া হলো)
    const paramsToSign = {
      timestamp: timestamp,
      folder: secureFolder, 
      allowed_formats: allowedFormats.join(','), // 👈 নতুন যোগ করা হলো
      type: 'authenticated', 
    };

    // ক্রিপ্টোগ্রাফিক সিগনেচার তৈরি
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      status: 'success',
      data: {
        signature,
        timestamp,
        folder: paramsToSign.folder,
        type: 'authenticated', 
        allowedFormats, 
        maxFileSize, 
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      },
    });
  } catch (error) {
    console.error('Cloudinary Signature Error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate signature' });
  }
};

module.exports = { generateSignature };