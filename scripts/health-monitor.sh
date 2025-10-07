#!/bin/bash

# Health Monitoring Script - Checks bot status and sends WhatsApp alerts
# Add to crontab to run every 5 minutes:
# */5 * * * * /root/wAssitenceBot/scripts/health-monitor.sh

APP_DIR="/root/wAssitenceBot"
PM2_APP_NAME="ultrathink"
ADMIN_PHONE="972555030746"
STATE_FILE="/tmp/bot-health-state"

# Function to send alert
send_alert() {
    local message="$1"
    local severity="$2"

    local emoji=""
    case "$severity" in
        "warning") emoji="⚠️" ;;
        "error") emoji="❌" ;;
        "recovery") emoji="✅" ;;
    esac

    # Try to send via the bot if running
    cd "$APP_DIR"
    node -e "
const { BaileysProvider } = require('./dist/providers/BaileysProvider.js');
(async () => {
    try {
        const provider = new BaileysProvider();
        await provider.initialize();
        await provider.sendMessage('${ADMIN_PHONE}@s.whatsapp.net', {
            text: '${emoji} *Bot Health Alert*\n\n${message}\n\nTime: $(date +"%Y-%m-%d %H:%M:%S")'
        });
    } catch (error) {
        console.error('Alert failed:', error.message);
    }
})();
" 2>/dev/null &
}

# Get current state
PREVIOUS_STATE=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")

# Check PM2 status
PM2_STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.status" 2>/dev/null)

if [[ -z "$PM2_STATUS" ]]; then
    if [[ "$PREVIOUS_STATE" != "not_found" ]]; then
        send_alert "🚨 CRITICAL: Bot process not found in PM2!\n\nAction required:\n1. SSH to server\n2. Check: pm2 list\n3. Restart: pm2 restart $PM2_APP_NAME" "error"
        echo "not_found" > "$STATE_FILE"
    fi
    exit 1
fi

# Check if online
if [[ "$PM2_STATUS" != "online" ]]; then
    if [[ "$PREVIOUS_STATE" != "offline" ]]; then
        send_alert "🚨 ALERT: Bot is $PM2_STATUS!\n\nAttempting auto-restart..." "error"
        echo "offline" > "$STATE_FILE"

        # Try auto-restart
        pm2 restart "$PM2_APP_NAME"
        sleep 10

        # Check again
        NEW_STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.status")
        if [[ "$NEW_STATUS" == "online" ]]; then
            send_alert "✅ Auto-restart successful!\n\nBot is back online." "recovery"
            echo "online" > "$STATE_FILE"
        else
            send_alert "❌ Auto-restart FAILED!\n\nStatus: $NEW_STATUS\n\nManual intervention required!" "error"
        fi
    fi
    exit 1
fi

# Check memory usage
MEMORY_MB=$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .monit.memory" | awk '{print $1/1024/1024}')
if (( $(echo "$MEMORY_MB > 500" | bc -l) )); then
    if [[ "$PREVIOUS_STATE" != "high_memory" ]]; then
        send_alert "⚠️ WARNING: High memory usage!\n\nCurrent: ${MEMORY_MB}MB\n\nMonitoring..." "warning"
        echo "high_memory" > "$STATE_FILE"
    fi
fi

# Check restart count (if > 5, something's wrong)
RESTARTS=$(pm2 jlist | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.restart_time")
if [[ $RESTARTS -gt 5 ]]; then
    if [[ "$PREVIOUS_STATE" != "frequent_restarts" ]]; then
        send_alert "⚠️ WARNING: Bot has restarted $RESTARTS times!\n\nCheck logs:\npm2 logs $PM2_APP_NAME --err" "warning"
        echo "frequent_restarts" > "$STATE_FILE"
    fi
fi

# Check error logs (last 5 minutes)
ERROR_COUNT=$(pm2 logs "$PM2_APP_NAME" --nostream --lines 100 --err 2>/dev/null | grep -i "error" | wc -l)
if [[ $ERROR_COUNT -gt 10 ]]; then
    if [[ "$PREVIOUS_STATE" != "high_errors" ]]; then
        send_alert "⚠️ WARNING: High error rate detected!\n\n$ERROR_COUNT errors in recent logs\n\nCheck: pm2 logs $PM2_APP_NAME" "warning"
        echo "high_errors" > "$STATE_FILE"
    fi
fi

# Check WhatsApp connection (look for "connected" in logs)
CONNECTED=$(pm2 logs "$PM2_APP_NAME" --nostream --lines 50 2>/dev/null | grep -i "connection.*open\|whatsapp.*connected" | tail -1)
if [[ -z "$CONNECTED" ]]; then
    # Check if disconnected recently
    DISCONNECTED=$(pm2 logs "$PM2_APP_NAME" --nostream --lines 50 2>/dev/null | grep -i "connection.*close\|disconnected" | tail -1)
    if [[ -n "$DISCONNECTED" && "$PREVIOUS_STATE" != "disconnected" ]]; then
        send_alert "⚠️ WARNING: WhatsApp disconnected!\n\nMay need QR code rescan.\n\nCheck: pm2 logs $PM2_APP_NAME" "warning"
        echo "disconnected" > "$STATE_FILE"
    fi
fi

# All good - recovery notification if was previously bad
if [[ "$PREVIOUS_STATE" != "online" && "$PREVIOUS_STATE" != "unknown" ]]; then
    send_alert "✅ Bot health restored!\n\nStatus: Online\nMemory: ${MEMORY_MB}MB\nRestarts: $RESTARTS\n\nAll systems normal." "recovery"
    echo "online" > "$STATE_FILE"
fi

# Update state
if [[ "$PM2_STATUS" == "online" && -z "$PREVIOUS_STATE" || "$PREVIOUS_STATE" == "unknown" ]]; then
    echo "online" > "$STATE_FILE"
fi
