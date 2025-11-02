#!/bin/bash

# Production Deployment Script - Optimized for Low-Memory Servers (512MB)
# Strategy: Build locally → Push to GitHub → Rsync dist → Restart
# This avoids TypeScript compilation on the 512MB server

set -e

# Configuration
SERVER="root@167.71.145.9"
APP_DIR="/root/wAssitenceBot"
PM2_APP_NAME="ultrathink"
YOUR_PHONE="972555030746"

# Deployment locking
LOCK_FILE="/tmp/wAssitenceBot.deploy.lock"

# Check for existing deployment
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if ps -p $LOCK_PID > /dev/null 2>&1; then
    echo "❌ Deployment already running (PID: $LOCK_PID)"
    echo "If you're sure no deployment is running, remove: $LOCK_FILE"
    exit 1
  else
    echo "⚠️  Stale lock file found (PID $LOCK_PID not running), removing..."
    rm -f "$LOCK_FILE"
  fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
LOG_FILE="logs/deployment-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

# Trap errors
trap 'error "Deployment failed! Check $LOG_FILE for details"; exit 1' ERR

log "🚀 Starting Production Deployment (Optimized for 512MB)"
log "Strategy: Local build → GitHub → Rsync → Restart"
log "Target: $SERVER"
log "App: $APP_DIR"
log ""

# Step 1: Check for uncommitted changes
log "🔍 Step 1/7: Checking for uncommitted changes..."
if [[ -n $(git status -s) ]]; then
    warn "You have uncommitted changes:"
    git status -s
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
log "✅ Git status checked"

# Step 2: Build locally (FAST - done on your machine with lots of RAM)
log "📦 Step 2/7: Building locally..."
npm run build
log "✅ Local build successful (TypeScript compiled locally)"

# Step 3: Push to GitHub (source of truth)
log "📤 Step 3/7: Pushing to GitHub..."
CURRENT_BRANCH=$(git branch --show-current)
log "Branch: $CURRENT_BRANCH"
git push origin "$CURRENT_BRANCH"
log "✅ Pushed to GitHub"

# Step 4: Pull source code on server (without building)
log "⬇️  Step 4/7: Pulling source code on server..."
ssh "$SERVER" << 'ENDSSH'
cd /root/wAssitenceBot

# Remove git lock files if exists (prevents hanging)
rm -f .git/*.lock .git/refs/heads/*.lock 2>/dev/null || true

# Pull latest code (source only, no build)
git fetch origin
git reset --hard origin/main
git pull origin main

# Ensure node_modules are installed (one-time or when package.json changes)
# Only installs if needed (npm checks timestamps)
npm install --production=false --prefer-offline
ENDSSH
log "✅ Source code updated on server"

# Step 5: Rsync dist folder (FAST - only transfers changed files)
log "🚀 Step 5/7: Syncing compiled code to server..."
log "Transferring dist/ folder via rsync..."

# Rsync only the dist folder (much faster than building remotely)
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='sessions' \
  --exclude='.git' \
  --exclude='logs' \
  --exclude='*.log' \
  ./dist/ "$SERVER:$APP_DIR/dist/"

log "✅ Compiled code synced (rsync completed)"

# Step 6: Quick server check and native module rebuild (only if needed)
log "🔧 Step 6/7: Checking native modules..."
ssh "$SERVER" << 'ENDSSH'
cd /root/wAssitenceBot

# Only rebuild natives if they're problematic (skip if working)
# This saves time and memory
if pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="ultrathink") | .pm2_env.status' | grep -q "errored"; then
    echo "⚠️  App was errored, rebuilding native modules..."
    npm rebuild bcrypt
else
    echo "✅ Native modules OK (skipping rebuild)"
fi
ENDSSH
log "✅ Native modules checked"

# Step 7: Restart PM2
log "♻️  Step 7/7: Restarting application..."
ssh "$SERVER" << 'ENDSSH'
cd /root/wAssitenceBot

# Reset restart counter
pm2 reset ultrathink 2>/dev/null || true

# Restart with ecosystem config
if [ -f ecosystem.config.cjs ]; then
    echo "🔄 Restarting with ecosystem.config.cjs (crash limits enabled)"
    pm2 restart ecosystem.config.cjs --update-env
else
    echo "🔄 Restarting normally"
    pm2 restart ultrathink
fi
ENDSSH

# Wait for app to start
log "⏳ Waiting for app to start..."
sleep 5

# Check if app is running
log "🔍 Checking application status..."
APP_STATUS=$(ssh "$SERVER" "pm2 jlist | jq -r '.[] | select(.name==\"$PM2_APP_NAME\") | .pm2_env.status'")

if [[ "$APP_STATUS" == "online" ]]; then
    log "✅ Application is running"

    # Get stats
    APP_INFO=$(ssh "$SERVER" "pm2 jlist | jq -r '.[] | select(.name==\"$PM2_APP_NAME\") | {uptime: .pm2_env.pm_uptime, restarts: .pm2_env.restart_time, memory: .monit.memory}'")

    log "📊 App Info: $APP_INFO"

    # Check for recent errors
    sleep 2
    RECENT_ERRORS=$(ssh "$SERVER" "tail -100 $APP_DIR/logs/pm2-error.log 2>/dev/null | grep -i 'error' | tail -5 | wc -l || echo 0")

    if [[ $RECENT_ERRORS -gt 0 ]]; then
        warn "Found errors in recent logs - check: pm2 logs $PM2_APP_NAME"
    else
        log "✅ No recent errors"
    fi
else
    error "Application is NOT running! Status: $APP_STATUS"
    error "Check logs: ssh $SERVER 'pm2 logs $PM2_APP_NAME'"
    exit 1
fi

# Deployment summary
log ""
log "═══════════════════════════════════════"
log "🎉 Deployment Complete!"
log "═══════════════════════════════════════"
log "Server: $SERVER"
log "Branch: $CURRENT_BRANCH"
log "Status: $APP_STATUS"
log "Time: $(date)"
log "Log File: $LOG_FILE"
log "═══════════════════════════════════════"
log ""
log "✅ Deployment successful!"
log ""
log "Next steps:"
log "  - View logs: ssh $SERVER 'pm2 logs $PM2_APP_NAME'"
log "  - Monitor: ssh $SERVER 'pm2 monit'"
log "  - Status: ssh $SERVER 'pm2 status $PM2_APP_NAME'"
log ""

# Offer to view logs
read -p "View live logs now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ssh "$SERVER" "pm2 logs $PM2_APP_NAME"
fi
