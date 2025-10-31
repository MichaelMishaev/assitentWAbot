# Bot Healthcheck & Notifications Setup

This guide helps you set up automated bot monitoring with instant notifications when the bot goes down.

## 🎯 What This Does

- ✅ Checks bot status every 5 minutes
- ✅ Automatically restarts bot if down
- ✅ Sends instant notifications when bot crashes
- ✅ Sends recovery notification when bot comes back online
- ✅ Prevents notification spam (only on status change)

---

## ⚡ Quick Setup (Choose ONE Method)

### Option 1: Telegram Bot ⭐ (RECOMMENDED)

**Why Telegram?**
- ✅ Instant notifications
- ✅ Works even when WhatsApp bot is down
- ✅ Free forever
- ✅ Easy setup (2 minutes)

**Setup Steps:**

1. **Create Telegram Bot:**
   - Open Telegram and search for `@BotFather`
   - Send: `/newbot`
   - Choose a name: `YourName Bot`
   - Choose a username: `yourname_bot`
   - Copy the **bot token** (looks like: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

2. **Get Your Chat ID:**
   - Search for `@userinfobot` on Telegram
   - Send: `/start`
   - Copy your **Chat ID** (looks like: `123456789`)

3. **Configure Healthcheck:**
   ```bash
   ssh root@167.71.145.9
   cd /root/wAssitenceBot
   nano scripts/healthcheck.sh
   ```

4. **Update these lines (around line 20):**
   ```bash
   TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN_HERE"  # Paste your bot token
   TELEGRAM_CHAT_ID="YOUR_CHAT_ID_HERE"      # Paste your chat ID
   ```

5. **Save and test:**
   ```bash
   chmod +x scripts/healthcheck.sh
   ./scripts/healthcheck.sh  # Should say "Bot is online and healthy"
   ```

6. **Add to crontab:**
   ```bash
   crontab -e
   ```
   Add this line:
   ```
   */5 * * * * /root/wAssitenceBot/scripts/healthcheck.sh >> /var/log/bot-healthcheck.log 2>&1
   ```

✅ **Done!** You'll now get Telegram messages when bot goes down or recovers.

---

### Option 2: Discord Webhook

**Setup Steps:**

1. **Create Discord Webhook:**
   - Open your Discord server
   - Go to Server Settings → Integrations → Webhooks
   - Click "New Webhook"
   - Copy the **Webhook URL**

2. **Configure Healthcheck:**
   ```bash
   ssh root@167.71.145.9
   cd /root/wAssitenceBot
   nano scripts/healthcheck.sh
   ```

3. **Update this line (around line 22):**
   ```bash
   DISCORD_WEBHOOK_URL="YOUR_WEBHOOK_URL_HERE"  # Paste webhook URL
   ```

4. **Test and enable cron** (same as Telegram steps 5-6 above)

---

### Option 3: Email

**Setup Steps:**

1. **Install mail utility:**
   ```bash
   ssh root@167.71.145.9
   apt-get update && apt-get install -y mailutils
   ```

2. **Configure Healthcheck:**
   ```bash
   cd /root/wAssitenceBot
   nano scripts/healthcheck.sh
   ```

3. **Update this line (around line 23):**
   ```bash
   EMAIL_TO="your.email@gmail.com"  # Your email
   ```

4. **Test and enable cron** (same as Telegram steps 5-6 above)

⚠️ **Note:** Email can have 2-5 minute delays

---

### Option 4: Healthchecks.io

**Setup Steps:**

1. **Create account:**
   - Go to https://healthchecks.io
   - Sign up (free tier: 20 checks)

2. **Create check:**
   - Click "Add Check"
   - Name: "WhatsApp Bot"
   - Period: 10 minutes
   - Grace: 5 minutes
   - Copy the **Ping URL**

3. **Configure Healthcheck:**
   ```bash
   ssh root@167.71.145.9
   cd /root/wAssitenceBot
   nano scripts/healthcheck.sh
   ```

4. **Update this line (around line 24):**
   ```bash
   HEALTHCHECKS_IO_URL="YOUR_PING_URL_HERE"  # Paste ping URL
   ```

5. **Test and enable cron** (same as Telegram steps 5-6 above)

**Bonus:** Healthchecks.io can send notifications via:
- Email
- SMS (via integrations)
- Slack
- Discord
- Telegram
- And 50+ other services

---

## 🔧 Testing Your Setup

**Test healthcheck manually:**
```bash
ssh root@167.71.145.9
cd /root/wAssitenceBot
./scripts/healthcheck.sh
```

You should see:
```
[2025-10-31 08:00:00] Checking bot status...
[2025-10-31 08:00:00] ✅ Bot is online and healthy
[2025-10-31 08:00:00] Healthcheck complete
```

**Test notification (simulate bot down):**
```bash
pm2 stop ultrathink
sleep 10
./scripts/healthcheck.sh  # Should auto-restart and send notification
```

---

## 📊 Monitoring

**View healthcheck logs:**
```bash
tail -f /var/log/bot-healthcheck.log
```

**View cron jobs:**
```bash
crontab -l
```

**Disable healthcheck:**
```bash
crontab -e
# Comment out the line with #
```

---

## 🚨 Notification Examples

### Bot Down:
```
🚨 Bot Healthcheck Alert

Bot is DOWN!

Status: stopped
Last known status: online

Attempting auto-restart...

Time: 2025-10-31 08:15:23
Server: ubuntu-s-1vcpu-512mb-10gb-sfo2-01
```

### Bot Recovered:
```
✅ Bot Healthcheck Alert

Bot has RECOVERED and is now online!

Previous status: stopped
Current status: online

Time: 2025-10-31 08:15:35
Server: ubuntu-s-1vcpu-512mb-10gb-sfo2-01
```

### Crash Loop Warning:
```
⚠️ Bot Healthcheck Alert

Bot has restarted 8 times!

This may indicate a crash loop or instability.

Check logs: pm2 logs ultrathink

Time: 2025-10-31 08:20:00
Server: ubuntu-s-1vcpu-512mb-10gb-sfo2-01
```

---

## 💡 Pro Tips

1. **Use Telegram** - Most reliable and instant
2. **Set up multiple methods** - Use both Telegram AND email for redundancy
3. **Check logs regularly** - `tail -f /var/log/bot-healthcheck.log`
4. **Test after setup** - Stop bot manually to verify notifications work
5. **Adjust frequency** - Change cron from `*/5` (every 5 min) to `*/10` (every 10 min) if needed

---

## 🔥 Troubleshooting

**Healthcheck not running:**
```bash
# Check if cron service is running
systemctl status cron

# Check crontab
crontab -l

# Run manually to test
./scripts/healthcheck.sh
```

**Notifications not working:**
```bash
# Test Telegram
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
  -d chat_id="<YOUR_CHAT_ID>" \
  -d text="Test message"

# Check logs
tail -50 /var/log/bot-healthcheck.log
```

**Bot not auto-restarting:**
```bash
# Check if PM2 is running
pm2 list

# Check if ecosystem config exists
ls -la /root/wAssitenceBot/ecosystem.config.cjs

# Run healthcheck manually
./scripts/healthcheck.sh
```

---

## ✅ Verification Checklist

- [ ] Notification method chosen and configured
- [ ] Healthcheck script is executable (`chmod +x`)
- [ ] Crontab entry added
- [ ] Manual test successful
- [ ] Notification test successful (stopped bot manually)
- [ ] Bot auto-restarted successfully

---

**Questions?** Check the bot logs: `pm2 logs ultrathink`
