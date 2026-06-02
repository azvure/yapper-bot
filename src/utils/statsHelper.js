const WeeklyStats = require('../models/WeeklyStats');
const VoiceSession = require('../models/VoiceSession');
const WeeklyRoles = require('../models/WeeklyRoles');
const config = require('../../config');

/**
 * Returns the Monday 00:00:00 UTC of the week containing `date`.
 */
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get or create the WeeklyStats document for the current week.
 */
async function getCurrentWeekStats(guildId) {
  const weekStart = getWeekStart();
  let doc = await WeeklyStats.findOne({ guildId, weekStart });
  if (!doc) {
    doc = await WeeklyStats.create({ guildId, weekStart, members: [] });
  }
  return doc;
}

/**
 * Upsert a member's stats for the current week.
 */
async function incrementStat(guildId, userId, username, field, amount = 1) {
  const weekStart = getWeekStart();
  await WeeklyStats.findOneAndUpdate(
    { guildId, weekStart, 'members.userId': userId },
    { $inc: { [`members.$.${field}`]: amount } },
    { new: true }
  ).then(async result => {
    if (!result) {
      // Member not yet in this week's stats — add them
      await WeeklyStats.findOneAndUpdate(
        { guildId, weekStart },
        {
          $push: {
            members: { userId, username, [field]: amount },
          },
          $setOnInsert: { weekStart },
        },
        { upsert: true, new: true }
      );
    }
  });
}

/**
 * Aggregate VC session durations into the current week's stats.
 */
async function syncVcStats(guildId) {
  const weekStart = getWeekStart();
  const sessions = await VoiceSession.find({ guildId, week: weekStart, leftAt: { $ne: null } });

  const totals = {};
  for (const s of sessions) {
    if (!totals[s.userId]) totals[s.userId] = { username: s.username, secs: 0 };
    totals[s.userId].secs += s.durationSeconds;
  }

  for (const [userId, data] of Object.entries(totals)) {
    const weekDoc = await WeeklyStats.findOne({ guildId, weekStart });
    if (!weekDoc) continue;
    const member = weekDoc.members.find(m => m.userId === userId);
    if (member) {
      member.vcSeconds = data.secs;
    } else {
      weekDoc.members.push({ userId, username: data.username, vcSeconds: data.secs });
    }
    await weekDoc.save();
  }
}

/**
 * Get the top member for a given stat field.
 * Returns { userId, username, value } or null.
 */
function getTopMember(members, field) {
  if (!members || members.length === 0) return null;
  const sorted = [...members].sort((a, b) => (b[field] || 0) - (a[field] || 0));
  const top = sorted[0];
  if (!top || !top[field]) return null;
  return { userId: top.userId, username: top.username, value: top[field] };
}

/**
 * Format VC seconds into a human-readable string.
 */
function formatDuration(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Ensure a Discord role exists (create if not). Returns the Role object.
 */
async function ensureRole(guild, roleName, color = 0x5865f2) {
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color,
      reason: 'Weekly award role (auto-created)',
      mentionable: true,
    });
  }
  return role;
}

/**
 * Strip all weekly award roles from all members, then award new ones.
 */
async function rotateWeeklyRoles(guild, winners) {
  const roleNames = Object.values(config.ROLES);

  // Fetch all members
  await guild.members.fetch();

  // Remove all current weekly role holders
  for (const roleName of roleNames) {
    const role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) continue;
    for (const [, member] of role.members) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  const awards = [];

  // Award new roles
  for (const [roleKey, winner] of Object.entries(winners)) {
    if (!winner) continue;
    const roleName = config.ROLES[roleKey];
    const roleColor = ROLE_COLORS[roleKey] || 0x5865f2;
    const role = await ensureRole(guild, roleName, roleColor);
    const member = guild.members.cache.get(winner.userId);
    if (member) {
      await member.roles.add(role).catch(() => {});
      awards.push({
        roleKey,
        roleName,
        roleId: role.id,
        userId: winner.userId,
        username: winner.username,
        stat: winner.value,
      });
    }
  }

  return awards;
}

const ROLE_COLORS = {
  MEDIA_KING: 0xff6b9d,
  VC_GOBLIN: 0x4ecdc4,
  CHATTERBOX: 0xffe66d,
  NIGHT_OWL: 0x6c5ce7,
  REACTION_LORD: 0xfd79a8,
  QUOTE_ICON: 0x00b894,
};

module.exports = {
  getWeekStart,
  getCurrentWeekStats,
  incrementStat,
  syncVcStats,
  getTopMember,
  formatDuration,
  ensureRole,
  rotateWeeklyRoles,
  ROLE_COLORS,
};
