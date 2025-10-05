#!/bin/bash

# Export WhatsApp messages to readable format
# Usage: ./export-messages.sh [phone_number] [format]
# Formats: json (default), csv, text

PHONE=${1:-"all"}
FORMAT=${2:-"json"}
OUTPUT_DIR="/root/wAssitenceBot/logs/exports"

mkdir -p "$OUTPUT_DIR"

cd /root/wAssitenceBot/logs

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [ "$PHONE" = "all" ]; then
  OUTPUT_FILE="$OUTPUT_DIR/all_messages_$TIMESTAMP.$FORMAT"
  echo "Exporting all messages to: $OUTPUT_FILE"
else
  # Mask phone for filename
  MASKED_PHONE=$(echo "$PHONE" | sed 's/.\{4\}$/****/')
  OUTPUT_FILE="$OUTPUT_DIR/messages_${MASKED_PHONE}_$TIMESTAMP.$FORMAT"
  echo "Exporting messages for $MASKED_PHONE to: $OUTPUT_FILE"
fi

case $FORMAT in
  "json")
    if [ "$PHONE" = "all" ]; then
      cat whatsapp-connection.log | jq -c 'select(.operation == "WHATSAPP_MESSAGE_IN" or .operation == "WHATSAPP_MESSAGE_OUT")' > "$OUTPUT_FILE"
    else
      cat whatsapp-connection.log | jq -c "select((.operation == \"WHATSAPP_MESSAGE_IN\" or .operation == \"WHATSAPP_MESSAGE_OUT\") and .data.from == \"$PHONE\" or .data.to == \"$PHONE\")" > "$OUTPUT_FILE"
    fi
    echo "✅ Exported JSON format"
    ;;

  "csv")
    echo "timestamp,direction,phone,message_id,text_length" > "$OUTPUT_FILE"
    if [ "$PHONE" = "all" ]; then
      cat whatsapp-connection.log | jq -r 'select(.operation == "WHATSAPP_MESSAGE_IN" or .operation == "WHATSAPP_MESSAGE_OUT") | [.timestamp, (if .operation == "WHATSAPP_MESSAGE_IN" then "IN" else "OUT" end), (.data.from // .data.to), .data.messageId, .data.textLength] | @csv' >> "$OUTPUT_FILE"
    else
      cat whatsapp-connection.log | jq -r "select((.operation == \"WHATSAPP_MESSAGE_IN\" or .operation == \"WHATSAPP_MESSAGE_OUT\") and (.data.from == \"$PHONE\" or .data.to == \"$PHONE\")) | [.timestamp, (if .operation == \"WHATSAPP_MESSAGE_IN\" then \"IN\" else \"OUT\" end), (.data.from // .data.to), .data.messageId, .data.textLength] | @csv" >> "$OUTPUT_FILE"
    fi
    echo "✅ Exported CSV format"
    ;;

  "text")
    if [ "$PHONE" = "all" ]; then
      cat whatsapp-connection.log | jq -r 'select(.operation == "WHATSAPP_MESSAGE_IN" or .operation == "WHATSAPP_MESSAGE_OUT") | "\(.timestamp) [\(if .operation == "WHATSAPP_MESSAGE_IN" then "IN" else "OUT" end)] \(.data.from // .data.to) - \(.data.textLength) chars"' > "$OUTPUT_FILE"
    else
      cat whatsapp-connection.log | jq -r "select((.operation == \"WHATSAPP_MESSAGE_IN\" or .operation == \"WHATSAPP_MESSAGE_OUT\") and (.data.from == \"$PHONE\" or .data.to == \"$PHONE\")) | \"\(.timestamp) [\(if .operation == \"WHATSAPP_MESSAGE_IN\" then \"IN\" else \"OUT\" end)] \(.data.from // .data.to) - \(.data.textLength) chars\"" > "$OUTPUT_FILE"
    fi
    echo "✅ Exported text format"
    ;;

  *)
    echo "❌ Invalid format. Use: json, csv, or text"
    exit 1
    ;;
esac

echo ""
echo "📊 Statistics:"
LINE_COUNT=$(wc -l < "$OUTPUT_FILE")
if [ "$FORMAT" = "csv" ]; then
  echo "  Messages exported: $((LINE_COUNT - 1))"
else
  echo "  Messages exported: $LINE_COUNT"
fi

FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo "  File size: $FILE_SIZE"
echo ""
echo "📁 File location: $OUTPUT_FILE"
