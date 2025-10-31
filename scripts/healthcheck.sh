#!/bin/bash
#
# Bot Healthcheck Script
# Monitors bot status and sends notifications when down
#
# Usage: Add to crontab:
#   */5 * * * * /root/wAssitenceBot/scripts/healthcheck.sh >> /var/log/bot-healthcheck.log 2>&1
#

set -e

# Configuration
APP_DIR="/root/wAssitenceBot"
PM2_APP_NAME="ultrathink"
YOUR_PHONE="972555030746"

# Notification Configuration
# Set ONE of these to enable notifications:
TELEGRAM_BOT_TOKEN=""  # Get from @BotFather on Telegram
TELEGRAM_CHAT_ID=""    # Get from @userinfobot on Telegram
DISCORD_WEBHOOK_URL="" # Get from Discord server settings
EMAIL_TO=""            # Your email address
HEALTHCHECKS_IO_URL="" # Get from healthchecks.io dashboard

# Lock file to prevent multiple healthchecks running simultaneously
LOCK_FILE="/tmp/bot-healthcheck.lock"
STATUS_FILE="/tmp/bot-last-status"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Check for concurrent runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE")
    if ps -p $LOCK_PID > /dev/null 2>&1; then
        log "Healthcheck already running (PID: $LOCK_PID), skipping..."
        exit 0
    fi
fi

# Create lock
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Function to send notification via Telegram
send_telegram() {
    local message="$1"
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="${TELEGRAM_CHAT_ID}" \
            -d text="${message}" \
            -d parse_mode="Markdown" > /dev/null 2>&1 || warn "Failed to send Telegram notification"
    fi
}

# Function to send notification via Discord
send_discord() {
    local message="$1"
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        curl -s -H "Content-Type: application/json" \
            -d "{\"content\": \"${message}\"}" \
            "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1 || warn "Failed to send Discord notification"
    fi
}

# Function to send email
send_email() {
    local subject="$1"
    local body="$2"
    if [ -n "$EMAIL_TO" ] && command -v mail > /dev/null 2>&1; then
        echo "$body" | mail -s "$subject" "$EMAIL_TO" || warn "Failed to send email"
    fi
}

# Function to ping Healthchecks.io
ping_healthchecks() {
    local status="$1"  # "success" or "fail"
    if [ -n "$HEALTHCHECKS_IO_URL" ]; then
        if [ "$status" = "fail" ]; then
            curl -s "${HEALTHCHECKS_IO_URL}/fail" > /dev/null 2>&1 || true
        else
            curl -s "$HEALTHCHECKS_IO_URL" > /dev/null 2>&1 || true
        fi
    fi
}

# Function to send all notifications
notify() {
    local severity="$1"  # "info", "warning", "error"
    local message="$2"

    local emoji=""
    case "$severity" in
        "info") emoji="ℹ️" ;;
        "warning") emoji="⚠️" ;;
        "error") emoji="🚨" ;;
        "success") emoji="✅" ;;
    esac

    local full_message="${emoji} **Bot Healthcheck Alert**\n\n${message}\n\nTime: $(date)\nServer: $(hostname)"

    send_telegram "$full_message"
    send_discord "$full_message"
    send_email "Bot Healthcheck: $severity" "$full_message"

    if [ "$severity" = "error" ]; then
        ping_healthchecks "fail"
    else
        ping_healthchecks "success"
    fi
}

# Check if PM2 is running
if ! command -v pm2 > /dev/null 2>&1; then
    error "PM2 is not installed!"
    notify "error" "PM2 is not installed on the server!"
    exit 1
fi

# Check bot status
log "Checking bot status..."
APP_STATUS=$(pm2 jlist 2>/dev/null | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.status" || echo "not_found")

# Read last known status
LAST_STATUS="unknown"
if [ -f "$STATUS_FILE" ]; then
    LAST_STATUS=$(cat "$STATUS_FILE")
fi

# Save current status
echo "$APP_STATUS" > "$STATUS_FILE"

# Check status and act accordingly
if [ "$APP_STATUS" = "online" ]; then
    log "✅ Bot is online and healthy"

    # If bot was down before and is now up, send recovery notification
    if [ "$LAST_STATUS" != "online" ] && [ "$LAST_STATUS" != "unknown" ]; then
        log "Bot has recovered!"
        notify "success" "Bot has RECOVERED and is now online!\n\nPrevious status: $LAST_STATUS\nCurrent status: $APP_STATUS"
    fi

    # Check for excessive restarts (potential crash loop)
    RESTART_COUNT=$(pm2 jlist 2>/dev/null | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.restart_time" || echo "0")
    if [ "$RESTART_COUNT" -gt 5 ]; then
        warn "Bot has restarted $RESTART_COUNT times - possible crash loop!"
        notify "warning" "Bot has restarted $RESTART_COUNT times!\n\nThis may indicate a crash loop or instability.\n\nCheck logs: pm2 logs $PM2_APP_NAME"
    fi

    exit 0
elif [ "$APP_STATUS" = "stopped" ] || [ "$APP_STATUS" = "errored" ] || [ "$APP_STATUS" = "not_found" ]; then
    error "🚨 Bot is DOWN! Status: $APP_STATUS"

    # Only send notification if status changed (avoid spam)
    if [ "$LAST_STATUS" != "$APP_STATUS" ]; then
        notify "error" "Bot is DOWN!\n\nStatus: $APP_STATUS\nLast known status: $LAST_STATUS\n\nAttempting auto-restart..."
    fi

    # Attempt to restart
    log "Attempting to restart bot..."
    cd "$APP_DIR"

    if pm2 start ecosystem.config.cjs --update-env 2>&1; then
        log "✅ Bot restarted successfully"
        sleep 5

        # Check if restart was successful
        NEW_STATUS=$(pm2 jlist 2>/dev/null | jq -r ".[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.status" || echo "unknown")
        if [ "$NEW_STATUS" = "online" ]; then
            notify "success" "Bot was down and has been AUTO-RESTARTED successfully!\n\nPrevious status: $APP_STATUS\nNew status: $NEW_STATUS"
        else
            notify "error" "Bot restart FAILED!\n\nStatus after restart: $NEW_STATUS\n\nManual intervention required!\nSSH: ssh root@167.71.145.9\nLogs: pm2 logs $PM2_APP_NAME"
        fi
    else
        error "❌ Failed to restart bot"
        notify "error" "Bot restart FAILED!\n\nCould not start PM2 process.\n\nManual intervention required immediately!\nSSH: ssh root@167.71.145.9"
        exit 1
    fi
else
    warn "⚠️  Bot in unexpected status: $APP_STATUS"
    notify "warning" "Bot is in unexpected status: $APP_STATUS\n\nThis may require investigation."
fi

log "Healthcheck complete"
