const cron = require('node-cron');
const {
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../../config');
const { GuessWho, GuessWhoRound } = require('../models/GuessWho');
const { getWeekStart } = require('../utils/statsHelper');

async function postGuessWho(client) {
  const guildId = process.env.GUILD_ID;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return console.error('[GuessWho] Guild not found');

  const channel = guild.channels.cache.get(config.GUESS_WHO_CHANNEL);
  if (!channel) return console.error('[GuessWho] Channel not found');

  await GuessWhoRound.updateMany({ guildId, closed: false }, { closed: true, closedAt: new Date() });

  const unused = await GuessWho.aggregate([
    { $match: { guildId, used: false } },
    { $sample: { size: 1 } },
  ]);

  if (!unused || unused.length === 0) {
    return channel.send('No unused quotes left in the vault. Add more to the out-of-context channel.');
  }

  const quote = unused[0];

  await guild.members.fetch();
  const humanMembers = guild.members.cache.filter(m => !m.user.bot);

  if (humanMembers.size < 2) {
    return channel.send('Not enough members to run a guess-who poll.');
  }

  const options = [...humanMembers.values()]
    .slice(0, 25)
    .map(m => new StringSelectMenuOptionBuilder()
      .setLabel(m.displayName.slice(0, 100))
      .setValue(m.id)
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId('guesswho:PLACEHOLDER')
    .setPlaceholder('Who said this?')
    .addOptions(options);

  const closeButton = new ButtonBuilder()
    .setCustomId('guesswho_close:PLACEHOLDER')
    .setLabel('Close Round (Admin)')
    .setStyle(ButtonStyle.Danger);

  const embed = new EmbedBuilder()
    .setTitle('Guess Who Said This?')
    .setColor(0x6c5ce7)
    .setTimestamp()
    .setFooter({ text: '0 votes so far — reveal on Monday' });

  if (quote.content) {
    embed.setDescription(`> ${quote.content.split('\n').join('\n> ')}`);
  }

  if (quote.attachmentUrl) {
    if (quote.attachmentType === 'image') {
      embed.setImage(quote.attachmentUrl);
    } else {
      embed.addFields({ name: 'Media', value: `[Click to view](${quote.attachmentUrl})` });
    }
  }

  const weekStart = getWeekStart();
  const round = await GuessWhoRound.create({
    guildId,
    quoteId: quote._id,
    authorId: quote.authorId,
    authorUsername: quote.authorUsername,
    votes: [],
    week: weekStart,
  });

  select.setCustomId(`guesswho:${round._id}`);
  closeButton.setCustomId(`guesswho_close:${round._id}`);

  const msg = await channel.send({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(closeButton),
    ],
  });

  round.discordMessageId = msg.id;
  await round.save();

  await GuessWho.findByIdAndUpdate(quote._id, { used: true, usedAt: new Date() });

  console.log(`[GuessWho] Posted round ${round._id}`);
}

async function closeRound(roundId, guild, channel) {
  const round = await GuessWhoRound.findById(roundId);
  if (!round || round.closed) return null;

  round.closed = true;
  round.closedAt = new Date();
  await round.save();

  const tally = {};
  for (const vote of round.votes) {
    if (!tally[vote.guessedUserId]) tally[vote.guessedUserId] = { count: 0 };
    tally[vote.guessedUserId].count++;
  }

  const sorted = Object.entries(tally).sort((a, b) => b[1].count - a[1].count);

  const authorMember = await guild.members.fetch(round.authorId).catch(() => null);
  const authorName = authorMember ? authorMember.displayName : round.authorUsername;

  const resultsEmbed = new EmbedBuilder()
    .setTitle('Round Closed')
    .setColor(0xf39c12)
    .setTimestamp();

  resultsEmbed.addFields({
    name: 'It was said by',
    value: `<@${round.authorId}> (${authorName})`,
  });

  if (sorted.length > 0) {
    const voteLines = await Promise.all(
      sorted.slice(0, 10).map(async ([userId, data]) => {
        const m = await guild.members.fetch(userId).catch(() => null);
        const name = m ? m.displayName : userId;
        const isAuthor = userId === round.authorId;
        return `${isAuthor ? '[correct]' : '[wrong]'} ${name} — ${data.count} vote${data.count !== 1 ? 's' : ''}`;
      })
    );
    resultsEmbed.addFields({ name: 'Vote Breakdown', value: voteLines.join('\n') });
  } else {
    resultsEmbed.addFields({ name: 'Votes', value: 'Nobody voted this round.' });
  }

  const winner = sorted[0];
  if (winner) {
    const winnerMember = await guild.members.fetch(winner[0]).catch(() => null);
    const winnerName = winnerMember ? winnerMember.displayName : winner[0];
    resultsEmbed.addFields({
      name: 'Most Voted',
      value: `<@${winner[0]}> (${winnerName}) with ${winner[1].count} vote${winner[1].count !== 1 ? 's' : ''} — in the running for Quote Icon this week.`,
    });
  }

  // Disable original message components
  try {
    const origMsg = await channel.messages.fetch(round.discordMessageId);
    if (origMsg) {
      const disabledSelect = new StringSelectMenuBuilder()
        .setCustomId('guesswho:closed')
        .setPlaceholder('This round is closed')
        .setDisabled(true)
        .addOptions([new StringSelectMenuOptionBuilder().setLabel('Closed').setValue('closed')]);
      const disabledButton = new ButtonBuilder()
        .setCustomId('guesswho_close:closed')
        .setLabel('Round Closed')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
      await origMsg.edit({
        components: [
          new ActionRowBuilder().addComponents(disabledSelect),
          new ActionRowBuilder().addComponents(disabledButton),
        ],
      });
    }
  } catch { /* message deleted */ }

  await channel.send({ embeds: [resultsEmbed] });

  return { round, winner: winner ? { userId: winner[0], count: winner[1].count } : null };
}

module.exports = function scheduleGuessWho(client) {
  cron.schedule(config.GUESS_WHO_CRON, () => postGuessWho(client), { timezone: 'UTC' });
  console.log(`[Cron] Guess-who scheduled: ${config.GUESS_WHO_CRON}`);
};

module.exports.run = postGuessWho;
module.exports.closeRound = closeRound;
