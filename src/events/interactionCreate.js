const { GuessWhoRound } = require('../models/GuessWho');
const {
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { closeRound } = require('../jobs/guessWho');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Command Error] ${interaction.commandName}:`, err);
        const errMsg = { content: 'Something went wrong.', flags: 64 };
        interaction.replied || interaction.deferred
          ? await interaction.followUp(errMsg)
          : await interaction.reply(errMsg);
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('guesswho:')) {
      const roundId = interaction.customId.split(':')[1];
      if (roundId === 'closed') {
        return interaction.reply({ content: 'This round is already closed.', flags: 64 });
      }

      const round = await GuessWhoRound.findById(roundId);
      if (!round || round.closed) {
        return interaction.reply({ content: 'This round is already closed.', flags: 64 });
      }

      const guessedUserId = interaction.values[0];

      const alreadyVoted = round.votes.find(v => v.userId === interaction.user.id);
      if (alreadyVoted) {
        const prev = await interaction.guild.members.fetch(alreadyVoted.guessedUserId).catch(() => null);
        const prevName = prev ? prev.displayName : 'someone';
        return interaction.reply({
          content: `You already voted for ${prevName}. Votes are locked in.`,
          flags: 64,
        });
      }

      round.votes.push({
        userId: interaction.user.id,
        username: interaction.user.username,
        guessedUserId,
      });
      await round.save();

      const guessedMember = await interaction.guild.members.fetch(guessedUserId).catch(() => null);
      const guessedName = guessedMember ? guessedMember.displayName : 'Unknown';

      await interaction.reply({
        content: `Voted for ${guessedName}. Find out if you were right on Monday.`,
        flags: 64,
      });

      const totalVotes = round.votes.length;
      try {
        const msg = await interaction.channel.messages.fetch(round.discordMessageId);
        if (msg) {
          const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
            .setFooter({ text: `${totalVotes} vote${totalVotes !== 1 ? 's' : ''} so far — reveal on Monday` });
          await msg.edit({ embeds: [updatedEmbed] });
        }
      } catch { /* message deleted */ }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('guesswho_close:')) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Only admins can close rounds early.', flags: 64 });
      }

      const roundId = interaction.customId.split(':')[1];
      if (roundId === 'closed') {
        return interaction.reply({ content: 'This round is already closed.', flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      const result = await closeRound(roundId, interaction.guild, interaction.channel);
      if (!result) {
        return interaction.editReply('That round is already closed.');
      }

      await interaction.editReply('Round closed and results posted.');
    }
  },
};