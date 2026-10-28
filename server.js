require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io'); 
const rateLimit = require('express-rate-limit'); 
const mongoSanitize = require('@exortek/express-mongo-sanitize'); 
const helmet = require('helmet'); // 👈 নতুন ইমপোর্ট (সিকিউরিটি হেডার)

// 👈 নতুন যোগ করা হলো: Swagger Imports
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

require('./models');

/* -------------------------
   Routes Imports
------------------------- */
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const groupRoutes = require('./routes/groupRoutes');
const messageRoutes = require('./routes/messageRoutes');
const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const moodRoutes = require('./routes/moodRoutes');
const mediaRoutes = require('./routes/mediaRoutes'); 

const { chatSocket } = require('./sockets/chatSocket'); 
const startMediaCleanupJob = require('./cron/cleanupMedia'); 
const startAccountCleanupJob = require('./cron/cleanupAccounts'); 

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app); 

const io = new Server(server, {
  cors: {
    origin: '*', // প্রোডাকশনে গেলে এখানে আপনার ফ্রন্টএন্ড ডোমেইন দিবেন
    methods: ['GET', 'POST'],
  },
  // 👈 Socket.io DoS Protection (Connection Flooding ঠেকাতে)
  maxHttpBufferSize: 1e6, // ১ মেগাবাইট পেলোড লিমিট
  pingTimeout: 60000,    // ৬০ সেকেন্ড
  pingInterval: 25000,   // ২৫ সেকেন্ড
});

app.set('io', io);

/* -------------------------
   Global Middleware & Security
------------------------- */
app.use(helmet({ 
  contentSecurityPolicy: false, // 👈 নতুন যোগ করা হলো: Swagger UI-তে কন্টেন্ট লোড হতে দেয়ার জন্য
})); 
app.use(express.json({ limit: '2mb' })); 
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use(mongoSanitize({ replaceWith: '_' }));

// Rate Limiting 
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

/* -------------------------
   Health / Test Route
------------------------- */
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API is running 🚀',
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

/* -------------------------
   Routes Mounting
------------------------- */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/moods', moodRoutes);
app.use('/api/media', mediaRoutes); 

/* -------------------------
   Swagger API Documentation
------------------------- */
// 👈 নতুন যোগ করা হলো: Swagger UI এন্ডপয়েন্ট
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Zero-Knowledge E2EE Social Engine',
}));

// ✅ নতুন যোগ করা হলো: Swagger JSON Export Endpoint
// Browser/curl/Postman থেকে ডাউনলোড করা যাবে → AI-কে দেওয়ার জন্য perfect
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/* -------------------------
   404 Handler & Error Handler
------------------------- */
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  // 👈 PayloadTooLargeError হ্যান্ডেল করা
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', message: 'Payload too large. Maximum limit is 2MB.' });
  }

  console.error('❌ Unhandled Error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ status: 'error', message: 'Validation failed', errors: Object.values(err.errors).map(e => ({ field: e.path, message: e.message })) });
  }
  if (err.code === 11000) {
    return res.status(409).json({ status: 'error', message: `Duplicate value for field: ${Object.keys(err.keyValue).join(', ')}` });
  }
  res.status(err.statusCode || 500).json({ status: 'error', message: err.message || 'Internal Server Error' });
});

/* -------------------------
   Database Connection & Server Start
------------------------- */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: process.env.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`🛡️ MongoDB Cloud Connected Successfully! (host: ${conn.connection.host})`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  chatSocket(io);
  startMediaCleanupJob();
  startAccountCleanupJob(); 

  const runningServer = server.listen(PORT, () => {
    console.log(`🚀 Server & Socket.io listening on http://localhost:${PORT}`);
    console.log(`📚 Swagger UI:  http://localhost:${PORT}/api-docs`);       // ✅ নতুন log
    console.log(`📥 Swagger JSON: http://localhost:${PORT}/api-docs.json`);  // ✅ নতুন log
  });

  const shutdown = async (signal) => {
    console.log(`\n⚠️ ${signal} received. Shutting down gracefully...`);
    runningServer.close(async () => {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed. Bye!');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startServer();