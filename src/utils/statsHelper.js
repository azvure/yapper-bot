const WeeklyStats = require('../models/WeeklyStats');
const VoiceSession = require('../models/VoiceSession');
const config = require('../../config');

/**
 * Always returns Monday 00:00:00 UTC
 */
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();

  const diff = day === 0 ? -6 : 1 - day;

  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);

  return d;
}

/**
 * SAFE week offset (THIS FIXES YOUR BUG)
 */
function getWeekStartFromOffset(offsetWeeks = 0, date = new Date()) {
  const d = getWeekStart(date);
  d.setUTCDate(d.getUTCDate() - offsetWeeks * 7);
  return d;
}

async function getCurrentWeekStats(guildId) {
  const weekStart = getWeekStart();

  let doc = await WeeklyStats.findOne({ guildId, weekStart });

  if (!doc) {
    doc = await WeeklyStats.create({
      guildId,
      weekStart,
      members: [],
    });
  }

  return doc;
}

async function incrementStat(guildId, userId, username, field, amount = 1) {
  const weekStart = getWeekStart();

  const result = await WeeklyStats.findOneAndUpdate(
    { guildId, weekStart, 'members.userId': userId },
    { $inc: { [`members.$.${field}`]: amount } },
    { new: true }
  );

  if (!result) {
    await WeeklyStats.findOneAndUpdate(
      { guildId, weekStart },
      {
        $push: {
          members: {
            userId,
            username,
            [field]: amount,
          },
        },
        $setOnInsert: { weekStart },
      },
      { upsert: true, new: true }
    );
  }
}

async function syncVcStats(guildId) {
  const weekStart = getWeekStart();

  const sessions = await VoiceSession.find({
    guildId,
    week: weekStart,
    active: false,
    durationSeconds: { $gt: 0 },
  });

  const totals = {};

  for (const s of sessions) {
    if (!totals[s.userId]) {
      totals[s.userId] = {
        username: s.username,
        secs: 0,
      };
    }
    totals[s.userId].secs += s.durationSeconds;
  }

  const weekDoc = await WeeklyStats.findOne({ guildId, weekStart });

  if (!weekDoc) return;

  for (const [userId, data] of Object.entries(totals)) {
    const member = weekDoc.members.find(m => m.userId === userId);

    if (member) {
      member.vcSeconds = data.secs;
    } else {
      weekDoc.members.push({
        userId,
        username: data.username,
        vcSeconds: data.secs,
      });
    }
  }

  await weekDoc.save();
}

function getTopMember(members, field) {
  if (!members?.length) return null;

  const sorted = [...members].sort(
    (a, b) => (b[field] || 0) - (a[field] || 0)
  );

  const top = sorted[0];
  if (!top || !top[field]) return null;

  return {
    userId: top.userId,
    username: top.username,
    value: top[field],
  };
}

function formatDuration(seconds) {
  if (!seconds) return '0m';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function rotateWeeklyRoles(guild, winners) {
  const awards = [];

  for (const [key, winner] of Object.entries(winners)) {
    if (!winner) continue;

    const roleName = config.ROLES[key];
    if (!roleName) continue;

    // Find or create the role
    let role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      role = await guild.roles.create({
        name: roleName,
        reason: 'Weekly award role',
      });
    }

    // Get the winning member
    const member = await guild.members.fetch(winner.userId).catch(() => null);
    if (member) {
      try {
        await member.roles.add(role);
      } catch (err) {
        console.error(`[rotateWeeklyRoles] Failed to add role to ${winner.username}:`, err.message);
      }
    }

    awards.push({
      roleKey: key,
      roleName,
      roleId: role.id,
      userId: winner.userId,
      username: winner.username,
      value: winner.value,
    });
  }

  return awards;
}

module.exports = {
  getWeekStart,
  getWeekStartFromOffset,
  getCurrentWeekStats,
  incrementStat,
  syncVcStats,
  getTopMember,
  formatDuration,
  rotateWeeklyRoles,
};
