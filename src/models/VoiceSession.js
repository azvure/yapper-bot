const mongoose = require('mongoose');

const voiceSessionSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },

  userId: {
    type: String,
    required: true,
  },

  username: {
    type: String,
    required: true,
  },

  joinedAt: {
    type: Date,
    required: true,
  },

  leftAt: {
    type: Date,
  },

  durationSeconds: {
    type: Number,
    default: 0,
  },

  active: {
    type: Boolean,
    default: true,
  },

  week: {
    type: Date,
    required: true,
  },
});

voiceSessionSchema.index({
  guildId: 1,
  userId: 1,
  active: 1,
});

voiceSessionSchema.index({
  guildId: 1,
  week: 1,
  userId: 1,
});

voiceSessionSchema.index({
  guildId: 1,
  active: 1,
});

module.exports = mongoose.model('VoiceSession', voiceSessionSchema);