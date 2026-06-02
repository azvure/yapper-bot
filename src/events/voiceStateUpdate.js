const VoiceSession = require('../models/VoiceSession');
const { getWeekStart } = require('../utils/statsHelper');

/**
 * Startup reconciliation: create missing active VoiceSession documents
 * for members already in voice channels (handles Render restarts).
 */
async function reconcileActiveSessions(client) {
  console.log('[VC Reconciliation] Starting up...');
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
          console.log(
            `[VC Reconciliation] Created session for ${member.user.username} in ${guild.name}`
          );
        }
      }
    } catch (err) {
      console.error(`[VC Reconciliation] Error in guild ${guild.id}:`, err);
    }
  }
  console.log('[VC Reconciliation] Complete');
}

module.exports = {
  name: 'voiceStateUpdate',
  isReadyHandler: false,

  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const member =
      newState.member ||
      oldState.member ||
      (await guild.members.fetch(newState.id).catch(() => null));

    if (!member || member.user.bot) return;

    const guildId = guild.id;
    const userId = member.id;

    const joined = !oldState.channelId && newState.channelId;
    const left = oldState.channelId && !newState.channelId;

    if (joined) {
      const existing = await VoiceSession.findOne({
        guildId,
        userId,
        active: true,
      });

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
      const session = await VoiceSession.findOne({
        guildId,
        userId,
        active: true,
      });

      if (!session) return;

      const leftAt = new Date();

      session.leftAt = leftAt;
      session.durationSeconds = Math.floor(
        (leftAt - session.joinedAt) / 1000
      );
      session.active = false;

      if (session.durationSeconds >= 10) {
        await session.save();
      } else {
        await session.deleteOne();
      }
    }
  },

  reconcileActiveSessions,
};