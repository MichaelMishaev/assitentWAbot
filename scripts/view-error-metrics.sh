#!/bin/bash

# Error Metrics Viewer
# View and analyze error metrics from production

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_DIR="/root/wAssitenceBot"
METRICS_LOG="$PROJECT_DIR/logs/error-metrics.log"

# Server details
SERVER_USER="root"
SERVER_HOST="167.71.145.9"

echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📊 Error Metrics Viewer${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""

# Menu
echo -e "${GREEN}What would you like to do?${NC}"
echo ""
echo "  1) 📊 View error summary (production)"
echo "  2) 📈 Top 10 errors (production)"
echo "  3) 🔍 Search by category (production)"
echo "  4) 📉 Error trend (last 24 hours)"
echo "  5) 📋 Full metrics log (production)"
echo "  6) 🧮 Count by category (production)"
echo "  0) Exit"
echo ""
echo -ne "${YELLOW}Enter your choice [0-6]:${NC} "
read choice

echo ""

case $choice in
  1)
    echo -e "${BLUE}📊 Error Summary${NC}"
    echo ""
    ssh ${SERVER_USER}@${SERVER_HOST} "cat ${METRICS_LOG} 2>/dev/null | jq -s 'group_by(.category) | map({category: .[0].category, count: length}) | sort_by(.count) | reverse | .[]' 2>/dev/null || echo 'No metrics found'"
    ;;

  2)
    echo -e "${BLUE}📈 Top 10 Most Common Errors${NC}"
    echo ""
    ssh ${SERVER_USER}@${SERVER_HOST} "cat ${METRICS_LOG} 2>/dev/null | jq -r '.category' 2>/dev/null | sort | uniq -c | sort -rn | head -10 || echo 'No metrics found'"
    ;;

  3)
    echo -ne "${YELLOW}Enter category (e.g., DATE_PARSING, NLP_INTENT_DETECTION):${NC} "
    read category
    echo ""
    echo -e "${BLUE}🔍 Errors in category: ${category}${NC}"
    echo ""
    ssh ${SERVER_USER}@${SERVER_HOST} "cat ${METRICS_LOG} 2>/dev/null | jq 'select(.category == \"${category}\")' | head -20 || echo 'No errors found for this category'"
    ;;

  4)
    echo -e "${BLUE}📉 Error Trend (Last 24 Hours)${NC}"
    echo ""
    YESTERDAY=$(date -u -d "1 day ago" +"%Y-%m-%d")
    ssh ${SERVER_USER}@${SERVER_HOST} "cat ${METRICS_LOG} 2>/dev/null | jq -r 'select(.timestamp >= \"${YESTERDAY}\") | .category' 2>/dev/null | sort | uniq -c | sort -rn || echo 'No metrics found'"
    ;;

  5)
    echo -e "${BLUE}📋 Full Metrics Log${NC}"
    echo ""
    ssh ${SERVER_USER}@${SERVER_HOST} "cat ${METRICS_LOG} 2>/dev/null | tail -50 || echo 'No metrics log found'"
    ;;

  6)
    echo -e "${BLUE}🧮 Error Count by Category${NC}"
    echo ""
    ssh ${SERVER_USER}@${SERVER_HOST} "cat ${METRICS_LOG} 2>/dev/null | jq -r '.category' 2>/dev/null | sort | uniq -c | sort -k2 || echo 'No metrics found'"
    ;;

  0)
    echo -e "${GREEN}Goodbye!${NC}"
    exit 0
    ;;

  *)
    echo -e "${RED}Invalid choice${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
