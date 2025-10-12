# Local Development Databases - Docker Setup

Complete guide for running PostgreSQL and Redis locally using Docker.

---

## 🐳 Overview

**Setup:** Docker Compose with PostgreSQL and Redis
**Purpose:** Local development environment (faster, isolated, no cloud dependency)
**Ports:** 7000-7500 range for all services

---

## 📋 Services Configuration

### PostgreSQL
- **Image:** `postgres:15-alpine`
- **Container Name:** `whatsapp-bot-postgres`
- **Port:** `7432` (host) → `5432` (container)
- **Credentials:**
  - User: `postgres`
  - Password: `postgres`
  - Database: `whatsapp_bot`
- **Volume:** `postgres_data` (persistent storage)
- **Health Check:** Automatic via `pg_isready`

### Redis
- **Image:** `redis:7-alpine`
- **Container Name:** `whatsapp-bot-redis`
- **Port:** `7379` (host) → `6379` (container)
- **Volume:** `redis_data` (persistent storage with AOF)
- **Configuration:** Append-only mode enabled for data persistence
- **Health Check:** Automatic via `redis-cli ping`

### Application Server
- **Port:** `7100`
- **Technology:** Node.js + TypeScript
- **Hot Reload:** Enabled via nodemon

---

## 🚀 Quick Start

### 1. Start All Services

```bash
# Start PostgreSQL + Redis in background
docker-compose up -d

# Verify containers are running
docker-compose ps
```

**Expected output:**
```
NAME                    STATUS                 PORTS
whatsapp-bot-postgres   Up (healthy)          0.0.0.0:7432->5432/tcp
whatsapp-bot-redis      Up (healthy)          0.0.0.0:7379->6379/tcp
```

### 2. Run Database Migration

```bash
# Create all tables
npx ts-node scripts/run-migration.ts
```

**Creates:**
- `users` table
- `contacts` table
- `events` table
- `reminders` table
- `sessions` table

### 3. Start Application

```bash
npm run dev
```

**Server starts on:** `http://localhost:7100`

### 4. Verify Everything Works

```bash
# Test health endpoint
curl http://localhost:7100/health
```

**Expected response:**
```json
{
  "status": "ok",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

## ⚙️ Environment Configuration

**File:** `.env`

```bash
# Database (Local Docker PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:7432/whatsapp_bot

# Redis (Local Docker Redis)
REDIS_URL=redis://localhost:7379

# Application Server
PORT=7100

# Other settings
NODE_ENV=development
SESSION_PATH=./sessions
LOG_LEVEL=info
```

---

## 📂 Docker Compose File

**File:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: whatsapp-bot-postgres
    restart: unless-stopped
    ports:
      - "7432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: whatsapp_bot
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: whatsapp-bot-redis
    restart: unless-stopped
    ports:
      - "7379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

---

## 🛠️ Common Commands

### Docker Management

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose stop

# Stop and remove containers (data persists)
docker-compose down

# Stop and remove everything including volumes (DESTRUCTIVE)
docker-compose down -v

# View logs
docker-compose logs -f

# Check container status
docker-compose ps

# Restart a specific service
docker-compose restart postgres
docker-compose restart redis
```

### Database Operations

```bash
# Connect to PostgreSQL
docker exec -it whatsapp-bot-postgres psql -U postgres -d whatsapp_bot

# Run SQL query
docker exec -it whatsapp-bot-postgres psql -U postgres -d whatsapp_bot -c "SELECT * FROM users;"

# Backup database
docker exec whatsapp-bot-postgres pg_dump -U postgres whatsapp_bot > backup.sql

# Restore database
cat backup.sql | docker exec -i whatsapp-bot-postgres psql -U postgres -d whatsapp_bot
```

### Redis Operations

```bash
# Connect to Redis CLI
docker exec -it whatsapp-bot-redis redis-cli

# Test Redis
docker exec -it whatsapp-bot-redis redis-cli ping

# View all keys
docker exec -it whatsapp-bot-redis redis-cli KEYS '*'

# Clear all data
docker exec -it whatsapp-bot-redis redis-cli FLUSHALL
```

---

## 🔍 Connection Details

### From Application (Node.js)

```typescript
// PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:7432/whatsapp_bot

// Redis
REDIS_URL=redis://localhost:7379
```

### From External Tools (pgAdmin, DBeaver, etc.)

**PostgreSQL:**
- Host: `localhost`
- Port: `7432`
- Database: `whatsapp_bot`
- Username: `postgres`
- Password: `postgres`

**Redis:**
- Host: `localhost`
- Port: `7379`
- No password required

---

## 📊 Data Persistence

### How It Works

**Volumes are created automatically:**
- `wassitencebot_postgres_data` - PostgreSQL data
- `wassitencebot_redis_data` - Redis data

**Data persists across:**
- ✅ Container restarts (`docker-compose restart`)
- ✅ Container stops (`docker-compose stop`)
- ✅ Container recreation (`docker-compose down` then `up`)

**Data is destroyed only when:**
- ❌ Running `docker-compose down -v` (removes volumes)
- ❌ Manually deleting volumes: `docker volume rm wassitencebot_postgres_data`

### View Volumes

```bash
# List all volumes
docker volume ls

# Inspect volume
docker volume inspect wassitencebot_postgres_data

# View disk usage
docker system df -v
```

---

## 🐛 Troubleshooting

### Port Already in Use

**Error:** `address already in use :7432`

```bash
# Find process using the port
lsof -i :7432

# Kill the process
kill -9 <PID>

# Or use different port in docker-compose.yml
ports:
  - "7433:5432"  # Changed from 7432
```

### Container Won't Start

```bash
# View logs
docker-compose logs postgres
docker-compose logs redis

# Remove and recreate
docker-compose down
docker-compose up -d
```

### Database Connection Failed

```bash
# Check container is healthy
docker-compose ps

# Test connection
docker exec -it whatsapp-bot-postgres psql -U postgres -c "SELECT 1"

# Check .env file has correct DATABASE_URL
cat .env | grep DATABASE_URL
```

### Redis Connection Failed

```bash
# Test Redis
docker exec -it whatsapp-bot-redis redis-cli ping

# Should return: PONG

# Check .env file
cat .env | grep REDIS_URL
```

### Migration Failed

```bash
# Check if database exists
docker exec -it whatsapp-bot-postgres psql -U postgres -l

# Create database if missing
docker exec -it whatsapp-bot-postgres psql -U postgres -c "CREATE DATABASE whatsapp_bot;"

# Run migration again
npx ts-node scripts/run-migration.ts
```

---

## 🔄 Reset Everything

### Fresh Start (Keep Code)

```bash
# Stop and remove containers + volumes
docker-compose down -v

# Start fresh
docker-compose up -d

# Wait for healthy
sleep 5

# Run migration
npx ts-node scripts/run-migration.ts

# Start app
npm run dev
```

---

## 📈 Performance Monitoring

### PostgreSQL

```bash
# Active connections
docker exec -it whatsapp-bot-postgres psql -U postgres -d whatsapp_bot -c "SELECT count(*) FROM pg_stat_activity;"

# Database size
docker exec -it whatsapp-bot-postgres psql -U postgres -d whatsapp_bot -c "SELECT pg_size_pretty(pg_database_size('whatsapp_bot'));"

# Table sizes
docker exec -it whatsapp-bot-postgres psql -U postgres -d whatsapp_bot -c "SELECT schemaname,relname,n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

### Redis

```bash
# Memory usage
docker exec -it whatsapp-bot-redis redis-cli INFO memory | grep used_memory_human

# Number of keys
docker exec -it whatsapp-bot-redis redis-cli DBSIZE

# Stats
docker exec -it whatsapp-bot-redis redis-cli INFO stats
```

---

## 🚀 Production vs Development

### Development (Current Setup)
- **Database:** Local Docker on port 7432
- **Redis:** Local Docker on port 7379
- **Data:** Persists in Docker volumes
- **Backup:** Manual

### Production (Railway)
- **Database:** Railway PostgreSQL (managed)
- **Redis:** Railway Redis (managed)
- **Data:** Automatic backups
- **Scaling:** Auto-scaling enabled

### Switching to Production

Update `.env`:
```bash
# Use Railway URLs (from Railway dashboard)
DATABASE_URL=postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway
REDIS_URL=redis://default:PASSWORD@redis.railway.internal:6379
PORT=3000
```

---

## 💾 Backup Strategy

### Manual Backup

```bash
# Full database backup
docker exec whatsapp-bot-postgres pg_dump -U postgres whatsapp_bot > backup_$(date +%Y%m%d).sql

# Compressed backup
docker exec whatsapp-bot-postgres pg_dump -U postgres whatsapp_bot | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Automated Backup (Cron)

```bash
# Add to crontab (crontab -e)
0 2 * * * docker exec whatsapp-bot-postgres pg_dump -U postgres whatsapp_bot | gzip > /path/to/backups/backup_$(date +\%Y\%m\%d).sql.gz
```

---

## 🔒 Security Notes

### Development Setup (Current)
- ⚠️ Default passwords (postgres/postgres)
- ⚠️ No Redis password
- ⚠️ Ports exposed on localhost only
- ✅ **Safe for local development**

### If Exposing Publicly (DON'T!)
- ❌ Never expose ports 7432/7379 publicly
- ❌ Never use default passwords in production
- ❌ Never push .env with real credentials to Git

---

## ✅ Checklist

### First Time Setup
- [x] Docker installed and running
- [x] `docker-compose.yml` created
- [x] `.env` configured with ports 7432, 7379, 7100
- [x] Run `docker-compose up -d`
- [x] Run migration
- [x] Test health endpoint

### Daily Development
- [ ] `docker-compose up -d` (if containers stopped)
- [ ] `npm run dev`
- [ ] Code, test, commit
- [ ] `docker-compose stop` (optional, when done)

### When Things Break
- [ ] Check `docker-compose ps` (are containers healthy?)
- [ ] Check `docker-compose logs` (any errors?)
- [ ] Try `docker-compose restart`
- [ ] Last resort: `docker-compose down -v && docker-compose up -d`

---

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Redis Docker Image](https://hub.docker.com/_/redis)
- [Our Main Docs](../START_HERE.md)

---

**Last Updated:** 2025-10-01
**Status:** ✅ Working and tested
**Ports:** PostgreSQL: 7432, Redis: 7379, App: 7100
