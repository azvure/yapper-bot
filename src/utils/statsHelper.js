const WeeklyStats = require('../models/WeeklyStats');
const VoiceSession = require('../models/VoiceSession');
const config = require('../../config');

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function getCurrentWeekStats(guildId) {
  const weekStart = getWeekStart();
  let doc = await WeeklyStats.findOne({ guildId, weekStart });
  if (!doc) {
    doc = await WeeklyStats.create({ guildId, weekStart, members: [] });
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
        $push: { members: { userId, username, [field]: amount } },
        $setOnInsert: { weekStart },
      },
      { upsert: true, new: true }
    );
  }
}

async function syncVcStats(guildId) {
  const weekStart = getWeekStart();

  // Use active: false to find completed sessions (DB-persisted approach)
  const sessions = await VoiceSession.find({
    guildId,
    week: weekStart,
    active: false,
    durationSeconds: { $gt: 0 },
  });

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

function getTopMember(members, field) {
  if (!members || members.length === 0) return null;
  const sorted = [...members].sort((a, b) => (b[field] || 0) - (a[field] || 0));
  const top = sorted[0];
  if (!top || !top[field]) return null;
  return { userId: top.userId, username: top.username, value: top[field] };
}

function formatDuration(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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

async function rotateWeeklyRoles(guild, winners) {
  if (!guild.members.me.permissions.has('ManageRoles')) {
    console.warn(`[${guild.name}] Bot lacks ManageRoles permission`);
    return [];
  }

  const roleNames = Object.values(config.ROLES);
  await guild.members.fetch();

  for (const roleName of roleNames) {
    const role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) continue;
    if (guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
      console.warn(`[Roles] Bot role too low to manage "${roleName}"`);
      continue;
    }
    for (const [, member] of role.members) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  const awards = [];

  for (const [roleKey, winner] of Object.entries(winners)) {
    if (!winner) continue;
    const roleName = config.ROLES[roleKey];
    const roleColor = ROLE_COLORS[roleKey] || 0x5865f2;
    const role = await ensureRole(guild, roleName, roleColor);

    if (guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
      console.warn(`[Roles] Cannot assign "${roleName}" — bot role too low`);
      continue;
    }

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
