const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const WeeklyStats = require('../models/WeeklyStats');
const WeeklyRoles = require('../models/WeeklyRoles');
const { GuessWhoRound } = require('../models/GuessWho');
const { closeRound } = require('./guessWho');

const {
  getWeekStartFromOffset,
  getTopMember,
  formatDuration,
  rotateWeeklyRoles,
  syncVcStats,
} = require('../utils/statsHelper');

async function runWeeklyAnnouncement(client, force = false) {
  const guildId = process.env.GUILD_ID;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return console.error('[Weekly] Guild not found');

  const announceCh = guild.channels.cache.get(config.ANNOUNCEMENTS_CHANNEL);
  if (!announceCh) return console.error('[Weekly] Announcements channel not found');

  const guessCh = guild.channels.cache.get(config.GUESS_WHO_CHANNEL);

  await syncVcStats(guildId);

  // ✅ CLEAN WEEK SYSTEM (NO DATE DRIFT)
  const lastWeekStart = getWeekStartFromOffset(1);

  const stats = await WeeklyStats.findOne({
    guildId,
    weekStart: lastWeekStart,
  });

  if (!stats) {
    return announceCh.send(
      `No weekly stats found for week starting ${lastWeekStart.toISOString().split('T')[0]}`
    );
  }

  if (!stats.members.length) {
    return announceCh.send('Weekly stats exist but no activity was recorded.');
  }

  if (stats.announced && !force) return;

  const members = stats.members;

  const mediaKing = getTopMember(members, 'mediaCount');
  const vcGoblin = getTopMember(members, 'vcSeconds');
  const chatterbox = getTopMember(members, 'messageCount');
  const nightOwl = getTopMember(members, 'lateNightMessages');
  const reactionLord = getTopMember(members, 'reactionsGiven');

  const openRounds = await GuessWhoRound.find({
    guildId,
    closed: false,
  });

  for (const r of openRounds) {
    if (guessCh) {
      await closeRound(r._id.toString(), guild, guessCh);
    } else {
      await GuessWhoRound.findByIdAndUpdate(r._id, {
        closed: true,
        closedAt: new Date(),
      });
    }
  }

  // optional (kept simple, no broken date math)
  const weekRounds = await GuessWhoRound.find({
    guildId,
    closed: true,
  });

  const roundWins = {};

  for (const round of weekRounds) {
    const tally = {};

    for (const vote of round.votes) {
      tally[vote.guessedUserId] =
        (tally[vote.guessedUserId] || 0) + 1;
    }

    const winner = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])[0];

    if (!winner) continue;

    roundWins[winner[0]] =
      (roundWins[winner[0]] || 0) + 1;
  }

  const topQuote = Object.entries(roundWins)
    .sort((a, b) => b[1] - a[1])[0];

  const quoteIcon = topQuote
    ? {
        userId: topQuote[0],
        username:
          guild.members.cache.get(topQuote[0])?.user.username ||
          topQuote[0],
        value: topQuote[1],
      }
    : null;

  const winners = {
    MEDIA_KING: mediaKing,
    VC_GOBLIN: vcGoblin,
    CHATTERBOX: chatterbox,
    NIGHT_OWL: nightOwl,
    REACTION_LORD: reactionLord,
    QUOTE_ICON: quoteIcon,
  };

  const awards = await rotateWeeklyRoles(guild, winners);

  const weekEnd = new Date(
    lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000
  );

  const fmt = d =>
    d.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Australia/Sydney',
    });

  const embed = new EmbedBuilder()
    .setTitle('Weekly Wrap-Up')
    .setDescription(
      `Week of ${fmt(lastWeekStart)} to ${fmt(weekEnd)}`
    )
    .setColor(0xf39c12)
    .setTimestamp();

  embed.addFields({
    name: "Winners",
    value: [
      mediaKing && `Media King: <@${mediaKing.userId}>`,
      vcGoblin && `VC Goblin: <@${vcGoblin.userId}>`,
      chatterbox && `Chatterbox: <@${chatterbox.userId}>`,
      nightOwl && `Night Owl: <@${nightOwl.userId}>`,
      reactionLord && `Reaction Lord: <@${reactionLord.userId}>`,
      quoteIcon && `Quote Icon: <@${quoteIcon.userId}>`,
    ].filter(Boolean).join('\n'),
  });

  await announceCh.send({ embeds: [embed] });

  stats.announced = true;
  stats.weekEnd = weekEnd;
  await stats.save();

  await WeeklyRoles.create({
    guildId,
    week: lastWeekStart,
    awards,
  });

  console.log('[Weekly] Sent:', lastWeekStart.toISOString());
}

module.exports = function scheduleWeeklyAnnouncement(client) {
  cron.schedule(
    config.WEEKLY_CRON,
    () => runWeeklyAnnouncement(client),
    { timezone: 'UTC' }
  );
};

module.exports.run = runWeeklyAnnouncement;
