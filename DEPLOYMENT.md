# Deployment Guide - WhatsApp Assistant Bot

## 🚀 Quick Reference

```bash
# SSH Access
ssh root@167.71.145.9

# Deploy new changes
ssh root@167.71.145.9 "cd wAssitenceBot && git pull && npm install && npm run build && pm2 restart ultrathink --update-env"

# View logs
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink"

# Check status
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 status"
```

---

## 📋 Table of Contents

1. [SSH Deployment](#ssh-deployment)
2. [Deploying Changes](#deploying-changes)
3. [Managing the Application](#managing-the-application)
4. [Troubleshooting](#troubleshooting)
5. [Environment Variables](#environment-variables)

---

## 🔧 SSH Deployment

### Server Information
- **Host:** `167.71.145.9`
- **User:** `root`
- **App Directory:** `/root/wAssitenceBot`
- **App Name (PM2):** `ultrathink`
- **Port:** `8080`

### First Time Deployment

```bash
# 1. SSH into server
ssh root@167.71.145.9

# 2. Clone repository (if not already done)
cd ~
git clone <your-repo-url> wAssitenceBot
cd wAssitenceBot

# 3. Install dependencies
npm install

# 4. Setup environment variables
nano .env
# Add all required variables (see Environment Variables section)

# 5. Build the project
npm run build

# 6. Start with PM2
pm2 start dist/index.js --name ultrathink
pm2 save
pm2 startup  # Follow instructions to enable auto-start on reboot

# 7. Verify it's running
pm2 status
pm2 logs ultrathink --lines 30
```

---

## 🔄 Deploying Changes

### Standard Deployment Workflow

**Step 1: Local Development**

```bash
# Make your changes locally
# Test locally
npm run dev

# Commit and push to GitHub
git add .
git commit -m "Your commit message"
git push origin main
```

**Step 2: Deploy to Production**

```bash
# One-line deployment (from your local machine)
ssh root@167.71.145.9 "cd wAssitenceBot && git pull origin main && npm install && npm run build && pm2 restart ultrathink --update-env && pm2 logs ultrathink --lines 30 --nostream"
```

**Step 3: Verify Deployment**

```bash
# Check app status
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 status"

# View recent logs
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --lines 50 --nostream"

# Test health endpoint
ssh root@167.71.145.9 "curl http://localhost:8080/health"
```

### Deployment Examples by Scenario

#### Scenario 1: Quick Bug Fix (No New Dependencies)

```bash
# Local
git add .
git commit -m "Fix: Handle undefined user in NLP service"
git push origin main

# Deploy (fast - skip npm install)
ssh root@167.71.145.9 "cd wAssitenceBot && git pull && npm run build && pm2 restart ultrathink --update-env"
```

#### Scenario 2: New Feature with Dependencies

```bash
# Local
npm install new-package
# ... make changes ...
git add .
git commit -m "Feature: Add event export functionality"
git push origin main

# Deploy (full install)
ssh root@167.71.145.9 "cd wAssitenceBot && git pull && npm install && npm run build && pm2 restart ultrathink --update-env"
```

#### Scenario 3: Database Migration

```bash
# Local
npm run migrate:create add-new-table
# Edit migration file
git add .
git commit -m "Migration: Add new table"
git push origin main

# Deploy with migration
ssh root@167.71.145.9 "cd wAssitenceBot && git pull && npm install && npm run migrate:up && npm run build && pm2 restart ultrathink --update-env"
```

#### Scenario 4: Environment Variable Update

```bash
# Update .env on remote
ssh root@167.71.145.9 "cd wAssitenceBot && nano .env"
# OR use sed for specific variable
ssh root@167.71.145.9 "cd wAssitenceBot && sed -i 's|OPENAI_API_KEY=.*|OPENAI_API_KEY=sk-proj-NEW_KEY|' .env"

# Restart with updated env (IMPORTANT: use --update-env flag)
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 restart ultrathink --update-env"
```

#### Scenario 5: Rebuild Native Modules (bcrypt, etc.)

```bash
# If you get "invalid ELF header" errors
ssh root@167.71.145.9 "cd wAssitenceBot && npm rebuild bcrypt && pm2 restart ultrathink --update-env"

# Or rebuild all native modules
ssh root@167.71.145.9 "cd wAssitenceBot && npm rebuild && pm2 restart ultrathink --update-env"
```

---

## 🎮 Managing the Application

### PM2 Process Management

```bash
# View all PM2 processes
ssh root@167.71.145.9 "pm2 status"

# Start the app
ssh root@167.71.145.9 "pm2 start ultrathink"

# Stop the app
ssh root@167.71.145.9 "pm2 stop ultrathink"

# Restart the app
ssh root@167.71.145.9 "pm2 restart ultrathink"

# Restart with updated environment variables (ALWAYS use this after .env changes)
ssh root@167.71.145.9 "pm2 restart ultrathink --update-env"

# Delete from PM2 (stop and remove)
ssh root@167.71.145.9 "pm2 delete ultrathink"

# View detailed info
ssh root@167.71.145.9 "pm2 show ultrathink"

# Monitor CPU/Memory in real-time
ssh root@167.71.145.9 "pm2 monit"

# Save PM2 process list (persist across reboots)
ssh root@167.71.145.9 "pm2 save"

# Clear PM2 logs
ssh root@167.71.145.9 "pm2 flush ultrathink"
```

### Viewing Logs

```bash
# Real-time logs (streaming)
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink"

# Last 100 lines (no streaming)
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --lines 100 --nostream"

# Only error logs
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --err"

# Filter logs with grep
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --nostream | grep -i 'error'"
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --nostream | grep -i 'nlp'"
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --nostream | grep -i 'whatsapp'"
```

### Git Operations on Remote

```bash
# Check current status
ssh root@167.71.145.9 "cd wAssitenceBot && git status"

# View recent commits
ssh root@167.71.145.9 "cd wAssitenceBot && git log --oneline -10"

# Pull latest changes
ssh root@167.71.145.9 "cd wAssitenceBot && git pull origin main"

# Discard local changes (BE CAREFUL!)
ssh root@167.71.145.9 "cd wAssitenceBot && git reset --hard origin/main"

# Check which branch you're on
ssh root@167.71.145.9 "cd wAssitenceBot && git branch"

# View remote URL
ssh root@167.71.145.9 "cd wAssitenceBot && git remote -v"
```

---

## 🐛 Troubleshooting

### Common Issues and Solutions

#### 1. **bcrypt Module Error**

**Error:** `invalid ELF header` or `ERR_DLOPEN_FAILED`

**Cause:** Native modules compiled for different architecture

**Solution:**
```bash
ssh root@167.71.145.9 "cd wAssitenceBot && npm rebuild bcrypt && pm2 restart ultrathink --update-env"
```

#### 2. **Application Crashes on Start**

**Check error logs:**
```bash
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --err --lines 50"
```

**Common causes:**
- Missing environment variables
- Database connection failure
- Redis connection failure
- Port already in use

**Solution:**
```bash
# Check environment variables
ssh root@167.71.145.9 "cd wAssitenceBot && grep -v '^#' .env | grep -v '^$'"

# Test database connection
ssh root@167.71.145.9 "cd wAssitenceBot && psql \$DATABASE_URL -c 'SELECT 1'"

# Test Redis connection
ssh root@167.71.145.9 "redis-cli -u \$REDIS_URL ping"

# Check what's using port 8080
ssh root@167.71.145.9 "lsof -i :8080"
```

#### 3. **OpenAI API Not Working**

**Symptoms:** Bot responds with "לא הבנתי את הבקשה" to all messages

**Check API key:**
```bash
ssh root@167.71.145.9 "cd wAssitenceBot && grep OPENAI_API_KEY .env"
```

**Solution:**
```bash
# Update API key in .env
ssh root@167.71.145.9 "cd wAssitenceBot && sed -i 's|OPENAI_API_KEY=.*|OPENAI_API_KEY=sk-proj-YOUR_KEY|' .env && pm2 restart ultrathink --update-env"

# Test OpenAI connection
ssh root@167.71.145.9 "cd wAssitenceBot && node -e \"import('openai').then(m => { const o = new m.default({apiKey: process.env.OPENAI_API_KEY}); o.chat.completions.create({model:'gpt-4o-mini',messages:[{role:'user',content:'test'}],max_tokens:5}).then(() => console.log('✅ OpenAI OK')).catch(e => console.error('❌ Error:', e.message)); })\""
```

#### 4. **Git Pull Conflicts**

**Error:** `error: Your local changes to the following files would be overwritten by merge`

**Solution:**
```bash
# Option 1: Stash changes
ssh root@167.71.145.9 "cd wAssitenceBot && git stash && git pull origin main && git stash pop"

# Option 2: Discard local changes (BE CAREFUL!)
ssh root@167.71.145.9 "cd wAssitenceBot && git reset --hard origin/main && git pull origin main"
```

#### 5. **TypeScript Build Errors**

```bash
# Clean build
ssh root@167.71.145.9 "cd wAssitenceBot && rm -rf dist && npm run build"

# Check for TypeScript errors without building
ssh root@167.71.145.9 "cd wAssitenceBot && npm run type-check"
```

#### 6. **WhatsApp Session Lost**

**Symptoms:** QR code appears again, or "Connection closed (401)"

**Solution:**
```bash
# Clear session and re-authenticate
ssh root@167.71.145.9 "cd wAssitenceBot && rm -rf sessions/* && pm2 restart ultrathink"

# Then scan new QR code from logs
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink"
```

#### 7. **High Memory Usage**

```bash
# Check memory usage
ssh root@167.71.145.9 "pm2 monit"

# Restart with memory limit
ssh root@167.71.145.9 "pm2 stop ultrathink && pm2 start dist/index.js --name ultrathink --max-memory-restart 500M && pm2 save"
```

### Diagnostic Commands

```bash
# Full system diagnostic
ssh root@167.71.145.9 "cd wAssitenceBot && echo '=== PM2 Status ===' && pm2 status && echo -e '\n=== Last 30 Logs ===' && pm2 logs ultrathink --lines 30 --nostream && echo -e '\n=== Disk Space ===' && df -h && echo -e '\n=== Memory ===' && free -h && echo -e '\n=== Git Status ===' && git status"

# Health check
ssh root@167.71.145.9 "curl http://localhost:8080/health"
```

---

## 🔐 Environment Variables

### Required Variables

Create `.env` file in project root:

```bash
# Server
NODE_ENV=production
PORT=7100

# PostgreSQL Database
POSTGRES_HOST=your-db-host.com
POSTGRES_PORT=5432
POSTGRES_DB=whatsapp_assistant
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_secure_password
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}

# Redis
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}

# OpenAI API
OPENAI_API_KEY=sk-proj-your-openai-key-here

# Security
SESSION_TIMEOUT_MINUTES=15
MAX_LOGIN_ATTEMPTS=3
LOCKOUT_DURATION_MINUTES=15

# Logging
LOG_LEVEL=info
```

### Security Best Practices

1. **Never commit `.env` to git** - Already in `.gitignore`
2. **Use strong passwords** - Min 16 chars, alphanumeric + symbols
3. **Rotate keys regularly** - Every 90 days
4. **Use secrets managers** - AWS Secrets Manager, HashiCorp Vault
5. **Restrict database access** - Whitelist IPs only

---

## 📦 Installation Steps

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd wAssitenceBot
```

### 2. Install Dependencies

```bash
npm ci --production
```

### 3. Database Setup

#### Option A: Cloud Provider (Recommended)

**Railway.app** (Easiest):
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create PostgreSQL service
railway add

# Get connection URL
railway variables

# Copy DATABASE_URL to .env
```

**Neon.tech** (Serverless):
1. Visit https://neon.tech
2. Create project
3. Copy connection string to `DATABASE_URL`

#### Option B: Self-Hosted

```bash
# Install PostgreSQL 14+
sudo apt update
sudo apt install postgresql-14

# Create database and user
sudo -u postgres psql

CREATE DATABASE whatsapp_assistant;
CREATE USER bot_user WITH PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE whatsapp_assistant TO bot_user;
\q
```

### 4. Run Database Migrations

```bash
npm run migrate:up
```

**Verify migrations**:
```bash
psql $DATABASE_URL -c "\dt"
# Should show: users, contacts, events, reminders, pgmigrations
```

### 5. Redis Setup

#### Option A: Cloud Redis (Recommended)

**Upstash** (Free tier):
1. Visit https://upstash.com
2. Create Redis database
3. Copy connection URL to `REDIS_URL`

**Redis Labs**:
1. Visit https://redis.com/try-free
2. Create database
3. Copy endpoint to `.env`

#### Option B: Self-Hosted

```bash
# Install Redis
sudo apt install redis-server

# Start Redis
sudo systemctl start redis
sudo systemctl enable redis

# Test connection
redis-cli ping
# Should return: PONG
```

### 6. Build TypeScript

```bash
npm run build
```

**Verify build**:
```bash
ls dist/
# Should show: index.js, config/, services/, utils/, etc.
```

---

## 🏃 Running the Bot

### Production Mode

```bash
npm start
```

### Using PM2 (Process Manager)

```bash
# Install PM2
npm i -g pm2

# Start bot
pm2 start dist/index.js --name whatsapp-bot

# Auto-restart on system reboot
pm2 startup
pm2 save

# Monitor logs
pm2 logs whatsapp-bot

# Restart
pm2 restart whatsapp-bot

# Stop
pm2 stop whatsapp-bot
```

### Using Docker (Recommended)

**Dockerfile**:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 7100

CMD ["npm", "start"]
```

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./baileys_auth:/app/baileys_auth
    ports:
      - "7100:7100"
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:14-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: whatsapp_assistant
      POSTGRES_USER: bot_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"

volumes:
  pgdata:
  redisdata:
```

**Start with Docker**:
```bash
docker-compose up -d

# View logs
docker-compose logs -f bot

# Restart
docker-compose restart bot
```

---

## 📱 WhatsApp Setup

### 1. First Run - QR Code Scan

```bash
npm start
```

**You will see**:
```
[INFO] Starting WhatsApp Assistant Bot...
[INFO] Scan this QR code with WhatsApp:

██████████████  ██████  ██████████████
██          ██  ██  ██  ██          ██
██  ██████  ██  ██████  ██  ██████  ██
...

[INFO] Waiting for QR scan...
```

### 2. Scan QR Code

1. Open WhatsApp on your phone
2. Go to: **Settings → Linked Devices → Link a Device**
3. Scan the QR code from terminal
4. Wait for confirmation

**Success message**:
```
[INFO] WhatsApp connected successfully!
[INFO] Phone: +972501234567
[INFO] Bot is ready to receive messages
```

### 3. Session Persistence

The bot saves auth session in `baileys_auth/` directory:
- `creds.json` - Authentication credentials
- `app-state-sync-*.json` - Session state

**Important**:
- ✅ Backup this directory regularly
- ✅ Keep it secure (contains auth tokens)
- ✅ If deleted, you'll need to re-scan QR
- ✅ Include in `.gitignore` (already configured)

### 4. Multi-Device Support

WhatsApp allows up to **4 linked devices**:
- Use separate directories for multiple bots
- Or use WhatsApp Business API for production scale

---

## 🔍 Monitoring & Logging

### Winston Logs

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only
- Console (stdout) - Real-time

**Log rotation** (recommended):
```bash
npm i winston-daily-rotate-file
```

Update `src/utils/logger.ts`:
```typescript
import DailyRotateFile from 'winston-daily-rotate-file';

const transport = new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d'
});
```

### Health Check Endpoint

```bash
curl http://localhost:7100/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T12:34:56.789Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected",
  "whatsapp": "ready"
}
```

### Monitoring Tools

**Recommended**:
- **PM2 Plus**: Process monitoring
- **Sentry**: Error tracking
- **Prometheus + Grafana**: Metrics
- **UptimeRobot**: Uptime monitoring

---

## 🗄️ Database Backups

### PostgreSQL Backup

**Manual backup**:
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

**Automated daily backups**:
```bash
# Create backup script
cat > /usr/local/bin/backup-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/backup_$DATE.sql.gz
find $BACKUP_DIR -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-db.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-db.sh
```

### Redis Backup

**Manual**:
```bash
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb /backups/redis/dump_$(date +%Y%m%d).rdb
```

**Automated** (via Redis config):
```
# /etc/redis/redis.conf
save 900 1
save 300 10
save 60 10000
```

---

## 🔧 Troubleshooting

### Bot Won't Start

**Check logs**:
```bash
tail -f logs/error.log
```

**Common issues**:
1. **Database connection failed**
   ```
   [ERROR] Failed to connect to PostgreSQL
   ```
   → Check `DATABASE_URL` in `.env`
   → Verify database is running: `psql $DATABASE_URL -c "SELECT 1"`

2. **Redis connection failed**
   ```
   [ERROR] Redis connection refused
   ```
   → Check `REDIS_URL` in `.env`
   → Verify Redis is running: `redis-cli ping`

3. **OpenAI API error**
   ```
   [ERROR] OpenAI API key invalid
   ```
   → Check `OPENAI_API_KEY` in `.env`
   → Verify key at https://platform.openai.com/api-keys

### WhatsApp Session Issues

**QR code not showing**:
```bash
# Delete old session
rm -rf baileys_auth/*

# Restart bot
pm2 restart whatsapp-bot
```

**Connection closed (401)**:
- WhatsApp revoked session
- Re-scan QR code
- Check phone has internet connection

**Messages not sending**:
- Check WhatsApp is not banned
- Verify rate limits (20 msg/min to same user)
- Check logs for errors

### Performance Issues

**High memory usage**:
```bash
# Check memory
pm2 monit

# Set memory limit
pm2 start dist/index.js --max-memory-restart 500M
```

**Slow responses**:
- Check database query performance
- Enable Redis caching
- Optimize OpenAI API calls
- Scale horizontally with multiple instances

---

## 📊 Scaling

### Horizontal Scaling

**Load balancer** (nginx):
```nginx
upstream whatsapp_bot {
  server 127.0.0.1:7100;
  server 127.0.0.1:7101;
  server 127.0.0.1:7102;
}

server {
  listen 80;
  location / {
    proxy_pass http://whatsapp_bot;
  }
}
```

**Run multiple instances**:
```bash
PORT=7100 pm2 start dist/index.js --name bot-1
PORT=7101 pm2 start dist/index.js --name bot-2
PORT=7102 pm2 start dist/index.js --name bot-3
```

### Database Scaling

- **Read replicas**: For heavy read operations
- **Connection pooling**: Use `pg-pool` with max 20 connections
- **Indexing**: Already indexed on `userId`, `phone`

### Redis Scaling

- **Redis Cluster**: For >10k users
- **Separate queues**: BullMQ on dedicated Redis instance

---

## 🛡️ Security Checklist

- [ ] Environment variables not in git
- [ ] Database password is strong (16+ chars)
- [ ] Redis requires password
- [ ] PostgreSQL SSL enabled
- [ ] Firewall rules restrict database access
- [ ] Rate limiting enabled (20 msg/min)
- [ ] Failed login lockout (3 attempts)
- [ ] Logs don't contain sensitive data
- [ ] Regular backups scheduled
- [ ] OpenAI API key rotated every 90 days

---

## 📈 Cost Estimation

**Monthly costs for 1000 active users**:

| Service | Provider | Cost |
|---------|----------|------|
| PostgreSQL | Neon.tech (5GB) | $19/mo |
| Redis | Upstash (1GB) | Free |
| OpenAI API | GPT-4o-mini | ~$5/mo |
| Server | Railway.app | $5-20/mo |
| **Total** | | **$29-44/mo** |

**Free tier options**:
- Railway: $5/mo credit
- Neon: Free tier (0.5GB)
- Upstash: Free tier (10k requests/day)
- Total: **$0-10/mo** for <500 users

---

## 🚦 Production Launch Checklist

### Pre-Launch
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] QA test suite completed (150+ tests)
- [ ] WhatsApp QR scanned and connected
- [ ] Health check endpoint responding
- [ ] Logs writing correctly
- [ ] Backups scheduled

### Launch
- [ ] Start bot with PM2
- [ ] Monitor logs for errors
- [ ] Test with 2-3 real users
- [ ] Verify events/reminders working
- [ ] Check NLP parsing accuracy

### Post-Launch
- [ ] Set up monitoring (Sentry, PM2 Plus)
- [ ] Configure alerts (Slack, email)
- [ ] Document any issues
- [ ] Schedule weekly backup checks
- [ ] Plan for scaling (if needed)

---

## 📞 Support & Maintenance

### Regular Tasks

**Daily**:
- Check logs for errors
- Monitor uptime (should be >99%)

**Weekly**:
- Verify backups completed
- Check OpenAI API usage
- Review user feedback

**Monthly**:
- Update dependencies (`npm update`)
- Rotate API keys
- Performance audit

### Getting Help

- **Issues**: Check `logs/error.log` first
- **Documentation**: See `QA_TEST_SUITE.md`, `NLP_INTEGRATION.md`
- **Community**: WhatsApp Baileys GitHub discussions

---

## ✅ Quick Start Summary

```bash
# 1. Clone and install
git clone <repo>
cd wAssitenceBot
npm ci

# 2. Configure environment
cp .env.example .env
nano .env  # Add your keys

# 3. Setup database
npm run migrate:up

# 4. Build
npm run build

# 5. Start with PM2
pm2 start dist/index.js --name whatsapp-bot

# 6. Scan QR code (shows in logs)
pm2 logs whatsapp-bot

# 7. Test
curl http://localhost:7100/health

# Done! Bot is ready 🎉
```

---

## 📚 Additional Resources

- [WhatsApp Baileys Documentation](https://github.com/WhiskeySockets/Baileys)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [PM2 Documentation](https://pm2.keymetrics.io/)

---

**Last Updated**: 2025-01-15
**Version**: 1.0.0
