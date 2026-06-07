require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { GuessWho } = require('./models/GuessWho');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const MEDIA_TYPES = ['image/', 'video/', 'audio/'];

function isMediaAttachment(attachment) {
  if (!attachment.contentType) return false;
  return MEDIA_TYPES.some(t => attachment.contentType.startsWith(t));
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return console.error('Guild not found');

  const channel = guild.channels.cache.get(process.env.OUT_OF_CONTEXT_CHANNEL_ID);
  if (!channel) return console.error('Channel not found');

  console.log(`Scanning #${channel.name}...`);

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
      if (existing) {
        totalSkipped++;
        continue;
      }

      let attachmentType = null;
      if (mediaAttachment) {
        const ct = mediaAttachment.contentType || '';
        if (ct.startsWith('image/')) attachmentType = 'image';
        else if (ct.startsWith('video/')) attachmentType = 'video';
        else if (ct.startsWith('audio/')) attachmentType = 'audio';
      }

      await GuessWho.create({
        guildId: guild.id,
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
    console.log(`Scanned batch, saved ${totalSaved} so far...`);

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`Done! Saved ${totalSaved} quotes, skipped ${totalSkipped} duplicates.`);
  await mongoose.disconnect();
  process.exit(0);
});

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('Connected to MongoDB');
  client.login(process.env.DISCORD_TOKEN);
});