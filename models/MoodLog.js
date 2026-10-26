// models/MoodLog.js
const mongoose = require('mongoose');

const moodLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    currentMood: {
      type: String,
      enum: {
        values: ['Happy', 'Sad', 'Angry', 'Missing You'],
        message: '{VALUE} is not a valid mood',
      },
      required: [true, 'Current mood is required'],
    },
  },
  { timestamps: true }
);

/* -------------------------
   Fast lookup: latest mood per user
------------------------- */
moodLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('MoodLog', moodLogSchema);