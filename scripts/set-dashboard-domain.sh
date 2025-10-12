#!/bin/bash

# Set Dashboard Domain for Production
# Sets DASHBOARD_URL to https://ailo.digital

set -e

SERVER_USER="root"
SERVER_HOST="167.71.145.9"
PROJECT_DIR="/root/wAssitenceBot"
DOMAIN="https://ailo.digital"

echo "🔧 Setting DASHBOARD_URL to ${DOMAIN}..."

ssh ${SERVER_USER}@${SERVER_HOST} << ENDSSH
  cd ${PROJECT_DIR}

  # Check if .env exists
  if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
  fi

  # Backup .env
  cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)

  # Remove old DASHBOARD_URL if exists
  sed -i '/^DASHBOARD_URL=/d' .env

  # Add new DASHBOARD_URL
  echo "DASHBOARD_URL=${DOMAIN}" >> .env

  echo "✅ DASHBOARD_URL set to ${DOMAIN}"

  # Restart PM2
  echo "🔄 Restarting PM2..."
  pm2 restart whatsapp-bot --update-env

  echo "✅ Done! Dashboard will now use ${DOMAIN}"
ENDSSH

echo ""
echo "✅ Dashboard domain updated successfully!"
echo "🌐 New URL format: ${DOMAIN}/d/{token}"
