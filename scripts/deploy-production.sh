#!/bin/bash

# Production Deployment Script with WhatsApp Notifications
# Deploys to DigitalOcean and sends status updates via WhatsApp

set -e

# Configuration
SERVER="root@167.71.145.9"
APP_DIR="/root/wAssitenceBot"
PM2_APP_NAME="ultrathink"
YOUR_PHONE="972555030746"  # Your phone number for notifications

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
LOG_FILE="deployment-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

# Function to send WhatsApp notification (requires bot to be running)
send_notification() {
    local message="$1"
    local severity="$2"  # "info", "warning", "error", "success"

    local emoji=""
    case "$severity" in
        "info") emoji="ℹ️" ;;
        "warning") emoji="⚠️" ;;
        "error") emoji="❌" ;;
        "success") emoji="✅" ;;
    esac

    ssh "$SERVER" "cd $APP_DIR && node -e \"
const { BaileysProvider } = require('./dist/providers/BaileysProvider.js');
(async () => {
    try {
        const provider = new BaileysProvider();
        await provider.initialize();
        await provider.sendMessage('${YOUR_PHONE}@s.whatsapp.net', {
            text: '${emoji} *Deployment Notification*\n\n${message}\n\nTime: \$(date)'
        });
        console.log('Notification sent successfully');
    } catch (error) {
        console.error('Failed to send notification:', error.message);
    }
})();
\"" 2>/dev/null || warn "Could not send WhatsApp notification"
}

# Trap errors
trap 'error "Deployment failed! Check $LOG_FILE for details"; send_notification "Deployment FAILED at step: $BASH_COMMAND" "error"; exit 1' ERR

log "🚀 Starting Production Deployment..."
log "Target: $SERVER"
log "App: $APP_DIR"
log ""

# Step 1: Check local build
log "📦 Step 1/8: Building locally..."
npm run build
log "✅ Local build successful"

# Step 2: Check for uncommitted changes
log "🔍 Step 2/8: Checking for uncommitted changes..."
if [[ -n $(git status -s) ]]; then
    warn "You have uncommitted changes. Commit them first?"
    git status -s
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 3: Push to Git
log "📤 Step 3/8: Pushing to GitHub..."
CURRENT_BRANCH=$(git branch --show-current)
log "Branch: $CURRENT_BRANCH"
git push origin "$CURRENT_BRANCH"
log "✅ Pushed to GitHub"

# Step 4: Connect to server
log "🌐 Step 4/8: Connecting to server..."
if ! ssh -q "$SERVER" exit; then
    error "Cannot connect to $SERVER"
    exit 1
fi
log "✅ Connected to server"

# Step 5: Backup current deployment
log "💾 Step 5/8: Creating backup..."
ssh "$SERVER" "cd $APP_DIR && tar -czf ../backup-\$(date +%Y%m%d-%H%M%S).tar.gz . --exclude=node_modules --exclude=sessions --exclude=.git || true"
log "✅ Backup created"

# Step 6: Pull latest code
log "⬇️  Step 6/8: Pulling latest code..."
ssh "$SERVER" << 'ENDSSH'
cd /root/wAssitenceBot
git fetch origin
git reset --hard origin/main
git pull origin main
ENDSSH
log "✅ Code updated"

# Step 7: Install dependencies, rebuild natives, and build
log "🔨 Step 7/8: Installing dependencies and building..."
ssh "$SERVER" << 'ENDSSH'
cd /root/wAssitenceBot

# Install dependencies
npm install --production=false

# CRITICAL: Rebuild native modules for Linux platform
# This prevents crash loops from macOS-compiled binaries (bcrypt, puppeteer)
echo "🔧 Rebuilding native modules for Linux..."
npm rebuild bcrypt
npm rebuild puppeteer || true  # May not need rebuild but safe to try

# Build TypeScript
npm run build

# Deploy PM2 ecosystem config if exists
if [ -f ecosystem.config.cjs ]; then
    echo "📋 PM2 ecosystem config found - will use for restart"
fi
ENDSSH
log "✅ Dependencies installed, natives rebuilt, and built"

# Step 8: Check if QR code is needed
log "🔐 Step 8/8: Checking authentication status..."
QR_NEEDED=$(ssh "$SERVER" "cd $APP_DIR && [ ! -f sessions/auth_info.json ] && echo 'true' || echo 'false'")

if [[ "$QR_NEEDED" == "true" ]]; then
    warn "⚠️  QR CODE REQUIRED!"
    warn "Sessions directory is empty - bot needs re-authentication"
    send_notification "DEPLOYMENT PAUSED: QR code scan required!\n\nRun: ssh $SERVER\nThen: pm2 logs $PM2_APP_NAME\nScan QR code with WhatsApp" "warning"

    echo ""
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  🔐 QR CODE AUTHENTICATION REQUIRED${NC}"
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo ""
    echo "Run these commands to scan QR code:"
    echo -e "${BLUE}  ssh $SERVER${NC}"
    echo -e "${BLUE}  cd $APP_DIR && pm2 restart $PM2_APP_NAME && pm2 logs $PM2_APP_NAME${NC}"
    echo ""
    read -p "Press Enter after scanning QR code to continue..."
fi

# Restart PM2 with ecosystem config
log "♻️  Restarting application..."
ssh "$SERVER" << 'ENDSSH'
cd /root/wAssitenceBot

# Reset restart counter to clear old crash loop stats
pm2 reset ultrathink 2>/dev/null || true

# Use ecosystem config if available, otherwise standard restart
if [ -f ecosystem.config.cjs ]; then
    echo "🔄 Restarting with ecosystem.config.cjs (restart limits enabled)"
    pm2 reload ecosystem.config.cjs --update-env
else
    echo "🔄 Restarting normally"
    pm2 restart ultrathink
fi
ENDSSH
sleep 5

# Check if app is running
log "🔍 Checking application status..."
APP_STATUS=$(ssh "$SERVER" "pm2 jlist | jq -r '.[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.status'")

if [[ "$APP_STATUS" == "online" ]]; then
    log "✅ Application is running"

    # Check for errors in logs
    sleep 3
    RECENT_ERRORS=$(ssh "$SERVER" "pm2 logs $PM2_APP_NAME --nostream --lines 50 --err | grep -i 'error' | wc -l")

    if [[ $RECENT_ERRORS -gt 0 ]]; then
        warn "Found $RECENT_ERRORS error(s) in recent logs"
        send_notification "Deployment completed but found $RECENT_ERRORS errors in logs. Check: pm2 logs $PM2_APP_NAME" "warning"
    else
        log "✅ No errors in recent logs"
        send_notification "Deployment completed successfully!\n\nBranch: $CURRENT_BRANCH\nStatus: $APP_STATUS" "success"
    fi
else
    error "Application is NOT running! Status: $APP_STATUS"
    send_notification "Deployment FAILED! App status: $APP_STATUS\n\nCheck logs immediately!" "error"
    exit 1
fi

# Show deployment summary
log ""
log "═══════════════════════════════════════"
log "🎉 Deployment Summary"
log "═══════════════════════════════════════"
log "Server: $SERVER"
log "Branch: $CURRENT_BRANCH"
log "Status: $APP_STATUS"
log "Time: $(date)"
log "Logs: $LOG_FILE"
log "═══════════════════════════════════════"
log ""

# Tail logs
echo ""
read -p "View live logs? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ssh "$SERVER" "pm2 logs $PM2_APP_NAME"
fi

log "✅ Deployment complete!"
