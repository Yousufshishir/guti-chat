const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [
        function () {
          return this.authProvider === 'local';
        },
        'Password is required for local accounts',
      ],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, 
    },
    authProvider: {
      type: String,
      enum: {
        values: ['local', 'google', 'phone'], 
        message: '{VALUE} is not a supported auth provider',
      },
      default: 'local',
    },
    resetPasswordOTP: String,
    resetPasswordExpire: Date,
    resetPasswordAttempts: { type: Number, default: 0 },

    loginAttempts: { type: Number, required: true, default: 0 },
    lockUntil: { type: Date, default: null },

    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
      maxlength: [200, 'Bio cannot exceed 200 characters'],
    },

    publicKey: { 
      type: String, 
      default: null 
    },

    encryptedPrivateKey: { 
      type: String, 
      default: null,
      select: false 
    },
    keyBackupSalt: { 
      type: String, 
      default: null,
      select: false 
    },

    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    friendRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    isPrivate: {
      type: Boolean,
      default: false,
    },
    isProfileLocked: {
      type: Boolean,
      default: false,
    },
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    mutedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    mutedGroups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
      },
    ],

    fcmToken: { 
      type: String, 
      default: null 
    },
    lastSeen: { 
      type: Date, 
      default: Date.now 
    },

    tokenVersion: { 
      type: Number, 
      default: 0 
    },

    // 👈 ফিক্স ১: এখানে select: false যোগ করা হলো
    refreshToken: { 
      type: String, 
      default: null,
      select: false 
    },

    backupSettings: {
      isBackupEnabled: { type: Boolean, default: true },
      backupFrequency: { type: String, enum: ['daily', 'weekly', 'manual'], default: 'daily' },
      lastBackupAt: { type: Date, default: null },
      googleDriveFolderId: { type: String, default: null },
    },

    isDeletionScheduled: { type: Boolean, default: false },
    deletionScheduledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ friends: 1 });
userSchema.index({ friendRequests: 1 });
userSchema.index({ blockedUsers: 1 });
userSchema.index({ mutedUsers: 1 });
userSchema.index({ mutedGroups: 1 });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshToken;
    delete ret.encryptedPrivateKey;
    delete ret.keyBackupSalt;
    delete ret.__v;
    return ret;
  },
});

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);