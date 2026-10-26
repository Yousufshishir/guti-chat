const cron = require('node-cron');
const { Message } = require('../models');
const cloudinary = require('../config/cloudinaryConfig');

const startMediaCleanupJob = () => {
  // প্রতি ১ মিনিটে একবার চেক করবে
  cron.schedule('* * * * *', async () => {
    try {
      // যেসব ডিসঅ্যাপিয়ারিং মেসেজের মিডিয়া ১ মিনিটের মধ্যে এক্সপায়ার হবে
      const soonToExpireMessages = await Message.find({
        isDisappearing: true,
        mediaPublicId: { $ne: null },
        isMediaDeleted: false,
        expireAt: { $lte: new Date(Date.now() + 60000) }, 
      });

      for (const msg of soonToExpireMessages) {
        try {
          await cloudinary.uploader.destroy(msg.mediaPublicId);
          msg.isMediaDeleted = true;
          await msg.save();
          console.log(`🗑️ Media deleted from Cloudinary (TTL): ${msg.mediaPublicId}`);
        } catch (err) {
          console.error(`Failed to delete media ${msg.mediaPublicId}:`, err);
        }
      }
    } catch (error) {
      console.error('Cron Job Error:', error);
    }
  });
};

module.exports = startMediaCleanupJob;