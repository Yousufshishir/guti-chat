const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');

// রুট ডিরেক্টরিতে থাকা firebase-service-account.json ফাইলটি রিকোয়ার করা হচ্ছে
const serviceAccount = require(path.resolve(__dirname, '../firebase-service-account.json'));

initializeApp({
  credential: cert(serviceAccount),
});

console.log('🔥 Firebase Admin SDK Initialized for FCM');

module.exports = { getMessaging };