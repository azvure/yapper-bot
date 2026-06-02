const { incrementStat } = require('../utils/statsHelper');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    // Fetch partial reactions
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }

    const guildId = reaction.message.guild.id;
    await incrementStat(guildId, user.id, user.username, 'reactionsGiven');
  },
};
