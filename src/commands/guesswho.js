const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { run } = require('../jobs/guessWho');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guesswho')
    .setDescription('Post a new guess-who round (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await run(client);
      await interaction.editReply('✅ Guess-who round posted!');
    } catch (err) {
      console.error('[/guesswho]', err);
      await interaction.editReply('❌ Failed to post a round: ' + err.message);
    }
  },
};
