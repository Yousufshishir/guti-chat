const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinaryConfig'); // 👈 নতুন যোগ করা হলো

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Post creator is required'],
      index: true,
    },
    textContent: {
      type: String,
      trim: true,
      default: '',
      maxlength: [2000, 'Text content cannot exceed 2000 characters'],
    },
    mediaUrl: {
      type: String,
      default: '',
    },
    mediaType: {
      type: String,
      enum: {
        values: ['image', 'video', 'none'],
        message: '{VALUE} is not a valid media type',
      },
      default: 'none',
    },
    // 👈 নতুন যোগ করা হলো: ক্লাউডিনারি ফাইল ডিলিট করার জন্য
    mediaPublicId: {
      type: String,
      default: null,
    },
    // 👈 Multiple Reactions System
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
    visibility: {
      type: String,
      enum: {
        values: ['public', 'friends'],
        message: '{VALUE} is not a valid visibility option',
      },
      default: 'friends',
    },
  },
  { timestamps: true }
);

postSchema.pre('validate', function () {
  const hasText = this.textContent && this.textContent.trim().length > 0;
  const hasMedia = this.mediaUrl && this.mediaType !== 'none';

  if (!hasText && !hasMedia) {
    throw new Error('Post must contain either text content or media');
  }
});

postSchema.index({ user: 1, createdAt: -1 });
postSchema.index({ visibility: 1, createdAt: -1 });

// 👈 নতুন যোগ করা হলো: Cascade Media Deletion Hooks
postSchema.pre('deleteOne', { document: true, query: false }, async function () {
  if (this.mediaPublicId) {
    try {
      await cloudinary.uploader.destroy(this.mediaPublicId);
      console.log(`🗑️ Cloudinary media deleted for post: ${this.mediaPublicId}`);
    } catch (err) {
      console.error(`❌ Failed to delete Cloudinary media:`, err);
    }
  }
});

postSchema.pre('findOneAndDelete', async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc && doc.mediaPublicId) {
    try {
      await cloudinary.uploader.destroy(doc.mediaPublicId);
      console.log(`🗑️ Cloudinary media deleted for post (findOneAndDelete): ${doc.mediaPublicId}`);
    } catch (err) {
      console.error(`❌ Failed to delete Cloudinary media:`, err);
    }
  }
});

module.exports = mongoose.model('Post', postSchema);