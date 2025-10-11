#!/bin/bash

# Database Backup Script for WhatsApp Assistant Bot
# Automatically backs up PostgreSQL database before major changes

set -e  # Exit on error

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Configuration
BACKUP_DIR="./backups/database"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"
LATEST_LINK="$BACKUP_DIR/latest.sql"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Starting database backup...${NC}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Parse DATABASE_URL to get connection details
# Format: postgresql://user:password@host:port/dbname
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ ERROR: DATABASE_URL not set in environment${NC}"
    exit 1
fi

# Extract components from DATABASE_URL
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "📊 Database: $DB_NAME"
echo "🖥️  Host: $DB_HOST:$DB_PORT"
echo "👤 User: $DB_USER"

# Perform backup
echo -e "${YELLOW}💾 Creating backup...${NC}"

PGPASSWORD=$DB_PASS pg_dump \
    -h $DB_HOST \
    -p $DB_PORT \
    -U $DB_USER \
    -d $DB_NAME \
    --clean \
    --if-exists \
    --verbose \
    -f "$BACKUP_FILE" 2>&1 | grep -v "^pg_dump"

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo "📁 File: $BACKUP_FILE"

    # Get file size
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "📦 Size: $SIZE"

    # Create/update 'latest' symlink
    ln -sf "$(basename $BACKUP_FILE)" "$LATEST_LINK"
    echo "🔗 Latest backup linked"

    # Count tables backed up
    TABLE_COUNT=$(grep -c "^CREATE TABLE" "$BACKUP_FILE" || true)
    echo "📋 Tables backed up: $TABLE_COUNT"

    # Keep only last 10 backups (cleanup old ones)
    echo -e "${YELLOW}🧹 Cleaning up old backups...${NC}"
    ls -t "$BACKUP_DIR"/backup_*.sql | tail -n +11 | xargs -r rm
    REMAINING=$(ls -1 "$BACKUP_DIR"/backup_*.sql | wc -l)
    echo "📦 Backups retained: $REMAINING"

    echo -e "${GREEN}✅ Backup complete!${NC}"
    exit 0
else
    echo -e "${RED}❌ Backup failed!${NC}"
    rm -f "$BACKUP_FILE"  # Clean up partial backup
    exit 1
fi
