const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WeeklyStats = require('../models/WeeklyStats');
const { getWeekStart, formatDuration } = require('../utils/statsHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('See this week\'s server stats')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Check a specific member\'s stats (leave blank for leaderboard)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;
    const weekStart = getWeekStart();
    const stats = await WeeklyStats.findOne({ guildId, weekStart });
    const target = interaction.options.getUser('user');

    if (target) {
      if (!stats) return interaction.editReply('No stats recorded yet this week.');
      const memberStats = stats.members.find(m => m.userId === target.id);
      if (!memberStats) return interaction.editReply(`No stats found for ${target.username} this week.`);

      const embed = new EmbedBuilder()
        .setTitle(`Stats for ${target.displayName || target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .setColor(0x5865f2)
        .addFields(
          { name: 'Messages', value: String(memberStats.messageCount || 0), inline: true },
          { name: 'Media Sent', value: String(memberStats.mediaCount || 0), inline: true },
          { name: 'VC Time', value: formatDuration(memberStats.vcSeconds), inline: true },
          { name: 'Reactions Given', value: String(memberStats.reactionsGiven || 0), inline: true },
          { name: 'Late Night Messages', value: String(memberStats.lateNightMessages || 0), inline: true },
        )
        .setFooter({ text: 'Week resets every Monday' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (!stats || stats.members.length === 0) {
      return interaction.editReply('No stats recorded yet this week. Get chatting!');
    }

    const members = stats.members;
    const top5Msg   = [...members].sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0)).slice(0, 5);
    const top5Media = [...members].sort((a, b) => (b.mediaCount || 0) - (a.mediaCount || 0)).slice(0, 3);
    const top5VC    = [...members].sort((a, b) => (b.vcSeconds || 0) - (a.vcSeconds || 0)).slice(0, 3);

    const fmt = (arr, field, formatter = v => String(v)) =>
      arr.map((m, i) => `${i + 1}. <@${m.userId}> — ${formatter(m[field] || 0)}`).join('\n') || 'No data';

    const embed = new EmbedBuilder()
      .setTitle('This Week\'s Leaderboard')
      .setColor(0xf39c12)
      .addFields(
        { name: 'Top Chatters', value: fmt(top5Msg, 'messageCount', v => `${v} messages`) },
        { name: 'Top Media', value: fmt(top5Media, 'mediaCount', v => `${v} files`) },
        { name: 'Top VC', value: fmt(top5VC, 'vcSeconds', formatDuration) },
      )
      .setFooter({ text: `${members.length} members tracked — resets Monday` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WeeklyStats = require('../models/WeeklyStats');
const { getWeekStart, formatDuration } = require('../utils/statsHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('See this week\'s server stats')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Check a specific member\'s stats (leave blank for leaderboard)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;
    const weekStart = getWeekStart();
    const stats = await WeeklyStats.findOne({ guildId, weekStart });
    const target = interaction.options.getUser('user');

    if (target) {
      if (!stats) return interaction.editReply('No stats recorded yet this week.');
      const memberStats = stats.members.find(m => m.userId === target.id);
      if (!memberStats) return interaction.editReply(`No stats found for ${target.username} this week.`);

      const embed = new EmbedBuilder()
        .setTitle(`Stats for ${target.displayName || target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .setColor(0x5865f2)
        .addFields(
          { name: 'Messages', value: String(memberStats.messageCount || 0), inline: true },
          { name: 'Media Sent', value: String(memberStats.mediaCount || 0), inline: true },
          { name: 'VC Time', value: formatDuration(memberStats.vcSeconds), inline: true },
          { name: 'Reactions Given', value: String(memberStats.reactionsGiven || 0), inline: true },
          { name: 'Late Night Messages', value: String(memberStats.lateNightMessages || 0), inline: true },
        )
        .setFooter({ text: 'Week resets every Monday' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (!stats || stats.members.length === 0) {
      return interaction.editReply('No stats recorded yet this week. Get chatting!');
    }

    const members = stats.members;
    const top5Msg   = [...members].sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0)).slice(0, 5);
    const top5Media = [...members].sort((a, b) => (b.mediaCount || 0) - (a.mediaCount || 0)).slice(0, 3);
    const top5VC    = [...members].sort((a, b) => (b.vcSeconds || 0) - (a.vcSeconds || 0)).slice(0, 3);

    const fmt = (arr, field, formatter = v => String(v)) =>
      arr.map((m, i) => `${i + 1}. <@${m.userId}> — ${formatter(m[field] || 0)}`).join('\n') || 'No data';

    const embed = new EmbedBuilder()
      .setTitle('This Week\'s Leaderboard')
      .setColor(0xf39c12)
      .addFields(
        { name: 'Top Chatters', value: fmt(top5Msg, 'messageCount', v => `${v} messages`) },
        { name: 'Top Media', value: fmt(top5Media, 'mediaCount', v => `${v} files`) },
        { name: 'Top VC', value: fmt(top5VC, 'vcSeconds', formatDuration) },
      )
      .setFooter({ text: `${members.length} members tracked — resets Monday` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
