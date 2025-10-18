#!/bin/bash

# WhatsApp Connection Monitor
# Checks connection status and alerts if disconnected

set -e

APP_DIR="/root/wAssitenceBot"
LOG_FILE="$APP_DIR/logs/connection-monitor.log"
ALERT_SENT_FILE="/tmp/whatsapp_alert_sent"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if bot process is running
if ! pm2 status ultrathink | grep -q "online"; then
    log "⚠️ Bot process is NOT running!"

    # Send alert only once (prevent spam)
    if [ ! -f "$ALERT_SENT_FILE" ]; then
        log "Sending alert notification..."
        cd "$APP_DIR"
        node scripts/send-deployment-notification.js "critical" "monitor" "🚨 BOT PROCESS DOWN! PM2 status shows offline. Check logs immediately." || true
        touch "$ALERT_SENT_FILE"
    fi

    exit 1
fi

# Check WhatsApp connection state via health API
HEALTH_CHECK=$(curl -s http://localhost:8080/health || echo '{"whatsapp_connected":false}')
WA_CONNECTED=$(echo "$HEALTH_CHECK" | jq -r '.whatsapp_connected // false')

if [ "$WA_CONNECTED" = "true" ]; then
    log "✅ WhatsApp connection healthy"
    # Clear alert flag if connection restored
    rm -f "$ALERT_SENT_FILE"
    exit 0
else
    log "❌ WhatsApp connection DOWN!"

    # Check if it's waiting for QR
    QR_REQUIRED=$(echo "$HEALTH_CHECK" | jq -r '.qr_required // false')

    if [ "$QR_REQUIRED" = "true" ]; then
        log "📱 QR code scan required"

        # Send alert only once
        if [ ! -f "$ALERT_SENT_FILE" ]; then
            log "Sending QR scan alert..."
            cd "$APP_DIR"
            node scripts/send-deployment-notification.js "warning" "monitor" "📱 QR CODE SCAN REQUIRED! WhatsApp session needs re-authentication. SSH to server and scan QR: pm2 logs ultrathink" || true
            touch "$ALERT_SENT_FILE"
        fi
    else
        log "⚠️ WhatsApp disconnected (not QR)"

        # Send alert only once
        if [ ! -f "$ALERT_SENT_FILE" ]; then
            log "Sending disconnection alert..."
            cd "$APP_DIR"
            node scripts/send-deployment-notification.js "error" "monitor" "⚠️ WHATSAPP DISCONNECTED! Bot is running but WhatsApp connection lost. Check logs: pm2 logs ultrathink" || true
            touch "$ALERT_SENT_FILE"
        fi
    fi

    exit 1
fi
