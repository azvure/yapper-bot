const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WeeklyRoles = require('../models/WeeklyRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('See who holds the weekly roles right now'),

  async execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guild.id;

    const latest = await WeeklyRoles.findOne({ guildId }).sort({ week: -1 });
    if (!latest || latest.awards.length === 0) {
      return interaction.editReply('No weekly roles have been awarded yet.');
    }

    const embed = new EmbedBuilder()
      .setTitle('Current Weekly Role Holders')
      .setColor(0x00b894)
      .setTimestamp();

    embed.setDescription(latest.awards.map(a => `${a.roleName} — <@${a.userId}>`).join('\n'));
    embed.setFooter({ text: `Awarded week of ${latest.week.toLocaleDateString('en-AU')}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
