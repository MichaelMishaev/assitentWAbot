#!/bin/bash

# DigitalOcean Droplet Setup Script for WhatsApp Bot
# Run this script on your Ubuntu droplet as root

set -e

echo "🚀 Starting DigitalOcean deployment setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Update system
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install essential packages
print_status "Installing essential packages..."
apt install -y curl wget git nginx certbot python3-certbot-nginx ufw

# Install Node.js 20
print_status "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
print_status "Node.js installed: $NODE_VERSION"

# Install PostgreSQL
print_status "Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Install Redis
print_status "Installing Redis..."
apt install -y redis-server

# Configure Redis
print_status "Configuring Redis..."
sed -i 's/^# requirepass foobared/requirepass whatsapp_redis_2024/' /etc/redis/redis.conf
sed -i 's/^bind 127.0.0.1 ::1/bind 127.0.0.1/' /etc/redis/redis.conf

# Start Redis
systemctl restart redis-server
systemctl enable redis-server

# Install PM2
print_status "Installing PM2..."
npm install -g pm2

# Set up PM2 startup
print_status "Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root

# Configure firewall
print_status "Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 80
ufw allow 443
ufw --force enable

# Create application directory
print_status "Creating application directory..."
mkdir -p /var/www/whatsapp-bot
cd /var/www/whatsapp-bot

print_status "✅ Server setup complete!"
print_warning "Next steps:"
echo "1. Clone your repository to /var/www/whatsapp-bot"
echo "2. Create .env file with your configuration"
echo "3. Run 'npm ci && npm run build'"
echo "4. Set up database with 'npm run migrate:up'"
echo "5. Start with 'pm2 start dist/index.js --name whatsapp-bot'"

print_status "Database setup commands:"
echo "sudo -u postgres createdb whatsapp_bot"
echo "sudo -u postgres createuser -P bot_user"
echo "sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE whatsapp_bot TO bot_user;\""

print_status "🎉 Setup script completed successfully!"