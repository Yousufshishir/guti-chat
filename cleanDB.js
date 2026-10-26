require('dotenv').config();
const mongoose = require('mongoose');

const cleanDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🛡️ Connected to MongoDB...');

    // সব কালেকশন ড্রপ করা
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      await collection.drop();
      console.log(`🗑️ Dropped collection: ${collection.collectionName}`);
    }

    console.log('✅ Database completely cleaned!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
    process.exit(1);
  }
};

cleanDatabase();