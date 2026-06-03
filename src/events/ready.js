const { reconcileActiveSessions } = require('./voiceStateUpdate');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[Ready] Logged in as ${client.user.tag}`);
    client.user.setActivity('tracking the chaos');
    await reconcileActiveSessions(client);
  },
};