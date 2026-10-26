const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // ১. Ethereal টেস্ট অ্যাকাউন্ট তৈরি করা
  const testAccount = await nodemailer.createTestAccount();

  // ২. Transporter তৈরি করা
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  // ৩. মেইল অপশন সেট করা
  const mailOptions = {
    from: '"Chat App Support" <support@chatapp.com>',
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // ৪. মেইল পাঠানো
  const info = await transporter.sendMail(mailOptions);

  console.log('✉️ Message sent: %s', info.messageId);
  // 👈 এই লিংকটিতে ক্লিক করে আমরা মেইলের ভেতরে থাকা OTP দেখতে পাবো
  console.log('🔗 Preview URL: %s', nodemailer.getTestMessageUrl(info));
};

module.exports = sendEmail;