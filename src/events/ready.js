const { reconcileActiveSessions } = require('./voiceStateUpdate');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[Ready] Bot logged in as ${client.user.tag}`);
    await reconcileActiveSessions(client);
  },
};
