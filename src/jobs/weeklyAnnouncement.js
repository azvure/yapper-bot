const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const WeeklyStats = require('../models/WeeklyStats');
const WeeklyRoles = require('../models/WeeklyRoles');
const { GuessWhoRound } = require('../models/GuessWho');
const {
  getWeekStart,
  getTopMember,
  formatDuration,
  rotateWeeklyRoles,
  syncVcStats,
} = require('../utils/statsHelper');

async function runWeeklyAnnouncement(client, options = {}) {
  const guildId = process.env.GUILD_ID;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return console.error('[Weekly] Guild not found');

  const channelId = config.ANNOUNCEMENTS_CHANNEL;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return console.error('[Weekly] Announcements channel not found');

  // Sync VC totals before announcing
  await syncVcStats(guildId);

  const weekStart = getWeekStart();
  // When running via cron (auto), pull last week. When running via /announce command, use current week unless --previous flag set.
  const queryWeekStart = options.previous ? (() => { const d = new Date(weekStart); d.setUTCDate(d.getUTCDate() - 7); return d; })() : weekStart;

  const stats = await WeeklyStats.findOne({ guildId, weekStart: queryWeekStart });
  if (!stats || stats.members.length === 0) {
    return channel.send('📊 No data collected this week. Get chatting!');
  }

  // When running via cron, prevent duplicate announcements
  if (!options.previous && stats.announced) return;

  const members = stats.members;

  // --- Determine winners ---
  const mediaKing   = getTopMember(members, 'mediaCount');
  const vcGoblin    = getTopMember(members, 'vcSeconds');
  const chatterbox  = getTopMember(members, 'messageCount');
  const nightOwl    = getTopMember(members, 'lateNightMessages');
  const reactionLord = getTopMember(members, 'reactionsGiven');

  // Guess-who winner: most votes cast in rounds this week
  const weekRounds = await GuessWhoRound.find({ guildId, week: queryWeekStart, closed: true });
  const guessScores = {};
  for (const round of weekRounds) {
    for (const vote of round.votes) {
      if (!guessScores[vote.userId]) guessScores[vote.userId] = { username: vote.username, count: 0 };
      guessScores[vote.userId].count++;
    }
  }
  const guessWinner = Object.entries(guessScores).sort((a, b) => b[1].count - a[1].count)[0];
  const quoteIcon = guessWinner
    ? { userId: guessWinner[0], username: guessWinner[1].username, value: guessWinner[1].count }
    : null;

  // --- Rotate roles ---
  const winners = { MEDIA_KING: mediaKing, VC_GOBLIN: vcGoblin, CHATTERBOX: chatterbox, NIGHT_OWL: nightOwl, REACTION_LORD: reactionLord, QUOTE_ICON: quoteIcon };
  const awards = await rotateWeeklyRoles(guild, winners);

  // --- Build embed ---
  const weekEndStr = new Date(queryWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
  const fmt = (d) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });

  const embed = new EmbedBuilder()
    .setTitle('🏆 Weekly Wrap-Up')
    .setDescription(`Here's how everyone did for the week of **${fmt(queryWeekStart)} – ${fmt(weekEndStr)}**.\nNew roles have been handed out. Let's go! 🎉`)
    .setColor(0xf39c12)
    .setTimestamp();

  const lines = [
    mediaKing    && ` **${config.ROLES.MEDIA_KING}** → <@${mediaKing.userId}> *(${mediaKing.value} files)*`,
    vcGoblin     && ` **${config.ROLES.VC_GOBLIN}** → <@${vcGoblin.userId}> *(${formatDuration(vcGoblin.value)})*`,
    chatterbox   && ` **${config.ROLES.CHATTERBOX}** → <@${chatterbox.userId}> *(${chatterbox.value} messages)*`,
    nightOwl     && ` **${config.ROLES.NIGHT_OWL}** → <@${nightOwl.userId}> *(${nightOwl.value} late-night msgs)*`,
    reactionLord && ` **${config.ROLES.REACTION_LORD}** → <@${reactionLord.userId}> *(${reactionLord.value} reactions)*`,
    quoteIcon    && ` **${config.ROLES.QUOTE_ICON}** → <@${quoteIcon.userId}> *(${quoteIcon.value} correct guesses)*`,
  ].filter(Boolean);

  embed.addFields({ name: '🎖️ This Week\'s Champions', value: lines.join('\n') || 'No winners this week!' });

  // Honourable mentions — top 3 by message count
  const top3 = [...members].sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0)).slice(0, 3);
  if (top3.length > 0) {
    const medals = ['🥇', '🥈', '🥉'];
    const honourable = top3.map((m, i) => `${medals[i]} <@${m.userId}> — ${m.messageCount || 0} messages, ${formatDuration(m.vcSeconds)} VC`).join('\n');
    embed.addFields({ name: '📊 Top Chatters', value: honourable });
  }

  embed.setFooter({ text: 'Stats reset every Monday • Roles are temporary' });

  await channel.send({ content: '@everyone', embeds: [embed] });

  // Close all open guess-who rounds for this week
  await GuessWhoRound.updateMany({ guildId, week: queryWeekStart, closed: false }, { closed: true, closedAt: new Date() });

  // Mark as announced & save week end
  stats.announced = true;
  stats.weekEnd = weekEndStr;
  await stats.save();

  // Save role records
  await WeeklyRoles.create({ guildId, week: queryWeekStart, awards });

  console.log('[Weekly] Announcement sent for week of', queryWeekStart.toISOString().split('T')[0]);
}

module.exports = function scheduleWeeklyAnnouncement(client) {
  cron.schedule(config.WEEKLY_CRON, () => runWeeklyAnnouncement(client, { previous: true }), {
    timezone: 'UTC',
  });
  console.log(`[Cron] Weekly announcement scheduled: ${config.WEEKLY_CRON}`);
};

// Export runner for manual triggering via /announce command
module.exports.run = runWeeklyAnnouncement;
