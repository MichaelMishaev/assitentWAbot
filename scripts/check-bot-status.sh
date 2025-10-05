#!/bin/bash

# Check bot status and return JSON with details
# Used by GitHub Actions to determine if QR scan is needed

cd /root/wAssitenceBot

# Check if PM2 process is running
PM2_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="ultrathink") | .pm2_env.status' 2>/dev/null)

# Check WhatsApp connection log for QR code requirement
QR_REQUIRED="false"
if [ -f "logs/whatsapp-connection.log" ]; then
  # Check last 10 lines for QR code requirement
  if tail -100 logs/whatsapp-connection.log | grep -q "WHATSAPP_QR_REQUIRED"; then
    # Check if it was in the last 5 minutes
    LAST_QR=$(tail -100 logs/whatsapp-connection.log | grep "WHATSAPP_QR_REQUIRED" | tail -1)
    if [ -n "$LAST_QR" ]; then
      QR_REQUIRED="true"
    fi
  fi
fi

# Check if bot is connected to WhatsApp
WA_CONNECTED="false"
if [ -f "logs/whatsapp-connection.log" ]; then
  # Check if last connection status was 'connected'
  if tail -100 logs/whatsapp-connection.log | grep -q '"status":"connected"'; then
    LAST_CONNECTED=$(tail -100 logs/whatsapp-connection.log | grep '"status":"connected"' | tail -1)
    if [ -n "$LAST_CONNECTED" ]; then
      WA_CONNECTED="true"
    fi
  fi
fi

# Get last error
LAST_ERROR=""
if [ -f "logs/error.log" ]; then
  LAST_ERROR=$(tail -1 logs/error.log | jq -r '.message' 2>/dev/null || echo "")
fi

# Get uptime
UPTIME="0"
if [ "$PM2_STATUS" = "online" ]; then
  UPTIME=$(pm2 jlist | jq -r '.[] | select(.name=="ultrathink") | .pm2_env.pm_uptime' 2>/dev/null)
fi

# Output JSON
cat <<EOF
{
  "pm2_status": "${PM2_STATUS:-unknown}",
  "whatsapp_connected": ${WA_CONNECTED},
  "qr_required": ${QR_REQUIRED},
  "last_error": "${LAST_ERROR}",
  "uptime": ${UPTIME:-0},
  "timestamp": "$(date -Iseconds)"
}
EOF
