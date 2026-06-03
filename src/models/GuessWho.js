const mongoose = require('mongoose');

const guessWhoSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  authorId: { type: String, required: true },
  authorUsername: { type: String, required: true },
  content: { type: String, default: '' },
  attachmentUrl: { type: String, default: null },
  attachmentType: { type: String, default: null },
  used: { type: Boolean, default: false },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

guessWhoSchema.index({ guildId: 1, used: 1 });

const guessWhoRoundSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  quoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuessWho' },
  discordMessageId: { type: String },
  authorId: { type: String, required: true },
  authorUsername: { type: String, required: true },
  votes: [{
    userId: String,
    username: String,
    guessedUserId: String,
  }],
  closed: { type: Boolean, default: false },
  closedAt: { type: Date },
  week: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

guessWhoRoundSchema.index({ guildId: 1, closed: 1 });

module.exports = {
  GuessWho: mongoose.model('GuessWho', guessWhoSchema),
  GuessWhoRound: mongoose.model('GuessWhoRound', guessWhoRoundSchema),
};