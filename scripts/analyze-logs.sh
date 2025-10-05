#!/bin/bash

# Log Analysis Tool
# Provides insights from JSON logs stored in logs/ directory

cd /root/wAssitenceBot/logs

TIMEFRAME=${1:-"1day"}  # Default: last 1 day. Options: 1hour, 1day, 7days, 30days, all

echo "📊 WhatsApp Bot Log Analysis - Last $TIMEFRAME"
echo "=============================================="
echo ""

# Convert timeframe to minutes for filtering
case $TIMEFRAME in
  "1hour")
    MINUTES=60
    ;;
  "1day")
    MINUTES=1440
    ;;
  "7days")
    MINUTES=10080
    ;;
  "30days")
    MINUTES=43200
    ;;
  "all")
    MINUTES=999999
    ;;
  *)
    MINUTES=1440
    ;;
esac

# Function to filter logs by time
filter_by_time() {
  local file=$1
  local minutes=$2

  if [ "$minutes" = "999999" ]; then
    cat "$file"
  else
    # Get timestamp from MINUTES ago
    cutoff=$(date -u -d "$minutes minutes ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -v-${minutes}M +"%Y-%m-%dT%H:%M:%S")
    cat "$file" | jq -c "select(.timestamp >= \"$cutoff\")"
  fi
}

echo "📱 WhatsApp Messages"
echo "-------------------"
if [ -f "whatsapp-connection.log" ]; then
  MESSAGES_IN=$(filter_by_time "whatsapp-connection.log" $MINUTES | grep -c "WHATSAPP_MESSAGE_IN" || echo "0")
  MESSAGES_OUT=$(filter_by_time "whatsapp-connection.log" $MINUTES | grep -c "WHATSAPP_MESSAGE_OUT" || echo "0")
  echo "  📥 Messages received: $MESSAGES_IN"
  echo "  📤 Messages sent: $MESSAGES_OUT"
  echo "  📊 Total messages: $((MESSAGES_IN + MESSAGES_OUT))"
else
  echo "  No WhatsApp connection log found"
fi
echo ""

echo "🔌 Connection Events"
echo "-------------------"
if [ -f "whatsapp-connection.log" ]; then
  CONNECTIONS=$(filter_by_time "whatsapp-connection.log" $MINUTES | grep -c '"status":"connected"' || echo "0")
  DISCONNECTS=$(filter_by_time "whatsapp-connection.log" $MINUTES | grep -c "WHATSAPP_DISCONNECT" || echo "0")
  QR_REQUIRED=$(filter_by_time "whatsapp-connection.log" $MINUTES | grep -c "WHATSAPP_QR_REQUIRED" || echo "0")
  RECONNECTS=$(filter_by_time "whatsapp-connection.log" $MINUTES | grep -c "WHATSAPP_RECONNECT" || echo "0")

  echo "  ✅ Connected: $CONNECTIONS times"
  echo "  ❌ Disconnected: $DISCONNECTS times"
  echo "  🔄 Reconnect attempts: $RECONNECTS"
  echo "  ⚠️  QR code required: $QR_REQUIRED times"
else
  echo "  No connection log found"
fi
echo ""

echo "👥 User Activity"
echo "---------------"
if [ -f "operations.log" ]; then
  UNIQUE_USERS=$(filter_by_time "operations.log" $MINUTES | jq -r '.phone' 2>/dev/null | sort -u | grep -v "null" | wc -l || echo "0")
  EVENTS_CREATED=$(filter_by_time "operations.log" $MINUTES | grep -c "EVENT_CREATE" || echo "0")
  REMINDERS_CREATED=$(filter_by_time "operations.log" $MINUTES | grep -c "REMINDER_CREATE" || echo "0")

  echo "  👤 Unique users: $UNIQUE_USERS"
  echo "  📅 Events created: $EVENTS_CREATED"
  echo "  ⏰ Reminders created: $REMINDERS_CREATED"
else
  echo "  No operations log found"
fi
echo ""

echo "❌ Errors"
echo "--------"
if [ -f "error.log" ]; then
  ERROR_COUNT=$(filter_by_time "error.log" $MINUTES | wc -l || echo "0")
  echo "  Total errors: $ERROR_COUNT"

  if [ $ERROR_COUNT -gt 0 ]; then
    echo ""
    echo "  Recent errors:"
    filter_by_time "error.log" $MINUTES | tail -5 | jq -r '"  - " + .message' 2>/dev/null || echo "  Unable to parse errors"
  fi
else
  echo "  No error log found"
fi
echo ""

echo "📈 Statistics"
echo "------------"
if [ -f "all.log" ]; then
  TOTAL_LOGS=$(filter_by_time "all.log" $MINUTES | wc -l || echo "0")
  INFO_LOGS=$(filter_by_time "all.log" $MINUTES | grep -c '"level":"info"' || echo "0")
  WARN_LOGS=$(filter_by_time "all.log" $MINUTES | grep -c '"level":"warn"' || echo "0")
  ERROR_LOGS=$(filter_by_time "all.log" $MINUTES | grep -c '"level":"error"' || echo "0")

  echo "  📝 Total log entries: $TOTAL_LOGS"
  echo "  ℹ️  Info: $INFO_LOGS"
  echo "  ⚠️  Warnings: $WARN_LOGS"
  echo "  ❌ Errors: $ERROR_LOGS"
fi
echo ""

echo "💾 Log Files"
echo "-----------"
ls -lh *.log 2>/dev/null | awk '{print "  " $9 ": " $5}'
echo ""

echo "Usage: ./analyze-logs.sh [timeframe]"
echo "Timeframes: 1hour, 1day (default), 7days, 30days, all"
