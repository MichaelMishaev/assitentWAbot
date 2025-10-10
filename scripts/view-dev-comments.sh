#!/bin/bash

# View Developer Comments Script
# Shows all # comments logged by the bot for bug tracking and feature requests

set -e

SERVER="root@167.71.145.9"
APP_DIR="/root/wAssitenceBot"
LOG_FILE="logs/dev-comments.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📝 Developer Comments Viewer${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""

# Menu function
show_menu() {
    echo -e "${GREEN}What would you like to do?${NC}"
    echo ""
    echo "  1) 📋 View all comments (local)"
    echo "  2) 📋 View all comments (production)"
    echo "  3) 🔍 Search comments by keyword (local)"
    echo "  4) 🔍 Search comments by keyword (production)"
    echo "  5) 📊 Count comments (production)"
    echo "  6) ⏰ View last 24 hours (production)"
    echo "  7) 🗑️  Clear local comments"
    echo "  0) Exit"
    echo ""
}

# View all local comments
view_local() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${RED}No local dev comments found.${NC}"
        echo "Run the bot locally and send messages starting with # to create comments."
        return
    fi

    echo -e "${CYAN}📋 All Local Developer Comments:${NC}"
    echo ""
    cat "$LOG_FILE"
}

# View all production comments
view_production() {
    echo -e "${CYAN}📋 Fetching production developer comments...${NC}"
    echo ""

    ssh "$SERVER" "cat $APP_DIR/$LOG_FILE 2>/dev/null" || echo -e "${YELLOW}No production comments found yet.${NC}"
}

# Search local comments
search_local() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${RED}No local dev comments found.${NC}"
        return
    fi

    echo -e "${YELLOW}🔍 Enter search keyword:${NC} "
    read keyword

    if [ -z "$keyword" ]; then
        echo "No keyword provided."
        return
    fi

    echo ""
    echo -e "${CYAN}Searching for: '$keyword'${NC}"
    echo ""

    grep -i "$keyword" "$LOG_FILE" || echo "No matches found."
}

# Search production comments
search_production() {
    echo -e "${YELLOW}🔍 Enter search keyword:${NC} "
    read keyword

    if [ -z "$keyword" ]; then
        echo "No keyword provided."
        return
    fi

    echo ""
    echo -e "${CYAN}Searching production for: '$keyword'${NC}"
    echo ""

    ssh "$SERVER" "grep -i '$keyword' $APP_DIR/$LOG_FILE 2>/dev/null" || echo "No matches found."
}

# Count production comments
count_production() {
    echo -e "${CYAN}📊 Counting production comments...${NC}"
    echo ""

    total=$(ssh "$SERVER" "grep -c 'DEV COMMENT DETECTED' $APP_DIR/$LOG_FILE 2>/dev/null" || echo "0")
    echo -e "${GREEN}Total comments: ${total}${NC}"

    # Show date range
    first=$(ssh "$SERVER" "head -50 $APP_DIR/$LOG_FILE 2>/dev/null | grep 'Timestamp:' | head -1 | cut -d':' -f2-" || echo "N/A")
    last=$(ssh "$SERVER" "tail -50 $APP_DIR/$LOG_FILE 2>/dev/null | grep 'Timestamp:' | tail -1 | cut -d':' -f2-" || echo "N/A")

    echo -e "${BLUE}First comment: ${first}${NC}"
    echo -e "${BLUE}Last comment: ${last}${NC}"
}

# View last 24 hours
view_recent_production() {
    echo -e "${CYAN}⏰ Fetching comments from last 24 hours...${NC}"
    echo ""

    # Get current date minus 24 hours in format: 2025-10-09
    yesterday=$(date -u -d '24 hours ago' '+%Y-%m-%d' 2>/dev/null || date -u -v-24H '+%Y-%m-%d')

    ssh "$SERVER" "grep -A 15 'DEV COMMENT DETECTED' $APP_DIR/$LOG_FILE 2>/dev/null | grep -A 15 '$yesterday'" || \
        echo -e "${YELLOW}No comments in last 24 hours.${NC}"
}

# Clear local comments
clear_local() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}No local comments to clear.${NC}"
        return
    fi

    echo -e "${YELLOW}⚠️  Are you sure you want to clear local dev comments? (y/N)${NC} "
    read confirm

    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        rm -f "$LOG_FILE"
        echo -e "${GREEN}✅ Local dev comments cleared.${NC}"
    else
        echo "Cancelled."
    fi
}

# Main loop
while true; do
    show_menu
    echo -e "${YELLOW}Enter your choice [0-7]:${NC} "
    read choice

    case $choice in
        1)
            view_local
            echo ""
            ;;
        2)
            view_production
            echo ""
            ;;
        3)
            search_local
            echo ""
            ;;
        4)
            search_production
            echo ""
            ;;
        5)
            count_production
            echo ""
            ;;
        6)
            view_recent_production
            echo ""
            ;;
        7)
            clear_local
            echo ""
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
