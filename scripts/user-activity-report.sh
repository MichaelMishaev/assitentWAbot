#!/bin/bash

# Generate detailed user activity report
# Usage: ./user-activity-report.sh [days] [output_format]
# Formats: text (default), json

DAYS=${1:-7}
FORMAT=${2:-"text"}
OUTPUT_DIR="/root/wAssitenceBot/logs/reports"

mkdir -p "$OUTPUT_DIR"

cd /root/wAssitenceBot/logs

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CUTOFF_DATE=$(date -u -d "$DAYS days ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -v-${DAYS}d +"%Y-%m-%dT%H:%M:%S")

echo "📊 User Activity Report - Last $DAYS days"
echo "Generated: $(date)"
echo "=============================================="
echo ""

# Filter logs by date
TEMP_OPS=$(mktemp)
TEMP_WA=$(mktemp)

cat operations.log | jq -c "select(.timestamp >= \"$CUTOFF_DATE\")" > "$TEMP_OPS"
cat whatsapp-connection.log | jq -c "select(.timestamp >= \"$CUTOFF_DATE\")" > "$TEMP_WA"

# Get unique users
USERS=$(cat "$TEMP_OPS" | jq -r '.phone' 2>/dev/null | sort -u | grep -v "null")

if [ "$FORMAT" = "json" ]; then
  OUTPUT_FILE="$OUTPUT_DIR/user_activity_${DAYS}days_$TIMESTAMP.json"
  echo "{" > "$OUTPUT_FILE"
  echo "  \"report_date\": \"$(date -Iseconds)\"," >> "$OUTPUT_FILE"
  echo "  \"period_days\": $DAYS," >> "$OUTPUT_FILE"
  echo "  \"users\": [" >> "$OUTPUT_FILE"

  FIRST_USER=true
  for user in $USERS; do
    if [ "$FIRST_USER" = false ]; then
      echo "," >> "$OUTPUT_FILE"
    fi
    FIRST_USER=false

    # Count activities
    MSG_IN=$(grep -c "\"phone\":\"$user\"" "$TEMP_WA" | grep "MESSAGE_IN" || echo "0")
    MSG_OUT=$(grep -c "\"phone\":\"$user\"" "$TEMP_WA" | grep "MESSAGE_OUT" || echo "0")
    EVENTS=$(grep -c "\"phone\":\"$user\"" "$TEMP_OPS" | grep "EVENT_CREATE" || echo "0")
    REMINDERS=$(grep -c "\"phone\":\"$user\"" "$TEMP_OPS" | grep "REMINDER_CREATE" || echo "0")

    # Mask phone
    MASKED=$(echo "$user" | sed 's/.\{4\}$/****/')

    cat >> "$OUTPUT_FILE" <<EOF
    {
      "phone": "$MASKED",
      "messages_received": $MSG_IN,
      "messages_sent": $MSG_OUT,
      "events_created": $EVENTS,
      "reminders_created": $REMINDERS,
      "total_interactions": $((MSG_IN + MSG_OUT + EVENTS + REMINDERS))
    }
EOF
  done

  echo "" >> "$OUTPUT_FILE"
  echo "  ]" >> "$OUTPUT_FILE"
  echo "}" >> "$OUTPUT_FILE"

  echo "✅ Report saved to: $OUTPUT_FILE"

else
  # Text format
  OUTPUT_FILE="$OUTPUT_DIR/user_activity_${DAYS}days_$TIMESTAMP.txt"

  {
    echo "User Activity Report"
    echo "Period: Last $DAYS days"
    echo "Generated: $(date)"
    echo ""
    echo "-----------------------------------------------------------"
    printf "%-15s | %-8s | %-8s | %-8s | %-8s | %-8s\n" "Phone" "Msg IN" "Msg OUT" "Events" "Reminders" "Total"
    echo "-----------------------------------------------------------"

    for user in $USERS; do
      # Count activities
      MSG_IN=$(cat "$TEMP_WA" | jq -c "select(.data.from == \"$user\" and .operation == \"WHATSAPP_MESSAGE_IN\")" | wc -l)
      MSG_OUT=$(cat "$TEMP_WA" | jq -c "select(.data.to == \"$user\" and .operation == \"WHATSAPP_MESSAGE_OUT\")" | wc -l)
      EVENTS=$(cat "$TEMP_OPS" | jq -c "select(.phone == \"$user\" and .operation == \"EVENT_CREATE\")" | wc -l)
      REMINDERS=$(cat "$TEMP_OPS" | jq -c "select(.phone == \"$user\" and .operation == \"REMINDER_CREATE\")" | wc -l)
      TOTAL=$((MSG_IN + MSG_OUT + EVENTS + REMINDERS))

      # Mask phone
      MASKED=$(echo "$user" | sed 's/.\{4\}$/****/')

      printf "%-15s | %-8d | %-8d | %-8d | %-8d | %-8d\n" "$MASKED" "$MSG_IN" "$MSG_OUT" "$EVENTS" "$REMINDERS" "$TOTAL"
    done

    echo "-----------------------------------------------------------"
    echo ""

    # Summary
    echo "Summary:"
    TOTAL_USERS=$(echo "$USERS" | wc -l)
    TOTAL_MSG_IN=$(cat "$TEMP_WA" | grep -c "WHATSAPP_MESSAGE_IN" || echo "0")
    TOTAL_MSG_OUT=$(cat "$TEMP_WA" | grep -c "WHATSAPP_MESSAGE_OUT" || echo "0")
    TOTAL_EVENTS=$(cat "$TEMP_OPS" | grep -c "EVENT_CREATE" || echo "0")
    TOTAL_REMINDERS=$(cat "$TEMP_OPS" | grep -c "REMINDER_CREATE" || echo "0")

    echo "  Total users: $TOTAL_USERS"
    echo "  Total messages received: $TOTAL_MSG_IN"
    echo "  Total messages sent: $TOTAL_MSG_OUT"
    echo "  Total events created: $TOTAL_EVENTS"
    echo "  Total reminders created: $TOTAL_REMINDERS"
    echo "  Total interactions: $((TOTAL_MSG_IN + TOTAL_MSG_OUT + TOTAL_EVENTS + TOTAL_REMINDERS))"

  } > "$OUTPUT_FILE"

  cat "$OUTPUT_FILE"
  echo ""
  echo "✅ Report saved to: $OUTPUT_FILE"
fi

# Cleanup
rm -f "$TEMP_OPS" "$TEMP_WA"
