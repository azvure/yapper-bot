const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WeeklyStats = require('../models/WeeklyStats');
const VoiceSession = require('../models/VoiceSession');
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

    // Get all active VC sessions and calculate live time
    const activeSessions = await VoiceSession.find({ guildId, active: true });
    const liveVcSeconds = {};
    const now = new Date();
    for (const session of activeSessions) {
      const liveSeconds = Math.floor((now - session.joinedAt) / 1000);
      liveVcSeconds[session.userId] = liveSeconds;
    }

    // Helper to get total vc seconds including live time
    function getTotalVc(memberStats) {
      const stored = memberStats.vcSeconds || 0;
      const live = liveVcSeconds[memberStats.userId] || 0;
      return stored + live;
    }

    if (target) {
      if (!stats) return interaction.editReply('No stats recorded yet this week.');
      const memberStats = stats.members.find(m => m.userId === target.id);
      if (!memberStats) return interaction.editReply(`No stats found for ${target.username} this week.`);

      const totalVc = getTotalVc(memberStats);
      const isLive = !!liveVcSeconds[target.id];

      const embed = new EmbedBuilder()
        .setTitle(`Stats for ${target.displayName || target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .setColor(0x5865f2)
        .addFields(
          { name: 'Messages', value: String(memberStats.messageCount || 0), inline: true },
          { name: 'Media Sent', value: String(memberStats.mediaCount || 0), inline: true },
          { name: 'VC Time', value: `${formatDuration(totalVc)}${isLive ? ' 🔴 live' : ''}`, inline: true },
          { name: 'Reactions Given', value: String(memberStats.reactionsGiven || 0), inline: true },
          { name: 'Late Night Messages', value: String(memberStats.lateNightMessages || 0), inline: true },
        )
        .setFooter({ text: 'Week resets every Monday • VC time updates live' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (!stats || stats.members.length === 0) {
      // Check if anyone is in VC even with no stats yet
      if (Object.keys(liveVcSeconds).length === 0) {
        return interaction.editReply('No stats recorded yet this week. Get chatting!');
      }
    }

    const members = stats ? stats.members : [];

    // Merge live VC users who might not have any stats yet
    const allUserIds = new Set([
      ...members.map(m => m.userId),
      ...Object.keys(liveVcSeconds),
    ]);

    const mergedMembers = [...allUserIds].map(userId => {
      const m = members.find(m => m.userId === userId) || { userId, username: 'Unknown', messageCount: 0, mediaCount: 0, vcSeconds: 0, reactionsGiven: 0 };
      return {
        ...m,
        totalVcSeconds: getTotalVc(m),
      };
    });

    const top5Msg   = [...mergedMembers].sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0)).slice(0, 5);
    const top5Media = [...mergedMembers].sort((a, b) => (b.mediaCount || 0) - (a.mediaCount || 0)).slice(0, 3);
    const top5VC    = [...mergedMembers].sort((a, b) => (b.totalVcSeconds || 0) - (a.totalVcSeconds || 0)).slice(0, 3);

    const fmt = (arr, field, formatter = v => String(v)) =>
      arr.map((m, i) => {
        const isLive = field === 'totalVcSeconds' && !!liveVcSeconds[m.userId];
        return `${i + 1}. <@${m.userId}> — ${formatter(m[field] || 0)}${isLive ? ' 🔴' : ''}`;
      }).join('\n') || 'No data';

    const embed = new EmbedBuilder()
      .setTitle('This Week\'s Leaderboard')
      .setColor(0xf39c12)
      .addFields(
        { name: 'Top Chatters', value: fmt(top5Msg, 'messageCount', v => `${v} messages`) },
        { name: 'Top Media', value: fmt(top5Media, 'mediaCount', v => `${v} files`) },
        { name: 'Top VC', value: fmt(top5VC, 'totalVcSeconds', formatDuration) },
      )
      .setFooter({ text: `${mergedMembers.length} members tracked — resets Monday • 🔴 = currently in VC` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
