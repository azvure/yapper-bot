const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { GuessWho } = require('../models/GuessWho');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quotes')
    .setDescription('Manage the out-of-context quote vault')
    .addSubcommand(sub =>
      sub.setName('count').setDescription('See how many unused quotes are in the vault')
    )
    .addSubcommand(sub =>
      sub.setName('reset').setDescription('Mark all quotes as unused (recycles the vault)')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'count') {
      const unused = await GuessWho.countDocuments({ guildId, used: false });
      const total  = await GuessWho.countDocuments({ guildId });
      return interaction.editReply(`Quote vault: ${unused} unused / ${total} total`);
    }

    if (sub === 'reset') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply('You need Manage Server permission to do that.');
      }
      const result = await GuessWho.updateMany({ guildId, used: true }, { used: false, usedAt: null });
      return interaction.editReply(`Reset ${result.modifiedCount} quotes back to unused.`);
    }
  },
};
