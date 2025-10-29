#!/bin/bash

echo "🔍 Checking Production Bot Logs for Cron Initialization..."
echo ""

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo "📋 PM2 Logs (last 50 lines):"
    echo "─────────────────────────────────────────────────"
    pm2 logs --lines 50 --nostream | grep -E "(DailyScheduler|MorningSummary|Daily scheduler|repeatable job)"
    echo ""
else
    echo "⚠️  PM2 not found, checking log files..."
    echo ""
fi

# Check log files
if [ -d "logs" ]; then
    echo "📁 Checking logs directory:"
    echo "─────────────────────────────────────────────────"

    # Find the most recent log file
    LATEST_LOG=$(ls -t logs/*.log 2>/dev/null | head -1)

    if [ -n "$LATEST_LOG" ]; then
        echo "Latest log: $LATEST_LOG"
        echo ""

        # Check for initialization messages
        echo "🔎 Searching for DailyScheduler initialization:"
        grep -i "dailyscheduler\|morning.*summary.*worker\|repeatable job" "$LATEST_LOG" | tail -20
        echo ""

        # Check for errors
        echo "❌ Recent errors:"
        grep -i "error.*dailyscheduler\|error.*morning" "$LATEST_LOG" | tail -10
        echo ""
    else
        echo "⚠️  No log files found in logs/ directory"
    fi
else
    echo "⚠️  logs/ directory not found"
fi

echo ""
echo "📊 Redis Connection Check:"
echo "─────────────────────────────────────────────────"

# Try to ping Redis (if redis-cli is available)
if command -v redis-cli &> /dev/null; then
    echo "Checking local Redis..."
    redis-cli ping 2>/dev/null || echo "Local Redis not responding"
else
    echo "redis-cli not found, skipping Redis check"
fi

echo ""
echo "💡 Manual Check Instructions:"
echo "─────────────────────────────────────────────────"
echo "1. SSH to production server"
echo "2. Check PM2 logs: pm2 logs | grep -i daily"
echo "3. Check if bot started: pm2 list"
echo "4. Restart bot: pm2 restart all"
echo "5. Watch logs: pm2 logs --lines 100"
echo ""
