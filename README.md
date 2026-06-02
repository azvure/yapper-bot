# 🤖 Discord Weekly Stats Bot

A Discord bot for private servers that tracks activity, awards weekly roles, and runs a "Guess Who Said It?" game using quotes from your **#out-of-context** channel.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 Weekly Stats | Tracks messages, media, VC time, reactions, late-night activity |
| 🏆 Weekly Roles | Auto-assigns 6 role awards every Monday, removes old ones |
| 🕵️ Guess Who | Posts random out-of-context quotes (text or media) with a member dropdown |
| 📣 Announcements | Weekly wrap-up embed with winners + honourable mentions |
| 🛠️ Slash Commands | `/stats`, `/roles`, `/quotes`, `/guesswho`, `/announce` |

### 🎖️ Weekly Roles
| Role | Awarded To |
|------|-----------|
| 📸 Media King | Most images/videos/files sent |
| 🎙️ VC Goblin | Most time spent in voice channels |
| 💬 Chatterbox | Most messages sent |
| 🦉 Night Owl | Most messages between midnight–5am AEST |
| ⚡ Reaction Lord | Most reactions given |
| 🗣️ Quote Icon | Most correct Guess Who answers |

---

## 🚀 Setup

### 1. Create a Discord Bot
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Bot → **Reset Token** (copy it)
3. Enable **Privileged Intents**: `Server Members`, `Message Content`
4. Invite with scopes: `bot`, `applications.commands` and permissions: `Manage Roles`, `Send Messages`, `Read Message History`, `Add Reactions`, `View Channels`, `Connect`

### 2. Set Up MongoDB
1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user and get your connection string
3. Whitelist `0.0.0.0/0` in Network Access (required for Render)

### 3. Configure the Bot
```bash
cp .env.example .env
# Fill in your values
```

Enable **Developer Mode** in Discord (Settings → Advanced) then right-click channels/server to copy IDs.

### 4. Deploy to Render
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → **Web Service**
3. Connect your repo
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add all your `.env` values as **Environment Variables**
6. Deploy!

### 5. Register Slash Commands
After the bot is running, run once locally:
```bash
npm run deploy
```
Or add it to your build command on Render: `npm install && npm run deploy`

---

## 📁 Discord Server Channels Needed

| Channel | Purpose |
|---------|---------|
| `#announcements` | Weekly wrap-up embeds |
| `#out-of-context` | Members post quotes/media here — bot auto-syncs |
| `#guess-who` | Bot posts guess-who prompts here |

---

## ⏰ Schedule (UTC)
- **Weekly Announcement**: Sunday 11pm UTC (Monday 9am AEST)
- **Guess Who Posts**: Monday, Wednesday, Friday at 6pm UTC (4am AEST)

To change these, edit `config/index.js` — uses standard cron syntax.

---

## 💬 Commands

| Command | Description | Who |
|---------|-------------|-----|
| `/stats` | This week's leaderboard | Everyone |
| `/stats user:@someone` | Individual member stats | Everyone |
| `/roles` | See current role holders | Everyone |
| `/quotes count` | Unused quotes remaining | Everyone |
| `/quotes reset` | Recycle all quotes | Admins |
| `/guesswho` | Post a round manually | Admins |
| `/announce` | Run weekly announcement now | Admins |

---

## ⚠️ Bot Permissions Required
The bot's role must be **above** all the weekly award roles in the role hierarchy (Settings → Roles — drag it up).
