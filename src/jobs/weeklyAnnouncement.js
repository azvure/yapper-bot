const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const WeeklyStats = require('../models/WeeklyStats');
const WeeklyRoles = require('../models/WeeklyRoles');
const { GuessWhoRound } = require('../models/GuessWho');
const { closeRound } = require('./guessWho');
const {
  getLastWeekStart,
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

  // Always announce last week's stats (the week that just ended)
  const lastWeekStart = getLastWeekStart();

  const stats = await WeeklyStats.findOne({ guildId, weekStart: lastWeekStart });
  if (!stats || stats.members.length === 0) {
    return announceCh.send('No data collected this week.');
  }

  // Skip if already announced unless forced via /announce
  if (stats.announced && !force) return;

  const members = stats.members;

  const mediaKing    = getTopMember(members, 'mediaCount');
  const vcGoblin     = getTopMember(members, 'vcSeconds');
  const chatterbox   = getTopMember(members, 'messageCount');
  const nightOwl     = getTopMember(members, 'lateNightMessages');
  const reactionLord = getTopMember(members, 'reactionsGiven');

  // Close any still-open guess-who rounds before tallying
  const openRounds = await GuessWhoRound.find({ guildId, closed: false });
  for (const openRound of openRounds) {
    if (guessCh) {
      await closeRound(openRound._id.toString(), guild, guessCh);
    } else {
      await GuessWhoRound.findByIdAndUpdate(openRound._id, { closed: true, closedAt: new Date() });
    }
  }

  // Quote Icon = person who received the most votes across all rounds this week
  const weekRounds = await GuessWhoRound.find({ guildId, week: lastWeekStart, closed: true });
  const voteTally = {};
  for (const round of weekRounds) {
    for (const vote of round.votes) {
      if (!voteTally[vote.guessedUserId]) voteTally[vote.guessedUserId] = { count: 0 };
      voteTally[vote.guessedUserId].count++;
    }
  }

  await guild.members.fetch();
  const topVoted = Object.entries(voteTally).sort((a, b) => b[1].count - a[1].count)[0];
  const quoteIcon = topVoted
    ? {
        userId: topVoted[0],
        username: guild.members.cache.get(topVoted[0])?.user.username || topVoted[0],
        value: topVoted[1].count,
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

  const weekEnd = new Date(lastWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
  const fmt = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });

  const embed = new EmbedBuilder()
    .setTitle('Weekly Wrap-Up')
    .setDescription(`Week of ${fmt(lastWeekStart)} to ${fmt(weekEnd)}. Roles have been updated.`)
    .setColor(0xf39c12)
    .setTimestamp();

  const championLines = [
    mediaKing    && `Media King — <@${mediaKing.userId}> (${mediaKing.value} files)`,
    vcGoblin     && `VC Goblin — <@${vcGoblin.userId}> (${formatDuration(vcGoblin.value)})`,
    chatterbox   && `Chatterbox — <@${chatterbox.userId}> (${chatterbox.value} messages)`,
    nightOwl     && `Night Owl — <@${nightOwl.userId}> (${nightOwl.value} late-night messages)`,
    reactionLord && `Reaction Lord — <@${reactionLord.userId}> (${reactionLord.value} reactions)`,
    quoteIcon    && `Quote Icon — <@${quoteIcon.userId}> (${quoteIcon.value} votes)`,
  ].filter(Boolean);

  embed.addFields({
    name: 'This Week\'s Winners',
    value: championLines.join('\n') || 'No winners this week.',
  });

  const top3 = [...members]
    .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
    .slice(0, 3);

  if (top3.length > 0) {
    embed.addFields({
      name: 'Top Chatters',
      value: top3.map((m, i) =>
        `${i + 1}. <@${m.userId}> — ${m.messageCount || 0} messages, ${formatDuration(m.vcSeconds)} VC`
      ).join('\n'),
    });
  }

  embed.setFooter({ text: 'Stats reset every Monday. Roles last one week.' });

  await announceCh.send({ embeds: [embed] });

  stats.announced = true;
  stats.weekEnd = weekEnd;
  await stats.save();

  await WeeklyRoles.create({ guildId, week: lastWeekStart, awards });

  console.log('[Weekly] Announcement sent for', lastWeekStart.toISOString().split('T')[0]);
}

module.exports = function scheduleWeeklyAnnouncement(client) {
  cron.schedule(config.WEEKLY_CRON, () => runWeeklyAnnouncement(client), { timezone: 'UTC' });
  console.log(`[Cron] Weekly announcement scheduled: ${config.WEEKLY_CRON}`);
};

module.exports.run = runWeeklyAnnouncement;
