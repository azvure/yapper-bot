const { incrementStat } = require('../utils/statsHelper');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    if (user.bot) return;

    // Fetch partial reaction and message
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error('[Reactions] Failed to fetch partial reaction:', err);
        return;
      }
    }

    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch (err) {
        console.error('[Reactions] Failed to fetch partial message:', err);
        return;
      }
    }

    if (!reaction.message.guild) return;

    const guildId = reaction.message.guild.id;
    await incrementStat(guildId, user.id, user.username, 'reactionsGiven');
  },
};