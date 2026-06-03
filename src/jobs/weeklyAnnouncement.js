const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const WeeklyStats = require('../models/WeeklyStats');
const WeeklyRoles = require('../models/WeeklyRoles');
const { GuessWhoRound } = require('../models/GuessWho');
const { closeRound } = require('./guessWho');
const {
  getWeekStart,
  getTopMember,
  formatDuration,
  rotateWeeklyRoles,
  syncVcStats,
} = require('../utils/statsHelper');

async function runWeeklyAnnouncement(client, force = false) {
  const guildId = process.env.GUILD_ID;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error('[Weekly] Guild not found');
    return;
  }

  const announceCh = guild.channels.cache.get(config.ANNOUNCEMENTS_CHANNEL);
  if (!announceCh) {
    console.error('[Weekly] Announcements channel not found');
    return;
  }

  const guessCh = guild.channels.cache.get(config.GUESS_WHO_CHANNEL);

  await syncVcStats(guildId);

  const weekStart = getWeekStart();

  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

  const nextWeek = new Date(lastWeekStart);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

  const stats = await WeeklyStats.findOne({
    guildId,
    weekStart: {
      $gte: lastWeekStart,
      $lt: nextWeek,
    },
  });

  if (!stats) {
    return announceCh.send(
      `No weekly stats document found for week starting ${lastWeekStart.toISOString().split('T')[0]}.`
    );
  }

  if (stats.members.length === 0) {
    return announceCh.send('Weekly stats exist but no member activity was recorded.');
  }

  if (stats.announced && !force) {
    return;
  }

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

  for (const openRound of openRounds) {
    if (guessCh) {
      await closeRound(openRound._id.toString(), guild, guessCh);
    } else {
      await GuessWhoRound.findByIdAndUpdate(openRound._id, {
        closed: true,
        closedAt: new Date(),
      });
    }
  }

  const weekRounds = await GuessWhoRound.find({
    guildId,
    closed: true,
    week: {
      $gte: lastWeekStart,
      $lt: nextWeek,
    },
  });

  const roundWins = {};

  for (const round of weekRounds) {
    const tally = {};

    for (const vote of round.votes) {
      tally[vote.guessedUserId] =
        (tally[vote.guessedUserId] || 0) + 1;
    }

    const majorityWinner = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])[0];

    if (!majorityWinner) continue;

    const winnerUserId = majorityWinner[0];

    roundWins[winnerUserId] =
      (roundWins[winnerUserId] || 0) + 1;
  }

  await guild.members.fetch();

  const topQuoteWinner = Object.entries(roundWins)
    .sort((a, b) => b[1] - a[1])[0];

  const quoteIcon = topQuoteWinner
    ? {
        userId: topQuoteWinner[0],
        username:
          guild.members.cache.get(topQuoteWinner[0])?.user.username ||
          topQuoteWinner[0],
        value: topQuoteWinner[1],
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
      `Week of ${fmt(lastWeekStart)} to ${fmt(weekEnd)}. Roles have been updated.`
    )
    .setColor(0xf39c12)
    .setTimestamp();

  const championLines = [
    mediaKing &&
      `${config.ROLES.MEDIA_KING} — <@${mediaKing.userId}> (${mediaKing.value} files)`,

    vcGoblin &&
      `${config.ROLES.VC_GOBLIN} — <@${vcGoblin.userId}> (${formatDuration(
        vcGoblin.value
      )})`,

    chatterbox &&
      `${config.ROLES.CHATTERBOX} — <@${chatterbox.userId}> (${chatterbox.value} messages)`,

    nightOwl &&
      `${config.ROLES.NIGHT_OWL} — <@${nightOwl.userId}> (${nightOwl.value} late-night messages)`,

    reactionLord &&
      `${config.ROLES.REACTION_LORD} — <@${reactionLord.userId}> (${reactionLord.value} reactions)`,

    quoteIcon &&
      `${config.ROLES.QUOTE_ICON} — <@${quoteIcon.userId}> (${quoteIcon.value} round wins)`,
  ].filter(Boolean);

  embed.addFields({
    name: "This Week's Winners",
    value: championLines.join('\n') || 'No winners this week.',
  });

  const top3 = [...members]
    .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
    .slice(0, 3);

  if (top3.length > 0) {
    const medals = ['1.', '2.', '3.'];

    embed.addFields({
      name: 'Top Chatters',
      value: top3
        .map(
          (m, i) =>
            `${medals[i]} <@${m.userId}> — ${m.messageCount || 0} messages, ${formatDuration(
              m.vcSeconds
            )} VC`
        )
        .join('\n'),
    });
  }

  embed.setFooter({
    text: 'Stats reset every Monday. Roles last one week.',
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

  console.log(
    '[Weekly] Announcement sent for',
    lastWeekStart.toISOString().split('T')[0]
  );
}

module.exports = function scheduleWeeklyAnnouncement(client) {
  cron.schedule(
    config.WEEKLY_CRON,
    () => runWeeklyAnnouncement(client),
    { timezone: 'UTC' }
  );

  console.log(
    `[Cron] Weekly announcement scheduled: ${config.WEEKLY_CRON}`
  );
};

module.exports.run = runWeeklyAnnouncement;
