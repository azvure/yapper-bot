const { GuessWhoRound } = require('../models/GuessWho');
const { incrementStat } = require('../utils/statsHelper');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // --- Slash commands ---
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Command Error] ${interaction.commandName}:`, err);
        const errMsg = { content: '❌ Something went wrong running that command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errMsg);
        } else {
          await interaction.reply(errMsg);
        }
      }
      return;
    }

    // --- Guess-who select menu ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('guesswho:')) {
      const roundId = interaction.customId.split(':')[1];
      const guessedUserId = interaction.values[0];

      const round = await GuessWhoRound.findById(roundId);
      if (!round || round.closed) {
        return interaction.reply({ content: '⏰ This round is already closed!', ephemeral: true });
      }

      // One vote per user
      const alreadyVoted = round.votes.find(v => v.userId === interaction.user.id);
      if (alreadyVoted) {
        return interaction.reply({ content: `You already guessed **${alreadyVoted.guessedUserId === round.correctUserId ? '✅ correctly' : '❌ incorrectly'}**!`, ephemeral: true });
      }

      const correct = guessedUserId === round.correctUserId;
      round.votes.push({
        userId: interaction.user.id,
        username: interaction.user.username,
        guessedUserId,
        correct,
      });
      await round.save();

      if (correct) {
        // Award a stat point for correct guess
        await incrementStat(interaction.guild.id, interaction.user.id, interaction.user.username, 'reactionsGiven', 0);
        // We track guess-who wins separately via the quote_icon logic in weeklyAnnouncement
      }

      const member = await interaction.guild.members.fetch(round.correctUserId).catch(() => null);
      const correctName = member ? member.displayName : 'Unknown';

      await interaction.reply({
        content: correct
          ? `✅ **Correct!** It was ${correctName}! Nice one.`
          : `❌ **Wrong!** Better luck next time — it was actually **${correctName}**.`,
        ephemeral: true,
      });

      // Update vote count on the embed
      const totalVotes = round.votes.length;
      const correctVotes = round.votes.filter(v => v.correct).length;

      try {
        const msg = await interaction.channel.messages.fetch(round.discordMessageId);
        if (msg) {
          const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
            .setFooter({ text: `${totalVotes} guess${totalVotes !== 1 ? 'es' : ''} so far • ${correctVotes} correct` });
          await msg.edit({ embeds: [updatedEmbed] });
        }
      } catch { /* message may have been deleted */ }
    }
  },
};
