# Railway Deployment Guide - WhatsApp Assistant Bot

## Quick Deploy (Automated)

```bash
./scripts/deploy-railway.sh
```

This script will:
1. Install Railway CLI
2. Login to Railway
3. Create/link project
4. Add PostgreSQL + Redis
5. Set environment variables
6. Deploy your bot
7. Run database migrations

---

## Manual Deployment (Step by Step)

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Login to Railway
```bash
railway login
```
This opens your browser to authenticate.

### 3. Initialize Project
```bash
railway init
```
Choose "Create new project" or select existing one.

### 4. Add Databases

**Add PostgreSQL:**
```bash
railway add --database postgresql
```

**Add Redis:**
```bash
railway add --database redis
```

### 5. Set Environment Variables
```bash
railway variables set NODE_ENV=production
railway variables set SESSION_PATH=/app/sessions
railway variables set MESSAGE_PROVIDER=baileys
railway variables set LOG_LEVEL=info
railway variables set PORT=7100
railway variables set OPENAI_API_KEY=sk-your-actual-key-here
```

### 6. Deploy
```bash
railway up
```

### 7. Run Migrations
```bash
railway run npm run migrate:up
```

### 8. Get QR Code
```bash
railway logs --follow
```

Look for QR code in logs, scan with WhatsApp.

---

## Environment Variables

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
