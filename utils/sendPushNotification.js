const { getMessaging } = require('../config/firebaseConfig');
const { User } = require('../models');

const sendPushNotification = async (receiverId, senderName) => {
  try {
    const receiver = await User.findById(receiverId);
    if (!receiver || !receiver.fcmToken) return;

    // E2EE রুলস: শুধু নোটিফিকেশন টাইপ পাঠানো হবে, মেসেজের বডি বা কন্টেন্ট নয়
    const payload = {
      notification: {
        title: 'New Message',
        body: `${senderName} sent you a message.`,
      },
      data: {
        type: 'NEW_MESSAGE',
      },
      token: receiver.fcmToken,
    };

    await getMessaging().send(payload);
    console.log(`📲 Push Notification sent to ${receiver.username}`);
  } catch (error) {
    // FCM এরর হলে সার্ভার ক্র্যাশ করবে না, শুধু লগ করবে
    console.error('FCM Error:', error.message);
  }
};

module.exports = { sendPushNotification };