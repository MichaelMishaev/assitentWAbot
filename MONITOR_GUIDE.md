# 📊 Production Message Monitor - User Guide

## Overview

Real-time monitor that watches production logs for the specific messages that failed on Oct 8, 2025, and validates all fixes are working correctly.

## Quick Start

### Start the Monitor

```bash
npm run build && node dist/scripts/monitor-user-messages.js
```

The monitor will:
- ✅ Connect to production server via SSH
- ✅ Tail logs in real-time
- ✅ Highlight watched message patterns
- ✅ Show NLP classification results
- ✅ Validate time extraction
- ✅ Display bot responses

### Stop the Monitor

Press `Ctrl+C` to stop gracefully.

---

## What It Watches For

### 1. **Day-of-Week Queries** 🗓️
- Pattern: `ימי ראשון`, `ביום ראשון`, `יום ראשון`
- Example: "מה יש לי בימי ראשון?"
- Expected: `list_events` intent with dateText extracted

### 2. **Update Reminder (ל format)** ⏰
- Pattern: `תזכורת.*ל XX:XX`, `תעדכן.*ל XX:XX`
- Example: "תעדכן שעה ל 19:00"
- Expected: `update_reminder` intent with time extracted

### 3. **Update Training Reminder** 🏃
- Pattern: `עדכן.*אימון`, `עדכן.*ללכת לאימון`
- Example: "עדכן אימון לשעה 19:30"
- Expected: `update_reminder` intent (NOT update_event!)

### 4. **Time Extraction** 🕐
- Pattern: `לשעה XX:XX`
- Example: "עדכן ללכת לאימון לשעה 19:30"
- Expected: Time properly extracted in NLP result

---

## Example Output

When a watched message is detected, you'll see:

```
═══════════════════════════════════════════════════════
📩 INCOMING MESSAGE [14:32:15] from ...5287
═══════════════════════════════════════════════════════
Message: "מה יש לי בימי ראשון?"

⚡ WATCHED PATTERNS DETECTED:
  1. Day-of-Week Query
     → User asking about Sundays
     → Expected Intent: list_events

🧠 NLP RESULT [14:32:17]
  Intent: list_events (confidence: 0.95)
  ✓ CORRECT  Intent matches expected!
  ✓ Event DateText: ימי ראשון

📤 BOT RESPONSE [14:32:18]
  "📅 האירועים שלך ביום ראשון:..."
```

### Color Coding

- 🔵 **Cyan** - Day-of-week queries
- 🟣 **Magenta** - Time with "ל" prefix
- 🟡 **Yellow** - Training reminder updates
- 🟢 **Green** - Time extraction patterns
- ✅ **Green background** - Intent matches expected
- ❌ **Red background** - Intent mismatch (BUG!)

---

## Validation Checks

The monitor automatically validates:

### ✓ Intent Classification
- Checks if NLP classified the intent correctly
- Compares against expected intent for each pattern
- **Red alert** if mismatch detected

### ✓ Time Extraction
- Verifies time was extracted from messages like "ל 19:00"
- Shows extracted time value
- **Red alert** if time missing

### ✓ Date/DateText Extraction
- Verifies day-of-week queries parse correctly
- Shows extracted dateText value
- **Red alert** if dateText missing

---

## Use Cases

### 1. **Real-Time Testing**
Start the monitor and have the user send test messages. Watch them flow through in real-time and validate all fixes work.

### 2. **Production Debugging**
Keep the monitor running to catch any issues with real user messages. You'll immediately see if:
- Intent classification fails
- Time extraction fails
- Day-of-week parsing fails

### 3. **Regression Testing**
After deploying new changes, run the monitor while testing to ensure nothing broke.

---

## Technical Details

### Connection
- Uses SSH to connect to production server (root@167.71.145.9)
- Tails `/root/wAssitenceBot/logs/all.log`
- Parses JSON log entries in real-time

### Log Parsing
Monitors for:
- `📩 Received message from` - Incoming user messages
- `NLP parsed intent` - NLP classification results
- `📤 Sent message to` - Bot responses

### Pattern Matching
Uses regex patterns to identify the specific failing message types from Oct 8, 2025.

---

## Troubleshooting

### Monitor won't start
**Error**: `SSH connection failed`
- Check SSH key is configured: `ssh root@167.71.145.9`
- Verify production server is online

### No messages appearing
- Logs are only shown when patterns match
- Send a test message containing one of the watch patterns
- Example: Send "מה יש לי בימי ראשון?" to the bot

### Intent mismatch shown
- **Red alert** means a bug was detected!
- Check the NLP classification logic
- Review the failing message pattern

---

## Example Test Messages

Send these to the bot while monitor is running:

```
# Day-of-week query
מה יש לי בימי ראשון?

# Update reminder with "ל" time format
תזכורת של ימי ראשון, תעדכן שעה ל 19:00

# Update training reminder
עדכן אימון לשעה 19:30

# Update with exact name
עדכן ללכת לאימון לשעה 19:30
```

You should see:
- ✅ All intents correct
- ✅ All times extracted
- ✅ All dates parsed
- ✅ Bot responds appropriately

---

## Integration with Tests

After running the comprehensive test suite:
```bash
npm run build && node dist/scripts/test-user-failing-messages.js
```

Use the monitor to validate the same messages work in production:
```bash
node dist/scripts/monitor-user-messages.js
```

This gives you:
1. **Local validation** - Test suite proves logic works
2. **Production validation** - Monitor proves it works with real users

---

## Tips

1. **Keep it running** during user testing sessions
2. **Watch for red alerts** - they indicate bugs
3. **Compare with test results** - both should pass
4. **Screenshot interesting flows** for documentation
5. **Use it after deployments** to verify fixes

---

## Need Help?

If you see unexpected behavior:
1. Check the full log entry in `/root/wAssitenceBot/logs/all.log`
2. Check daily message logs in `/root/wAssitenceBot/logs/daily-messages/`
3. Run the test suite to isolate the issue
4. Review NLP prompts if intent classification fails

---

**Monitor created**: 2025-10-09
**Purpose**: Validate Oct 8 user failing message fixes
**Status**: ✅ All tests passing
