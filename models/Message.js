const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinaryConfig'); 

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      default: null,
      index: true,
    },
    messageType: {
      type: String,
      enum: {
        values: ['text', 'image', 'video'],
        message: '{VALUE} is not a valid message type',
      },
      default: 'text',
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
    },
    
    mediaPublicId: { type: String, default: null }, 
    isMediaDeleted: { type: Boolean, default: false },

    isDisappearing: {
      type: Boolean,
      default: false,
    },
    timerInSeconds: {
      type: Number,
      default: 0,
      min: [0, 'Timer cannot be negative'],
    },
    expireAt: {
      type: Date,
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // 👈 নতুন যোগ করা হলো: Delete for Me ফিচারের জন্য
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        type: {
          type: String,
          enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry'],
          required: true,
        },
      },
    ],
  },
  { timestamps: true }
);

messageSchema.pre('validate', function () {
  if (!this.receiver && !this.groupId) {
    throw new Error('Message must have either a receiver or a groupId');
  }
  if (this.receiver && this.groupId) {
    throw new Error('Message cannot target both a receiver and a group');
  }
});

messageSchema.pre('save', function () {
  if (this.isDisappearing && this.timerInSeconds > 0 && !this.expireAt) {
    this.expireAt = new Date(Date.now() + this.timerInSeconds * 1000);
  }
});

messageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ groupId: 1, createdAt: -1 });

// 👈 Cascade Media Deletion Hooks
messageSchema.pre('deleteOne', { document: true, query: false }, async function () {
  if (this.mediaPublicId && !this.isMediaDeleted) {
    try {
      await cloudinary.uploader.destroy(this.mediaPublicId);
      console.log(`🗑️ Cloudinary media deleted for message: ${this.mediaPublicId}`);
    } catch (err) {
      console.error(`❌ Failed to delete Cloudinary media:`, err);
    }
  }
});

messageSchema.pre('findOneAndDelete', async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc && doc.mediaPublicId && !doc.isMediaDeleted) {
    try {
      await cloudinary.uploader.destroy(doc.mediaPublicId);
      console.log(`🗑️ Cloudinary media deleted for message (findOneAndDelete): ${doc.mediaPublicId}`);
    } catch (err) {
      console.error(`❌ Failed to delete Cloudinary media:`, err);
    }
  }
});

module.exports = mongoose.model('Message', messageSchema);