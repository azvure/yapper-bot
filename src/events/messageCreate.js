const { incrementStat } = require('../utils/statsHelper');
const { GuessWho } = require('../models/GuessWho');
const config = require('../../config');

// Media attachment MIME type prefixes
const MEDIA_TYPES = ['image/', 'video/', 'audio/'];

function isMediaAttachment(attachment) {
  if (!attachment.contentType) return false;
  return MEDIA_TYPES.some(t => attachment.contentType.startsWith(t));
}

function isLateNight(date) {
  const hour = date.getUTCHours();
  return hour >= 16 && hour < 21; // 16–21 UTC = midnight–5am AEST
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const { guild, author, attachments } = message;
    const guildId = guild.id;
    const userId = author.id;
    const username = author.username;

    // Always count message
    await incrementStat(guildId, userId, username, 'messageCount');

    // Late night message
    if (isLateNight(message.createdAt)) {
      await incrementStat(guildId, userId, username, 'lateNightMessages');
    }

    // Media attachments
    const mediaFiles = attachments.filter(a => isMediaAttachment(a));
    if (mediaFiles.size > 0) {
      await incrementStat(guildId, userId, username, 'mediaCount', mediaFiles.size);
    }

    // --- Sync out-of-context channel quotes into DB ---
    if (config.OUT_OF_CONTEXT_CHANNEL && message.channelId === config.OUT_OF_CONTEXT_CHANNEL) {
      // Only save if there's text content or a media attachment
      const hasContent = message.content.trim().length > 0;
      const mediaAttachment = attachments.find(a => isMediaAttachment(a));

      if (hasContent || mediaAttachment) {
        const existing = await GuessWho.findOne({ messageId: message.id });
        if (!existing) {
          let attachmentType = null;
          if (mediaAttachment) {
            const ct = mediaAttachment.contentType || '';
            if (ct.startsWith('image/')) attachmentType = 'image';
            else if (ct.startsWith('video/')) attachmentType = 'video';
            else if (ct.startsWith('audio/')) attachmentType = 'audio';
          }

          await GuessWho.create({
            guildId,
            messageId: message.id,
            channelId: message.channelId,
            authorId: author.id,
            authorUsername: author.username,
            content: message.content.trim(),
            attachmentUrl: mediaAttachment ? mediaAttachment.url : null,
            attachmentType,
          });
        }
      }
    }
  },
};
