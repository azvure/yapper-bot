const VoiceSession = require('../models/VoiceSession');
const { getWeekStart } = require('../utils/statsHelper');

async function reconcileActiveSessions(client) {
  console.log('[VC] Reconciling active sessions on startup...');
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch();
      for (const member of guild.members.cache.values()) {
        if (member.user.bot || !member.voice.channel) continue;

        const existing = await VoiceSession.findOne({
          guildId: guild.id,
          userId: member.id,
          active: true,
        });

        if (!existing) {
          await VoiceSession.create({
            guildId: guild.id,
            userId: member.id,
            username: member.user.username,
            joinedAt: new Date(),
            week: getWeekStart(),
            active: true,
          });
          console.log(`[VC] Reconciled session for ${member.user.username}`);
        }
      }
    } catch (err) {
      console.error(`[VC] Reconciliation error in guild ${guild.id}:`, err);
    }
  }
  console.log('[VC] Reconciliation complete');
}

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const member =
      newState.member ||
      oldState.member ||
      (await guild.members.fetch(newState.id || oldState.id).catch(() => null));

    if (!member || member.user.bot) return;

    const guildId = guild.id;
    const userId = member.id;

    const joined = !oldState.channelId && newState.channelId;
    const left = oldState.channelId && !newState.channelId;

    if (joined) {
      // Avoid duplicate active sessions
      const existing = await VoiceSession.findOne({ guildId, userId, active: true });
      if (!existing) {
        await VoiceSession.create({
          guildId,
          userId,
          username: member.user.username,
          joinedAt: new Date(),
          week: getWeekStart(),
          active: true,
        });
      }
    }

    if (left) {
      const session = await VoiceSession.findOne({ guildId, userId, active: true });
      if (!session) return;

      const leftAt = new Date();
      const durationSeconds = Math.floor((leftAt - session.joinedAt) / 1000);

      if (durationSeconds < 10) {
        // Too short, discard
        await session.deleteOne();
        return;
      }

      session.leftAt = leftAt;
      session.durationSeconds = durationSeconds;
      session.active = false;
      await session.save();
    }
  },

  reconcileActiveSessions,
};