require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.commands = new Collection();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', bot: client.user?.tag || 'not ready' });
});

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`[Commands] Loaded: ${command.data.name}`);
  }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  const eventName = event.name; // <-- fixed, removed clientReady swap
  if (event.once) {
    client.once(eventName, (...args) => event.execute(...args, client));
  } else {
    client.on(eventName, (...args) => event.execute(...args, client));
  }
  console.log(`[Events] Loaded: ${eventName}`);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[DB] Connected to MongoDB');
    app.listen(PORT, () => console.log(`[Web] Server on port ${PORT}`));
    return client.login(process.env.DISCORD_TOKEN);
  })
  .then(() => {
    require('./jobs/weeklyAnnouncement')(client);
    require('./jobs/guessWho')(client);
    console.log('[Cron] Jobs scheduled');
  })
  .catch(err => {
    console.error('[Startup] Fatal error:', err);
    process.exit(1);
  });
  

  app.get('/import-quotes', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'yapper123') return res.status(401).send('Unauthorized');

  res.send('Import started, check Render logs for progress...');

  const guildId = process.env.GUILD_ID;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return console.error('[Import] Guild not found');

  const channel = guild.channels.cache.get(process.env.OUT_OF_CONTEXT_CHANNEL_ID);
  if (!channel) return console.error('[Import] Channel not found');

  const MEDIA_TYPES = ['image/', 'video/', 'audio/'];
  function isMediaAttachment(a) {
    if (!a.contentType) return false;
    return MEDIA_TYPES.some(t => a.contentType.startsWith(t));
  }

  const { GuessWho } = require('./models/GuessWho');
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
    console.log(`[Import] Saved ${totalSaved} so far, skipped ${totalSkipped}...`);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[Import] Done! Saved ${totalSaved}, skipped ${totalSkipped}.`);
});