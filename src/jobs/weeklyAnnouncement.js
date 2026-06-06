const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const WeeklyStats = require('../models/WeeklyStats');
const WeeklyRoles = require('../models/WeeklyRoles');
const { GuessWhoRound } = require('../models/GuessWho');
const { closeRound } = require('./guessWho');
const {
  getLastWeekStart,
  getWeekStart,
  getTopMember,
  formatDuration,
  rotateWeeklyRoles,
  syncVcStats,
  updateLifetimeStats,
} = require('../utils/statsHelper');

async function runWeeklyAnnouncement(client, force = false) {
  const guildId = process.env.GUILD_ID;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return console.error('[Weekly] Guild not found');

  const announceCh = guild.channels.cache.get(config.ANNOUNCEMENTS_CHANNEL);
  if (!announceCh) return console.error('[Weekly] Announcements channel not found');

  const guessCh = guild.channels.cache.get(config.GUESS_WHO_CHANNEL);

  // Sync voice stats for the week being announced
  await syncVcStats(guildId);

  // When force-triggered, announce current week; otherwise announce last week
  const announceWeek = force ? getWeekStart() : getLastWeekStart();

  const stats = await WeeklyStats.findOne({ guildId, weekStart: announceWeek });
  if (!stats || stats.members.length === 0) {
    return announceCh.send('❌ No stats collected for this week yet. Come back when there\'s more activity!');
  }

  // Skip if already announced unless forced via /announce
  if (stats.announced && !force) return;

  const members = stats.members;

  // Find top members per category
  const mediaKing    = getTopMember(members, 'mediaCount');
  const vcGoblin     = getTopMember(members, 'vcSeconds');
  const chatterbox   = getTopMember(members, 'messageCount');
  const nightOwl     = getTopMember(members, 'lateNightMessages');
  const reactionLord = getTopMember(members, 'reactionsGiven');

  // Close any still-open guess-who rounds and tally votes
  const openRounds = await GuessWhoRound.find({ guildId, closed: false });
  for (const openRound of openRounds) {
    if (guessCh) {
      await closeRound(openRound._id.toString(), guild, guessCh).catch(console.error);
    } else {
      await GuessWhoRound.findByIdAndUpdate(openRound._id, { closed: true, closedAt: new Date() });
    }
  }

  // Quote Icon = most-voted person in guess-who for this week
  const weekRounds = await GuessWhoRound.find({ guildId, week: announceWeek, closed: true });
  const voteTally = {};
  for (const round of weekRounds) {
    for (const vote of round.votes) {
      if (!voteTally[vote.guessedUserId]) voteTally[vote.guessedUserId] = 0;
      voteTally[vote.guessedUserId]++;
    }
  }

  const quoteIconEntry = Object.entries(voteTally).sort((a, b) => b[1] - a[1])[0];
  const quoteIcon = quoteIconEntry
    ? {
        userId: quoteIconEntry[0],
        username: guild.members.cache.get(quoteIconEntry[0])?.user.username || 'Unknown',
        value: quoteIconEntry[1],
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
await updateLifetimeStats(guildId, members, awards);

  // Build date range
  const weekEnd = new Date(announceWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
  const fmtDate = (d) =>
    d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });

  // Build the announcement embed
  const embed = new EmbedBuilder()
    .setTitle('🏆 Weekly Wrap-Up')
    .setDescription(
      `Here's how everyone did for the week of **${fmtDate(announceWeek)} – ${fmtDate(weekEnd)}**. New roles have been handed out. Let's go! 🎉`
    )
    .setColor(0xf39c12)
    .setTimestamp();

  // Champions section
  const championLines = [
    mediaKing && `🖼️ **Media King** — <@${mediaKing.userId}> (${mediaKing.value} files)`,
    vcGoblin && `🎙️ **VC Goblin** — <@${vcGoblin.userId}> (${formatDuration(vcGoblin.value)})`,
    chatterbox && `💬 **Chatterbox** — <@${chatterbox.userId}> (${chatterbox.value} messages)`,
    nightOwl && `🌙 **Night Owl** — <@${nightOwl.userId}> (${nightOwl.value} late-night)`,
    reactionLord && `👍 **Reaction Lord** — <@${reactionLord.userId}> (${reactionLord.value} reactions)`,
    quoteIcon && `❓ **Quote Icon** — <@${quoteIcon.userId}>`,
  ].filter(Boolean);

  if (championLines.length > 0) {
    embed.addFields({
      name: 'This Week\'s Champions',
      value: championLines.join('\n'),
    });
  } else {
    embed.addFields({
      name: 'This Week\'s Champions',
      value: 'No clear winners this week — keep the competition going! 💪',
    });
  }

  // Top Chatters section (honorable mentions)
  const top3Chatters = [...members]
    .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
    .slice(0, 3);

  if (top3Chatters.length > 0) {
    const chatterLines = top3Chatters.map((m, i) => {
      const medal = ['🥇', '🥈', '🥉'][i];
      return `${medal} <@${m.userId}> — ${m.messageCount || 0} messages, ${formatDuration(m.vcSeconds)} VC`;
    });
    embed.addFields({
      name: 'Top Chatters',
      value: chatterLines.join('\n'),
    });
  }

  // Footer
  embed.setFooter({
    text: `Stats reset every Monday • Roles are temporary • ${members.length} members tracked`,
  });

  await announceCh.send({ embeds: [embed] });

  // Mark announced and save
  stats.announced = true;
  stats.weekEnd = weekEnd;
  await stats.save();

  // Log the weekly roles assignment
  await WeeklyRoles.create({ guildId, week: announceWeek, awards });

  console.log('[Weekly] Announcement sent for week starting', announceWeek.toISOString().split('T')[0]);
}

module.exports = function scheduleWeeklyAnnouncement(client) {
  cron.schedule(config.WEEKLY_CRON, () => runWeeklyAnnouncement(client), { timezone: 'UTC' });
  console.log(`[Cron] Weekly announcement scheduled: ${config.WEEKLY_CRON}`);
};

module.exports.run = runWeeklyAnnouncement;
