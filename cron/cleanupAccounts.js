const cron = require('node-cron');
const { User, Post, Message, Group } = require('../models');
const cloudinary = require('../config/cloudinaryConfig');

const startAccountCleanupJob = () => {
  // 👈 প্রতি ঘণ্টায় একবার চেক করবে (যেমন: 1:00, 2:00, 3:00...)
  cron.schedule('0 * * * *', async () => {
    console.log('⏳ Running Auto Account Deletion Job...');
    try {
      // যেসব ইউজারের ডিলিট হওয়ার ২৪ ঘণ্টা পার হয়ে গেছে
      const usersToDelete = await User.find({
        isDeletionScheduled: true,
        deletionScheduledAt: { $lte: new Date() },
      });

      if (usersToDelete.length === 0) return;

      for (const user of usersToDelete) {
        console.log(`🗑️ Permanently deleting user: ${user.username} (${user._id})`);

        // ১. ইউজারের সব পোস্ট এবং ক্লাউডিনারি ফাইল ডিলিট
        const userPosts = await Post.find({ user: user._id });
        for (const post of userPosts) {
          if (post.mediaPublicId) {
            try { await cloudinary.uploader.destroy(post.mediaPublicId); } catch (err) {}
          }
        }
        await Post.deleteMany({ user: user._id });

        // ২. ইউজারের সব মেসেজ এবং ক্লাউডিনারি ফাইল ডিলিট
        const userMessages = await Message.find({ sender: user._id });
        for (const msg of userMessages) {
          if (msg.mediaPublicId) {
            try { await cloudinary.uploader.destroy(msg.mediaPublicId); } catch (err) {}
          }
        }
        await Message.deleteMany({ sender: user._id });

        // ৩. গ্রুপ থেকে ইউজারকে রিমুভ করা 
        const userGroups = await Group.find({ members: user._id });
        for (const group of userGroups) {
          group.members = group.members.filter((m) => m.toString() !== user._id.toString());
          group.encryptedGroupKeys = group.encryptedGroupKeys.filter((k) => k.user.toString() !== user._id.toString());

          // যদি গ্রুপের ক্রিয়েটর ডিলিট হয়ে যায়
          if (group.creator.toString() === user._id.toString()) {
            if (group.members.length > 0) {
              group.creator = group.members[0]; // পরের জনকে ক্রিয়েটর বানানো
            } else {
              await group.deleteOne(); // কেউ না থাকলে গ্রুপ ডিলিট
              continue;
            }
          }
          await group.save();
        }

        // ৪. অন্যান্য ইউজারদের ফ্রেন্ডলিস্ট, রিকোয়েস্ট ও ব্লকলিস্ট থেকে রিমুভ করা
        await User.updateMany(
          {},
          {
            $pull: {
              friends: user._id,
              friendRequests: user._id,
              blockedUsers: user._id,
            },
          }
        );

        // ৫. সবশেষে ইউজারের অ্যাকাউন্ট ডিলিট করা
        await User.findByIdAndDelete(user._id);
        console.log(`✅ User ${user.username} deleted completely from database.`);
      }
    } catch (error) {
      console.error('❌ Account Cleanup Job Error:', error);
    }
  });
};

module.exports = startAccountCleanupJob;