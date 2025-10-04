#!/bin/bash

# Railway Deployment Script for WhatsApp Bot
# This script automates the deployment process to Railway

set -e  # Exit on any error

echo "🚀 Starting Railway Deployment..."
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway (opens browser)
echo "📝 Logging into Railway..."
railway login

# Initialize Railway project (if not already initialized)
echo "🏗️  Initializing Railway project..."
railway init || echo "Project already initialized"

# Link to existing project or create new one
echo ""
echo "Select your Railway project or create a new one"
railway link

# Add PostgreSQL database
echo ""
echo "📦 Adding PostgreSQL database..."
railway add --database postgresql || echo "PostgreSQL already added"

# Add Redis database
echo ""
echo "📦 Adding Redis database..."
railway add --database redis || echo "Redis already added"

# Set environment variables
echo ""
echo "🔧 Setting environment variables..."

read -p "Enter your OpenAI API key: " OPENAI_KEY

railway variables set NODE_ENV=production
railway variables set SESSION_PATH=/app/sessions
railway variables set MESSAGE_PROVIDER=baileys
railway variables set LOG_LEVEL=info
railway variables set PORT=7100
railway variables set OPENAI_API_KEY="$OPENAI_KEY"

echo ""
echo "✅ Environment variables set!"

# Deploy to Railway
echo ""
echo "🚀 Deploying to Railway..."
railway up --detach

echo ""
echo "⏳ Waiting for deployment to complete (30 seconds)..."
sleep 30

# Run database migrations
echo ""
echo "🗄️  Running database migrations..."
railway run npm run migrate:up

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📱 Next steps:"
echo "1. Check logs for QR code: railway logs"
echo "2. Scan QR code with WhatsApp"
echo "3. Your bot will stay online 24/7!"
echo ""
echo "🔗 Useful commands:"
echo "  railway logs          - View live logs"
echo "  railway status        - Check deployment status"
echo "  railway open          - Open Railway dashboard"
echo "  railway run [cmd]     - Run commands in Railway environment"
