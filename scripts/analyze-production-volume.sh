#!/bin/bash
# Analyze production message volume to find the 420 NIS cost cause

echo "========================================="
echo "Production Message Volume Analysis"
echo "========================================="
echo ""

# Check if we can connect
echo "1. Checking production access..."
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@192.53.121.229 "echo 'Connected successfully'" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Cannot connect to production server"
    echo "Please run manually on server:"
    echo "  ssh root@192.53.121.229"
    echo "  cd /root/whatsapp-bot"
    echo "  pm2 logs --lines 5000 | grep 'Processing message' | wc -l"
    exit 1
fi

echo ""
echo "2. Counting messages in last 24 hours..."
ssh -o StrictHostKeyChecking=no root@192.53.121.229 << 'ENDSSH'
cd /root/whatsapp-bot

# Count total messages
echo "📊 Total messages processed:"
pm2 logs --lines 5000 --nostream 2>/dev/null | grep -c "Processing message"

echo ""
echo "📊 Messages by hour (last 24h):"
pm2 logs --lines 5000 --nostream 2>/dev/null | grep "Processing message" | awk '{print $2}' | cut -d: -f1 | sort | uniq -c | tail -24

echo ""
echo "📊 Unique users:"
pm2 logs --lines 5000 --nostream 2>/dev/null | grep "Processing message from" | awk '{print $NF}' | sort -u | wc -l

echo ""
echo "📊 Top 10 most active users:"
pm2 logs --lines 5000 --nostream 2>/dev/null | grep "Processing message from" | awk '{print $NF}' | sort | uniq -c | sort -rn | head -10

echo ""
echo "📊 AI model calls (Ensemble):"
pm2 logs --lines 5000 --nostream 2>/dev/null | grep -c "Ensemble classification"

echo ""
echo "📊 NLP processing:"
pm2 logs --lines 5000 --nostream 2>/dev/null | grep -c "Using V2 Pipeline"

echo ""
echo "📊 Errors:"
pm2 logs --lines 1000 --nostream --err 2>/dev/null | tail -20

echo ""
echo "📊 Recent message sample (last 20):"
pm2 logs --lines 500 --nostream 2>/dev/null | grep "Processing message from" | tail -20

ENDSSH

echo ""
echo "========================================="
echo "Analysis complete!"
echo "========================================="
