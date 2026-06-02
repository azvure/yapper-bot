require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`[Commands] Loaded: ${command.data.name}`);
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  const eventName = event.name === 'ready' ? 'clientReady' : event.name;
  if (event.once) {
    client.once(eventName, (...args) => event.execute(...args, client));
  } else {
    client.on(eventName, (...args) => event.execute(...args, client));
  }
  console.log(`[Events] Loaded: ${eventName}`);
}

// Connect to MongoDB then login
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[DB] Connected to MongoDB');
    return client.login(process.env.DISCORD_TOKEN);
  })
  .then(() => {
    // VC reconciliation and cron jobs will start after clientReady event fires
    require('./jobs/weeklyAnnouncement')(client);
    require('./jobs/guessWho')(client);
    console.log('[Cron] Jobs scheduled');
  })
  .catch(err => {
    console.error('[Fatal]', err);
    process.exit(1);
  });
