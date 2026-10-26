// সাধারণ এবং জনপ্রিয় ডিসপোজেবল ইমেইল ডোমেইনের লিস্ট
const disposableDomains = [
  'mailinator.com', 'yopmail.com', 'tempmail.com', '10minutemail.com', 
  'trashmail.com', 'guerrillamail.com', 'sharklasers.com', 'getnada.com',
  'dispostable.com', 'maildrop.cc', 'temp-mail.org', 'fakeinbox.com'
];

const isDisposableEmail = (email) => {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableDomains.includes(domain);
};

module.exports = { isDisposableEmail };