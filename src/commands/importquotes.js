const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { GuessWho } = require('../models/GuessWho');

const MEDIA_TYPES = ['image/', 'video/', 'audio/'];

function isMediaAttachment(a) {
  if (!a.contentType) return false;
  return MEDIA_TYPES.some(t => a.contentType.startsWith(t));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('importquotes')
    .setDescription('Import all historical quotes from out-of-context (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = client.channels.cache.get(process.env.OUT_OF_CONTEXT_CHANNEL_ID);
    if (!channel) return interaction.editReply('Could not find the out-of-context channel.');

    await interaction.editReply('Import started, this may take a while...');

    const guildId = interaction.guild.id;
    let lastId = null;
    let totalSaved = 0;
    let totalSkipped = 0;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      for (const message of messages.values()) {
        if (message.author.bot) continue;

        const hasContent = message.content.trim().length > 0;
        const mediaAttachment = message.attachments.find(a => isMediaAttachment(a));
        if (!hasContent && !mediaAttachment) continue;

        const existing = await GuessWho.findOne({ messageId: message.id });
        if (existing) { totalSkipped++; continue; }

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
          authorId: message.author.id,
          authorUsername: message.author.username,
          content: message.content.trim(),
          attachmentUrl: mediaAttachment ? mediaAttachment.url : null,
          attachmentType,
        });

        totalSaved++;
      }

      lastId = messages.last().id;
      await new Promise(r => setTimeout(r, 1000));
    }

    await interaction.followUp({
      content: `Done! Saved ${totalSaved} quotes, skipped ${totalSkipped} duplicates.`,
      flags: 64,
    });
  },
};