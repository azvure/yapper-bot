const { GuessWhoRound } = require('../models/GuessWho');
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

      // Determine if this is a vote-only round (no canonical correct answer)
      const isVoteOnly = !round.correctUserId;
      const correct = isVoteOnly ? null : guessedUserId === round.correctUserId;

      round.votes.push({
        userId: interaction.user.id,
        username: interaction.user.username,
        guessedUserId,
        correct,
      });
      await round.save();

      // Award stats only if there's a canonical correct answer (shouldn't happen for Guess Who)
      if (correct === true) {
        await incrementStat(interaction.guild.id, interaction.user.id, interaction.user.username, 'reactionsGiven', 0);
      }

      let replyContent = '';
      if (isVoteOnly) {
        const totalVotes = round.votes.length;
        replyContent = `✅ Vote recorded! ${totalVotes} guess${totalVotes !== 1 ? 'es' : ''} so far.`;
      } else {
        const member = await interaction.guild.members.fetch(round.correctUserId).catch(() => null);
        const correctName = member ? member.displayName : 'Unknown';
        replyContent = correct
          ? `✅ **Correct!** It was ${correctName}! Nice one.`
          : `❌ **Wrong!** Better luck next time — it was actually **${correctName}**.`;
      }

      await interaction.reply({
        content: replyContent,
        ephemeral: true,
      });

      // Update vote count on the embed
      const totalVotes = round.votes.length;

      try {
        const msg = await interaction.channel.messages.fetch(round.discordMessageId);
        if (msg) {
          const footer = `${totalVotes} guess${totalVotes !== 1 ? 'es' : ''} so far`;
          const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
            .setFooter({ text: footer });
          await msg.edit({ embeds: [updatedEmbed] });
        }
      } catch { /* message may have been deleted */ }
    }
  },
};
