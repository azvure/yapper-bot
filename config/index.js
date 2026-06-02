module.exports = {
  // Set these in your .env or hardcode after setup
  ANNOUNCEMENTS_CHANNEL: process.env.ANNOUNCEMENTS_CHANNEL_ID,
  OUT_OF_CONTEXT_CHANNEL: process.env.OUT_OF_CONTEXT_CHANNEL_ID,
  GUESS_WHO_CHANNEL: process.env.GUESS_WHO_CHANNEL_ID,

  // Weekly role names (bot will create these if they don't exist)
  ROLES: {
    MEDIA_KING: '📸 Media King',
    VC_GOBLIN: '🎙️ VC Goblin',
    CHATTERBOX: '💬 Chatterbox',
    NIGHT_OWL: '🦉 Night Owl',       // most active between midnight–5am
    REACTION_LORD: '⚡ Reaction Lord', // most reactions given
    QUOTE_ICON: '🗣️ Quote Icon',      // most guessed correctly in guess-who
  },

  // Cron schedule: Monday 9am AEST = Sunday 11pm UTC
  WEEKLY_CRON: '0 23 * * 0',        // weekly announcement
  GUESS_WHO_CRON: '0 18 * * 1,3,5', // Mon/Wed/Fri 6pm UTC — guess-who post
};
