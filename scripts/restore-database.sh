#!/bin/bash

# Database Restore Script for WhatsApp Assistant Bot
# Restores PostgreSQL database from backup

set -e  # Exit on error

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Configuration
BACKUP_DIR="./backups/database"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Database Restore Utility${NC}"
echo ""

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}❌ ERROR: Backup directory not found: $BACKUP_DIR${NC}"
    exit 1
fi

# List available backups
echo "📋 Available backups:"
echo ""
ls -lh "$BACKUP_DIR"/backup_*.sql 2>/dev/null | awk '{print $9, "(" $5 ")"}'

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ No backups found${NC}"
    exit 1
fi

echo ""

# Determine which backup to restore
if [ -n "$1" ]; then
    BACKUP_FILE="$1"
else
    # Use latest backup
    BACKUP_FILE="$BACKUP_DIR/latest.sql"
    echo -e "${YELLOW}📌 Using latest backup${NC}"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ ERROR: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo "📁 Restore from: $BACKUP_FILE"
echo ""

# Confirmation prompt
echo -e "${RED}⚠️  WARNING: This will OVERWRITE your current database!${NC}"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}❌ Restore cancelled${NC}"
    exit 0
fi

# Parse DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ ERROR: DATABASE_URL not set in environment${NC}"
    exit 1
fi

DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "📊 Database: $DB_NAME"
echo "🖥️  Host: $DB_HOST:$DB_PORT"
echo ""

# Perform restore
echo -e "${YELLOW}💾 Restoring database...${NC}"

PGPASSWORD=$DB_PASS psql \
    -h $DB_HOST \
    -p $DB_PORT \
    -U $DB_USER \
    -d $DB_NAME \
    -f "$BACKUP_FILE" \
    --quiet

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database restored successfully!${NC}"
    exit 0
else
    echo -e "${RED}❌ Restore failed!${NC}"
    exit 1
fi
