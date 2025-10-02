#!/bin/bash

# Log Viewer Script
# View real-time or historical logs from the WhatsApp bot

set -e

LOGS_DIR="./logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  WhatsApp Bot - Log Viewer${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""

if [ ! -d "$LOGS_DIR" ]; then
    echo -e "${RED}Error: Logs directory not found!${NC}"
    echo "Run the bot first to generate logs."
    exit 1
fi

# Function to display menu
show_menu() {
    echo -e "${GREEN}Available log files:${NC}"
    echo ""
    echo "  1) 📋 All logs (real-time)"
    echo "  2) ❌ Error logs only"
    echo "  3) 🔧 Operations log (user actions)"
    echo "  4) 📜 View last 50 lines (all.log)"
    echo "  5) 📜 View last 100 lines (all.log)"
    echo "  6) 🔍 Search logs by keyword"
    echo "  7) 📊 Show log statistics"
    echo "  8) 🗑️  Clear all logs"
    echo "  9) ❓ Help"
    echo "  0) Exit"
    echo ""
}

# Function to tail logs
tail_all_logs() {
    echo -e "${CYAN}📋 Tailing all logs (Ctrl+C to stop)...${NC}"
    echo ""
    tail -f "$LOGS_DIR/all.log" 2>/dev/null || echo "No logs yet. Waiting for new entries..."
}

# Function to tail error logs
tail_error_logs() {
    echo -e "${RED}❌ Tailing error logs (Ctrl+C to stop)...${NC}"
    echo ""
    tail -f "$LOGS_DIR/error.log" 2>/dev/null || echo "No error logs yet."
}

# Function to tail operations logs
tail_operations_logs() {
    echo -e "${BLUE}🔧 Tailing operations log (Ctrl+C to stop)...${NC}"
    echo ""
    tail -f "$LOGS_DIR/operations.log" 2>/dev/null || echo "No operations logs yet."
}

# Function to view last N lines
view_last_lines() {
    local lines=$1
    echo -e "${CYAN}📜 Last $lines lines from all.log:${NC}"
    echo ""
    tail -n "$lines" "$LOGS_DIR/all.log" 2>/dev/null || echo "No logs yet."
}

# Function to search logs
search_logs() {
    echo -e "${YELLOW}🔍 Enter search keyword:${NC} "
    read keyword

    if [ -z "$keyword" ]; then
        echo "No keyword provided."
        return
    fi

    echo ""
    echo -e "${CYAN}Searching for: '$keyword'${NC}"
    echo ""

    grep -i "$keyword" "$LOGS_DIR/all.log" 2>/dev/null || echo "No matches found."
}

# Function to show log statistics
show_statistics() {
    echo -e "${MAGENTA}📊 Log Statistics:${NC}"
    echo ""

    if [ -f "$LOGS_DIR/all.log" ]; then
        echo -e "${GREEN}All Logs:${NC}"
        echo "  Total lines: $(wc -l < "$LOGS_DIR/all.log")"
        echo "  File size: $(du -h "$LOGS_DIR/all.log" | cut -f1)"
        echo ""
    fi

    if [ -f "$LOGS_DIR/error.log" ]; then
        echo -e "${RED}Error Logs:${NC}"
        echo "  Total errors: $(wc -l < "$LOGS_DIR/error.log")"
        echo "  File size: $(du -h "$LOGS_DIR/error.log" | cut -f1)"
        echo ""
    fi

    if [ -f "$LOGS_DIR/operations.log" ]; then
        echo -e "${BLUE}Operations Logs:${NC}"
        echo "  Total operations: $(wc -l < "$LOGS_DIR/operations.log")"
        echo "  File size: $(du -h "$LOGS_DIR/operations.log" | cut -f1)"
        echo ""
    fi

    echo -e "${CYAN}Recent Operation Types (last 20):${NC}"
    grep -o '"operation":"[^"]*"' "$LOGS_DIR/all.log" 2>/dev/null | tail -20 || echo "  No operations yet."
    echo ""
}

# Function to clear logs
clear_logs() {
    echo -e "${YELLOW}⚠️  Are you sure you want to clear all logs? (y/N)${NC} "
    read confirm

    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        rm -f "$LOGS_DIR"/*.log
        echo -e "${GREEN}✅ All logs cleared.${NC}"
    else
        echo "Cancelled."
    fi
}

# Function to show help
show_help() {
    echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Log Viewer Help${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
    echo ""
    echo "📋 All logs (all.log):"
    echo "   Contains every log entry from the bot"
    echo "   Includes INFO, WARN, ERROR levels"
    echo ""
    echo "❌ Error logs (error.log):"
    echo "   Contains only ERROR level logs"
    echo "   Check here when things go wrong"
    echo ""
    echo "🔧 Operations log (operations.log):"
    echo "   User actions and operations"
    echo "   EVENT_CREATE, REMINDER_CREATE, NLP_PARSE, etc."
    echo ""
    echo "Log Format:"
    echo "  [TIMESTAMP] [LEVEL] [OPERATION] [User Info] Message"
    echo "  📊 Data: {...}  - Structured data"
    echo "  ❌ Error: {...} - Error details"
    echo ""
    echo "Key Operations:"
    echo "  • MESSAGE_IN    - Incoming WhatsApp message"
    echo "  • MESSAGE_OUT   - Outgoing WhatsApp message"
    echo "  • NLP_PARSE     - AI parsing user message"
    echo "  • EVENT_CREATE  - New event created"
    echo "  • REMINDER_CREATE - New reminder created"
    echo "  • STATE_CHANGE  - User conversation state changed"
    echo ""
}

# Main loop
while true; do
    show_menu
    echo -e "${YELLOW}Enter your choice [0-9]:${NC} "
    read choice

    case $choice in
        1)
            tail_all_logs
            ;;
        2)
            tail_error_logs
            ;;
        3)
            tail_operations_logs
            ;;
        4)
            view_last_lines 50
            echo ""
            ;;
        5)
            view_last_lines 100
            echo ""
            ;;
        6)
            search_logs
            echo ""
            ;;
        7)
            show_statistics
            ;;
        8)
            clear_logs
            echo ""
            ;;
        9)
            show_help
            ;;
        0)
            echo -e "${GREEN}Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Please try again.${NC}"
            echo ""
            ;;
    esac
done
