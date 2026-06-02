module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`[Bot] Logged in as ${client.user.tag}`);
    client.user.setActivity('👀 watching the chaos unfold');
  },
};
