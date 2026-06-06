const mongoose = require('mongoose');

const lifetimeStatsSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  totalMessages: { type: Number, default: 0 },
  totalMediaSent: { type: Number, default: 0 },
  totalVcSeconds: { type: Number, default: 0 },
  totalReactionsGiven: { type: Number, default: 0 },
  totalLateNightMessages: { type: Number, default: 0 },
  rolesWon: {
    MEDIA_KING: { type: Number, default: 0 },
    VC_GOBLIN: { type: Number, default: 0 },
    CHATTERBOX: { type: Number, default: 0 },
    NIGHT_OWL: { type: Number, default: 0 },
    REACTION_LORD: { type: Number, default: 0 },
    QUOTE_ICON: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
});

lifetimeStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('LifetimeStats', lifetimeStatsSchema);