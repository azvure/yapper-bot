const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const LifetimeStats = require('../models/LifetimeStats');
const { formatDuration } = require('../utils/statsHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lifetime')
    .setDescription('View lifetime stats and leaderboards')
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('See a member\'s lifetime stats')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Member to look up (leave blank for yourself)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('See the all-time leaderboard')
        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('What to rank by')
            .setRequired(true)
            .addChoices(
              { name: 'Total Roles Won', value: 'total' },
              { name: 'Messages', value: 'totalMessages' },
              { name: 'VC Time', value: 'totalVcSeconds' },
              { name: 'Media Sent', value: 'totalMediaSent' },
              { name: 'Reactions Given', value: 'totalReactionsGiven' },
              { name: 'Late Night Messages', value: 'totalLateNightMessages' },
            )
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    // /lifetime stats
    if (sub === 'stats') {
      const target = interaction.options.getUser('user') || interaction.user;
      const data = await LifetimeStats.findOne({ guildId, userId: target.id });

      if (!data) {
        return interaction.editReply(`No lifetime stats found for ${target.username} yet.`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`Lifetime Stats — ${target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .setColor(0x6c5ce7)
        .addFields(
          { name: '💬 Messages', value: String(data.totalMessages), inline: true },
          { name: '🖼️ Media Sent', value: String(data.totalMediaSent), inline: true },
          { name: '🎙️ VC Time', value: formatDuration(data.totalVcSeconds), inline: true },
          { name: '👍 Reactions Given', value: String(data.totalReactionsGiven), inline: true },
          { name: '🌙 Late Night Messages', value: String(data.totalLateNightMessages), inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          {
            name: '🏆 Roles Won',
            value: [
              `🖼️ Media King — **${data.rolesWon.MEDIA_KING}**`,
              `🎙️ VC Goblin — **${data.rolesWon.VC_GOBLIN}**`,
              `💬 Chatterbox — **${data.rolesWon.CHATTERBOX}**`,
              `🌙 Night Owl — **${data.rolesWon.NIGHT_OWL}**`,
              `👍 Reaction Lord — **${data.rolesWon.REACTION_LORD}**`,
              `❓ Quote Icon — **${data.rolesWon.QUOTE_ICON}**`,
              `\n**Total: ${data.rolesWon.total}**`,
            ].join('\n'),
          }
        )
        .setFooter({ text: 'Lifetime stats accumulate every Monday' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // /lifetime leaderboard
    if (sub === 'leaderboard') {
      const category = interaction.options.getString('category');

      const sortField = category === 'total' ? 'rolesWon.total' : category;

      const top10 = await LifetimeStats.find({ guildId })
        .sort({ [sortField]: -1 })
        .limit(10);

      if (!top10.length) {
        return interaction.editReply('No lifetime stats recorded yet.');
      }

      const categoryLabels = {
        total: '🏆 Total Roles Won',
        totalMessages: '💬 Most Messages',
        totalVcSeconds: '🎙️ Most VC Time',
        totalMediaSent: '🖼️ Most Media Sent',
        totalReactionsGiven: '👍 Most Reactions Given',
        totalLateNightMessages: '🌙 Most Late Night Messages',
      };

      const getValue = (entry) => {
        if (category === 'total') return `${entry.rolesWon.total} roles`;
        if (category === 'totalVcSeconds') return formatDuration(entry.totalVcSeconds);
        if (category === 'totalMessages') return `${entry.totalMessages} messages`;
        if (category === 'totalMediaSent') return `${entry.totalMediaSent} files`;
        if (category === 'totalReactionsGiven') return `${entry.totalReactionsGiven} reactions`;
        if (category === 'totalLateNightMessages') return `${entry.totalLateNightMessages} messages`;
        return '—';
      };

      const medals = ['🥇', '🥈', '🥉'];
      const lines = top10.map((entry, i) => {
        const medal = medals[i] || `${i + 1}.`;
        return `${medal} <@${entry.userId}> — ${getValue(entry)}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`All-Time Leaderboard — ${categoryLabels[category]}`)
        .setColor(0xf39c12)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Updates every Monday after the weekly announcement' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
