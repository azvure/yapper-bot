const cron = require('node-cron');
const {
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require('discord.js');
const config = require('../../config');
const { GuessWho, GuessWhoRound } = require('../models/GuessWho');
const { getWeekStart } = require('../utils/statsHelper');

async function postGuessWho(client) {
  const guildId = process.env.GUILD_ID;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return console.error('[GuessWho] Guild not found');

  const channelId = config.GUESS_WHO_CHANNEL;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return console.error('[GuessWho] Guess-who channel not found');

  // Close any previous open rounds
  await GuessWhoRound.updateMany({ guildId, closed: false }, { closed: true, closedAt: new Date() });

  // Pick a random unused quote
  const unused = await GuessWho.aggregate([
    { $match: { guildId, used: false } },
    { $sample: { size: 1 } },
  ]);

  if (!unused || unused.length === 0) {
    return channel.send('😔 No unused quotes left in the out-of-context-shit channel! Add more to <#' + (config.OUT_OF_CONTEXT_CHANNEL || 'out-of-context') + '>.');
  }

  const quote = unused[0];

  // Fetch all non-bot members
  await guild.members.fetch();
  const humanMembers = guild.members.cache.filter(m => !m.user.bot);

  if (humanMembers.size < 2) {
    return channel.send('❌ Not enough members to build a guess-who poll.');
  }

  // Build select menu options (max 25 per Discord limit)
  const options = humanMembers
    .map(m => new StringSelectMenuOptionBuilder()
      .setLabel(m.displayName.slice(0, 100))
      .setValue(m.id)
    )
    .slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`guesswho:PLACEHOLDER`) // replaced after round is saved
    .setPlaceholder('Who said this?')
    .addOptions(options);

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle('Guess Who Said This?')
    .setColor(0x6c5ce7)
    .setTimestamp()
    .setFooter({ text: '0 guesses so far' });

  if (quote.content) {
    embed.setDescription(`> ${quote.content.split('\n').join('\n> ')}`);
  }

  if (quote.attachmentUrl) {
    if (quote.attachmentType === 'image') {
      embed.setImage(quote.attachmentUrl);
    } else if (quote.attachmentType === 'video' || quote.attachmentType === 'audio') {
      embed.addFields({ name: '📎 Media attached', value: `[Click to view](${quote.attachmentUrl})` });
    }
  }

  // Create round in DB first so we have an ID
  const weekStart = getWeekStart();
  const round = await GuessWhoRound.create({
    guildId,
    quoteId: quote._id,
    correctUserId: quote.authorId,
    votes: [],
    week: weekStart,
  });

  // Update select menu custom ID with real round ID
  select.setCustomId(`guesswho:${round._id}`);
  const row = new ActionRowBuilder().addComponents(select);

  const msg = await channel.send({ embeds: [embed], components: [row] });

  // Save message ID to round
  round.discordMessageId = msg.id;
  await round.save();

  // Mark quote as used
  await GuessWho.findByIdAndUpdate(quote._id, { used: true, usedAt: new Date() });

  console.log(`[GuessWho] Posted round ${round._id} (quote by ${quote.authorUsername})`);
}

module.exports = function scheduleGuessWho(client) {
  cron.schedule(config.GUESS_WHO_CRON, () => postGuessWho(client), {
    timezone: 'UTC',
  });
  console.log(`[Cron] Guess-who scheduled: ${config.GUESS_WHO_CRON}`);
};

module.exports.run = postGuessWho;
