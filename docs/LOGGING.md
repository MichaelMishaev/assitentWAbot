# 📊 Logging System Documentation

## Overview

The WhatsApp bot uses a comprehensive JSON-based logging system with 10-day retention, tracking every message, error, and system event.

---

## 📁 Log Files Location

All logs are stored in: `/root/wAssitenceBot/logs/`

### Log Files:

| File | Purpose | Retention | Size Limit |
|------|---------|-----------|------------|
| `all.log` | All application logs | 10 days | 10MB/file |
| `error.log` | Errors only | 10 days | 10MB/file |
| `operations.log` | User operations (events, reminders) | 10 days | 10MB/file |
| `whatsapp-connection.log` | WhatsApp connection tracking | 10 days | 5MB/file |
| **`dev-comments.log`** 🆕 | **Developer comments (# messages)** | **30 days** | **10MB/file** |

**Format:** All logs are stored in JSON format for easy parsing and analysis.

---

## 🐛 Developer Comment System (NEW)

### What is it?
A dedicated logging system for **async bug reporting** in WhatsApp. Any message starting with `#` is treated as a developer note/bug report.

### How to use:

**In WhatsApp:**
```
# Bug: Reminder doesn't show date correctly
# Feature request: Link reminder to event
# Issue: Date format recognizes time wrong
```

**Bot behavior:**
- ✅ Logs the comment to `dev-comments.log`
- ✅ **Silent acknowledgment** (no response to avoid clutter)
- ✅ Marks message as processed
- ✅ Does NOT parse as normal message

### Log format:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 DEV COMMENT DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 Timestamp: 2025-10-10 17:13:23
👤 User ID: abc123...
📱 Phone: 972544****
📋 Message ID: ACDE3FF30...
🔄 State: MAIN_MENU

💬 Comment:
# Bug: Reminder doesn't show date correctly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### View comments:

**Interactive viewer:**
```bash
# Local or remote
./scripts/view-dev-comments.sh
```

**Menu options:**
1. View all comments (local)
2. View all comments (production)
3. Search by keyword (local)
4. Search by keyword (production)
5. Count comments
6. View last 24 hours
7. Clear local comments

**Manual queries:**
```bash
# SSH to production
ssh root@167.71.145.9

# View all comments
cat /root/wAssitenceBot/logs/dev-comments.log

# Search for specific keyword
grep -i "reminder" /root/wAssitenceBot/logs/dev-comments.log

# Count comments
grep -c "DEV COMMENT DETECTED" /root/wAssitenceBot/logs/dev-comments.log

# View recent comments (last 24 hours)
grep "2025-10-10" /root/wAssitenceBot/logs/dev-comments.log
```

### Use case:
1. **Document bugs as they happen** in WhatsApp (real-time)
2. **Batch-fix later** by asking Claude: "Check my # comments and fix all bugs"
3. **Historical tracking** - 30-day retention vs 10 days for normal logs

---

## 🔍 What Gets Logged

### 1. WhatsApp Messages
Every message is logged with:
- Timestamp
- Direction (incoming/outgoing)
- Masked phone number (last 4 digits hidden)
- Message ID
- Text length (content not stored for privacy)

```json
{
  "level": "info",
  "message": "WhatsApp message received",
  "operation": "WHATSAPP_MESSAGE_IN",
  "timestamp": "2025-10-05T05:42:27.000Z",
  "data": {
    "from": "972544****",
    "messageId": "3EB0...",
    "textLength": 15
  }
}
```

### 2. Connection Events
- Connection established
- Disconnections (with reason and status code)
- Reconnection attempts
- **QR code requirements** ⚠️

```json
{
  "level": "warn",
  "message": "⚠️ WhatsApp QR code required - Bot needs scanning!",
  "operation": "WHATSAPP_QR_REQUIRED",
  "timestamp": "2025-10-05T06:00:00.000Z",
  "data": {
    "qrCodePath": "/root/wAssitenceBot/sessions/qr-code.png",
    "action": "SCAN_REQUIRED"
  }
}
```

### 3. User Operations
- Event creation
- Reminder creation
- Contact management
- State changes

### 4. Errors
All errors with full stack traces:
```json
{
  "level": "error",
  "message": "Failed to create event",
  "operation": "EVENT_CREATE",
  "timestamp": "2025-10-05T05:42:27.000Z",
  "error": {
    "message": "Database constraint violation",
    "stack": "Error: ...",
    "name": "DatabaseError"
  }
}
```

---

## 🛠️ Analysis Scripts

### 1. Quick Log Analysis

```bash
ssh root@167.71.145.9
cd /root/wAssitenceBot
chmod +x scripts/analyze-logs.sh
./scripts/analyze-logs.sh [timeframe]
```

**Timeframes:** `1hour`, `1day` (default), `7days`, `30days`, `all`

**Example output:**
```
📊 WhatsApp Bot Log Analysis - Last 1day
==============================================

📱 WhatsApp Messages
-------------------
  📥 Messages received: 45
  📤 Messages sent: 52
  📊 Total messages: 97

🔌 Connection Events
-------------------
  ✅ Connected: 3 times
  ❌ Disconnected: 2 times
  🔄 Reconnect attempts: 2
  ⚠️  QR code required: 0 times

👥 User Activity
---------------
  👤 Unique users: 8
  📅 Events created: 12
  ⏰ Reminders created: 7

❌ Errors
--------
  Total errors: 2
```

### 2. Export Messages

```bash
./scripts/export-messages.sh [phone_number] [format]
```

**Formats:** `json`, `csv`, `text`

**Examples:**
```bash
# Export all messages as JSON
./scripts/export-messages.sh all json

# Export specific user messages as CSV
./scripts/export-messages.sh 972544345287 csv

# Export as text
./scripts/export-messages.sh 972544345287 text
```

**Output location:** `/root/wAssitenceBot/logs/exports/`

### 3. User Activity Report

```bash
./scripts/user-activity-report.sh [days] [format]
```

**Examples:**
```bash
# Last 7 days, text format
./scripts/user-activity-report.sh 7 text

# Last 30 days, JSON format
./scripts/user-activity-report.sh 30 json
```

**Output location:** `/root/wAssitenceBot/logs/reports/`

---

## 📖 Manual Log Queries

### View recent WhatsApp messages:
```bash
cd /root/wAssitenceBot/logs
cat whatsapp-connection.log | jq 'select(.operation == "WHATSAPP_MESSAGE_IN" or .operation == "WHATSAPP_MESSAGE_OUT")' | tail -10
```

### Check for QR code requirements:
```bash
cat whatsapp-connection.log | jq 'select(.operation == "WHATSAPP_QR_REQUIRED")' | tail -5
```

### Find all errors in last hour:
```bash
CUTOFF=$(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%S")
cat error.log | jq "select(.timestamp >= \"$CUTOFF\")"
```

### Count messages per user:
```bash
cat whatsapp-connection.log | jq -r 'select(.operation == "WHATSAPP_MESSAGE_IN") | .data.from' | sort | uniq -c | sort -rn
```

### Get connection history:
```bash
cat whatsapp-connection.log | jq 'select(.operation == "WHATSAPP_CONNECTION" or .operation == "WHATSAPP_DISCONNECT")' | tail -20
```

---

## 🔄 Log Rotation

Logs automatically rotate when they reach size limits:
- **10MB** for all.log, error.log, operations.log
- **5MB** for whatsapp-connection.log

Old logs are kept as:
- `all.log.1`, `all.log.2`, etc.
- Maximum **10 files** (10 days retention)

After 10 days, oldest logs are automatically deleted.

---

## 📱 Deployment Notifications

Every deployment sends you a WhatsApp message with bot status:

### ✅ Fully Operational:
```
✅ Deployment successful - Bot fully operational!

📱 WhatsApp connected
🚀 All systems running

Commit: Add new feature (a93dc19)
```

### ⚠️ QR Required:
```
✅ Deployment successful but ⚠️ *QR CODE SCAN REQUIRED!*

📱 Bot is running but WhatsApp needs authentication.
🔍 Check server: ssh root@167.71.145.9
📋 View QR: cat /root/wAssitenceBot/sessions/qr-code.png

Commit: Fix bug (b1234ab)
```

### ⏳ Starting Up:
```
✅ Deployment successful - Bot starting up

⏳ WhatsApp connection initializing...

Commit: Update dependencies (c5678ef)
```

---

## 🚨 Monitoring for Issues

### Check bot health:
```bash
ssh root@167.71.145.9
bash /root/wAssitenceBot/scripts/check-bot-status.sh
```

**Output:**
```json
{
  "pm2_status": "online",
  "whatsapp_connected": true,
  "qr_required": false,
  "last_error": "",
  "uptime": 1728123456789,
  "timestamp": "2025-10-05T05:42:27+00:00"
}
```

### Watch logs in real-time:
```bash
# PM2 logs
pm2 logs ultrathink --lines 50

# Follow specific log file
tail -f /root/wAssitenceBot/logs/whatsapp-connection.log | jq

# Follow all logs
tail -f /root/wAssitenceBot/logs/all.log | jq
```

---

## 💡 Privacy & Security

### What's NOT Logged:
- ❌ Message content (text) - only length is stored
- ❌ Full phone numbers - last 4 digits masked
- ❌ Passwords or credentials
- ❌ Personal data beyond what's needed for operations

### What IS Logged:
- ✅ Masked phone numbers (e.g., `972544****`)
- ✅ Message metadata (ID, timestamp, length)
- ✅ System events (connections, errors)
- ✅ User operations (event/reminder created)

---

## 📊 Example Analysis Workflow

### Daily health check:
```bash
# 1. SSH to server
ssh root@167.71.145.9

# 2. Check overall status
bash /root/wAssitenceBot/scripts/check-bot-status.sh

# 3. View daily activity
cd /root/wAssitenceBot
./scripts/analyze-logs.sh 1day

# 4. Generate user report
./scripts/user-activity-report.sh 1 text
```

### Monthly analysis:
```bash
# Generate 30-day report
./scripts/user-activity-report.sh 30 json

# Export all messages for analysis
./scripts/export-messages.sh all csv

# Download to local machine
scp root@167.71.145.9:/root/wAssitenceBot/logs/exports/*.csv ./local-analysis/
```

---

## 🔧 Troubleshooting

### No logs appearing:
1. Check if PM2 is running: `pm2 status ultrathink`
2. Check log directory exists: `ls -la /root/wAssitenceBot/logs/`
3. Check file permissions: `ls -la /root/wAssitenceBot/logs/`
4. Restart bot: `pm2 restart ultrathink`

### Logs too large:
- Logs auto-rotate at size limits
- Old logs deleted after 10 days
- Check disk space: `df -h`

### Missing specific log type:
- Check logger configuration in `src/utils/logger.ts`
- Verify log level: `LOG_LEVEL` environment variable
- Default level is `info`

---

## 📞 Support

Questions about logs? Check:
1. This documentation
2. GitHub Actions logs: https://github.com/MichaelMishaev/assitentWAbot/actions
3. PM2 logs: `pm2 logs ultrathink`
4. Server status: `bash /root/wAssitenceBot/scripts/check-bot-status.sh`

---

**Last Updated:** October 5, 2025
**Version:** 1.0
