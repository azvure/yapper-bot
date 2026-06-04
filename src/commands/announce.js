const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { run } = require('../jobs/weeklyAnnouncement');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Trigger the weekly announcement now (admin only)')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 }); // MessageFlags.Ephemeral

    try {
      await run(client, true);
      await interaction.editReply(
        'Weekly announcement force-triggered.'
      );
    } catch (err) {
      console.error('[/announce]', err);
      await interaction.editReply(
        `Failed: ${err.message}`
      );
    }
  },
};
