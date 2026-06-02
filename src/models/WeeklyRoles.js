const mongoose = require('mongoose');

const weeklyRolesSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  week: { type: Date, required: true },
  awards: [{
    roleKey: String,       // e.g. 'MEDIA_KING'
    roleName: String,      // display name
    roleId: String,        // Discord role ID
    userId: String,
    username: String,
    stat: Number,          // the winning stat value
  }],
  createdAt: { type: Date, default: Date.now },
});

weeklyRolesSchema.index({ guildId: 1, week: -1 });

module.exports = mongoose.model('WeeklyRoles', weeklyRolesSchema);
