#!/bin/bash

# Production QR Code Re-scan Script
# Clears sessions and displays QR code for re-authentication

set -e

# Configuration
SERVER="root@167.71.145.9"
APP_DIR="/root/wAssitenceBot"
PM2_APP_NAME="ultrathink"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔐 Production QR Code Re-scan                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check server connection
echo -e "${YELLOW}[1/6]${NC} Checking server connection..."
if ! ssh -q "$SERVER" exit; then
    echo -e "${RED}❌ Cannot connect to $SERVER${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Connected to server${NC}"
echo ""

# Step 2: Stop the bot
echo -e "${YELLOW}[2/6]${NC} Stopping bot..."
ssh "$SERVER" "cd $APP_DIR && pm2 stop $PM2_APP_NAME || true"
sleep 2
echo -e "${GREEN}✅ Bot stopped${NC}"
echo ""

# Step 3: Clear sessions
echo -e "${YELLOW}[3/6]${NC} Clearing old sessions..."
ssh "$SERVER" "cd $APP_DIR && rm -rf sessions/* && mkdir -p sessions"
echo -e "${GREEN}✅ Sessions cleared${NC}"
echo ""

# Step 4: Restart bot
echo -e "${YELLOW}[4/6]${NC} Restarting bot..."
ssh "$SERVER" "cd $APP_DIR && pm2 restart $PM2_APP_NAME"
sleep 3
echo -e "${GREEN}✅ Bot restarted${NC}"
echo ""

# Step 5: Show QR code instructions
echo -e "${YELLOW}[5/6]${NC} Preparing to display QR code..."
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  📱 SCAN QR CODE NOW${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""
echo "Steps:"
echo "1. Open WhatsApp on your phone"
echo "2. Go to: Settings → Linked Devices"
echo "3. Tap: Link a Device"
echo "4. Scan the QR code that will appear below"
echo ""
echo -e "${YELLOW}Press Enter when ready to view QR code...${NC}"
read -r

# Step 6: Stream logs with QR code
echo -e "${YELLOW}[6/6]${NC} Displaying logs with QR code..."
echo ""
echo -e "${GREEN}Watching logs for QR code...${NC}"
echo -e "${GREEN}(The QR code will appear within 10-15 seconds)${NC}"
echo ""
echo -e "${BLUE}Press Ctrl+C when you've scanned the code${NC}"
echo ""
sleep 2

# Stream logs and show QR code
ssh "$SERVER" "cd $APP_DIR && pm2 logs $PM2_APP_NAME --lines 100"

# This will be reached if user presses Ctrl+C
echo ""
echo -e "${GREEN}✅ QR code scan session complete!${NC}"
echo ""
echo "To check if bot is connected:"
echo -e "${BLUE}  ssh $SERVER${NC}"
echo -e "${BLUE}  pm2 logs $PM2_APP_NAME${NC}"
echo ""
