const express = require('express');
const cloudinary = require('../config/cloudinaryConfig'); 
// 👈 নতুন যোগ করা হলো: ডেটাবেস চেকের জন্য মডেল ইমপোর্ট
const { Post, Message, Group } = require('../models'); 
const { generateSignature } = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// শুধুমাত্র লগইন করা ইউজাররা সিগনেচার জেনারেট করতে পারবে
router.use(protect);

router.get('/upload-signature', generateSignature);

// Private Media-র জন্য Signed URL জেনারেটর
router.get('/sign-url/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const userId = req.user._id;

    // 👈 নতুন যোগ করা হলো: IDOR Protection (Access Check)
    let hasAccess = false;

    // ১. চেক করা হচ্ছে ফাইলটি কোনো পোস্টে আছে কিনা
    const post = await Post.findOne({ mediaPublicId: publicId }).populate('user', 'friends');
    if (post) {
      if (post.user._id.toString() === userId.toString()) {
        hasAccess = true; // নিজের পোস্ট
      } else if (post.visibility === 'public') {
        hasAccess = true; // পাবলিক পোস্ট
      } else if (post.visibility === 'friends') {
        // ফ্রেন্ডলিস্টে আছে কিনা চেক
        if (post.user.friends.map(f => f.toString()).includes(userId.toString())) {
          hasAccess = true; 
        }
      }
    }

    // ২. চেক করা হচ্ছে ফাইলটি কোনো মেসেজে আছে কিনা (যদি পোস্টে না থাকে)
    if (!hasAccess) {
      const message = await Message.findOne({ mediaPublicId: publicId });
      if (message) {
        if (message.sender.toString() === userId.toString() || 
           (message.receiver && message.receiver.toString() === userId.toString())) {
          hasAccess = true; // ১-অন-১ চ্যাটের সেন্ডার বা রিসিভার
        } else if (message.groupId) {
          const group = await Group.findById(message.groupId);
          if (group && group.members.map(m => m.toString()).includes(userId.toString())) {
            hasAccess = true; // গ্রুপের মেম্বার
          }
        }
      }
    }

    // যদি কোনো এক্সেস না থাকে, তবে ৪০৩ রেসপন্স
    if (!hasAccess) {
      return res.status(403).json({ status: 'error', message: 'Unauthorized to access this media file.' });
    }

    // 👈 অ্যাক্সেস ভেরিফাই হলেই কেবল সাইনড URL তৈরি হবে
    const signedUrl = cloudinary.url(publicId, {
      type: 'authenticated',
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // ১ ঘণ্টা ভ্যালিড থাকবে
    });

    res.status(200).json({ status: 'success', data: { url: signedUrl } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to generate signed URL' });
  }
});

module.exports = router;