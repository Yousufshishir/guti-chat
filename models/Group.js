const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      maxlength: [100, 'Group name cannot exceed 100 characters'],
    },
    groupIcon: {
      type: String,
      default: '',
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Group creator is required'],
      index: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // 👈 নতুন যোগ করা হলো: E2EE Group Key Management
    encryptedGroupKeys: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        encryptedKey: { type: String }, // মেম্বারের পাবলিক কী দিয়ে এনক্রিপ্ট করা সিমেট্রিক কী
      }
    ],
  },
  { timestamps: true }
);

/* -------------------------
   Ensure creator is always a member
------------------------- */
groupSchema.pre('save', function () {
  if (this.isNew && this.creator) {
    const creatorId = this.creator.toString();
    const exists = this.members.some((m) => m.toString() === creatorId);
    if (!exists) {
      this.members.push(this.creator);
    }
  }
});

groupSchema.index({ members: 1 });
groupSchema.index({ creator: 1, createdAt: -1 });

module.exports = mongoose.model('Group', groupSchema);