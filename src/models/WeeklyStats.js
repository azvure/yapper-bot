const mongoose = require('mongoose');

const memberStatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  mediaCount: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 },
  vcSeconds: { type: Number, default: 0 },
  reactionsGiven: { type: Number, default: 0 },
  lateNightMessages: { type: Number, default: 0 }, // midnight–5am
});

const weeklyStatsSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date },
  members: [memberStatSchema],
  announced: { type: Boolean, default: false },
});

weeklyStatsSchema.index({ guildId: 1, weekStart: -1 });

module.exports = mongoose.model('WeeklyStats', weeklyStatsSchema);
