const VoiceSession = require('../models/VoiceSession');
const { getWeekStart } = require('../utils/statsHelper');

// In-memory map: guildId:userId -> joinedAt timestamp
const activeSessions = new Map();

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const userId = newState.id || oldState.id;
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user.bot) return;

    const guildId = guild.id;
    const key = `${guildId}:${userId}`;

    const joined = !oldState.channelId && newState.channelId;   // joined VC
    const left = oldState.channelId && !newState.channelId;     // left VC

    if (joined) {
      activeSessions.set(key, Date.now());
    } else if (left) {
      const joinTime = activeSessions.get(key);
      if (!joinTime) return;
      activeSessions.delete(key);

      const joinedAt = new Date(joinTime);
      const leftAt = new Date();
      const durationSeconds = Math.floor((leftAt - joinedAt) / 1000);

      // Only record sessions > 10 seconds (ignore accidental joins)
      if (durationSeconds < 10) return;

      await VoiceSession.create({
        guildId,
        userId,
        username: member.user.username,
        joinedAt,
        leftAt,
        durationSeconds,
        week: getWeekStart(joinedAt),
      });
    }
  },
};
