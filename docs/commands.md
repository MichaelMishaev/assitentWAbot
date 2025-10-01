# =à Development Commands Reference

Complete guide for running, managing, and deploying the WhatsApp Assistant Bot.

---

## =æ Installation

### First Time Setup

```bash
# Clone repository
git clone https://github.com/MichaelMishaev/assitentWAbot.git
cd assitentWAbot

# Install dependencies
npm install

# Copy environment template (if exists)
cp .env.example .env
```

---

## =€ Running the Application

### Development Mode (Local)

```bash
# Start with hot-reload (recommended for development)
npm run dev
```

**What it does:**
- Runs `nodemon --exec ts-node src/index.ts`
- Auto-restarts on file changes
- Uses TypeScript directly (no build step)
- Reads `.env` file for local config

**Prerequisites:**
- PostgreSQL running locally OR `DATABASE_URL` in `.env`
- Redis running locally OR `REDIS_URL` in `.env`

### Production Mode (Local)

```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

**What it does:**
- Compiles `src/` ’ `dist/` folder
- Runs compiled JavaScript: `node dist/index.js`
- No auto-reload (restart manually after changes)

### Type Checking (Without Running)

```bash
# Check TypeScript types without compiling
npm run type-check
```

---

## =Ä Database Management

### Running Migrations

```bash
# Apply all pending migrations (Up)
npm run migrate:up

# Rollback last migration (Down)
npm run migrate:down

# Create new migration file
npm run migrate:create add_users_table
# Creates: migrations/[timestamp]_add_users_table.js
```

### Database Connection Test

The app automatically tests the database connection on startup. Check logs:

```bash
npm run dev
# Output should show:
#  Testing database connection...
#  Database connected successfully
```

### Manual Database Connection (PostgreSQL CLI)

```bash
# Connect to local database
psql -U postgres -d whatsapp_bot

# Connect to Railway production database
railway connect postgres
```

---

## =4 Redis Management

### Running Redis Locally

```bash
# macOS (via Homebrew)
brew services start redis

# Linux (systemd)
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:7-alpine

# Check if Redis is running
redis-cli ping
# Should return: PONG
```

### Redis Connection Test

The app automatically tests Redis connection on startup. Check logs:

```bash
npm run dev
# Output should show:
#  Testing Redis connection...
#  Redis connected successfully
```

### Manual Redis Connection (CLI)

```bash
# Connect to local Redis
redis-cli

# Connect to Railway Redis
railway run redis-cli -u $REDIS_URL

# Check Redis keys
redis-cli KEYS "*"

# Clear all Redis data (  use carefully!)
redis-cli FLUSHALL
```

---

## >ê Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

---

## <× Building & Deployment

### Build for Production

```bash
# Compile TypeScript
npm run build

# Output: dist/ folder with compiled JavaScript
```

### Deploy to Railway

#### Automatic Deployment (via GitHub)

```bash
# Commit changes
git add .
git commit -m "Add feature X"

# Push to GitHub (triggers Railway auto-deploy)
git push origin main
```

Railway automatically:
1. Detects push to `main` branch
2. Runs `npm install`
3. Runs `npm run build`
4. Starts with `npm start`
5. Health check on `/health` endpoint

#### Manual Deployment (via Railway CLI)

```bash
# Deploy current local code
railway up

# View deployment logs
railway logs --follow

# Open Railway dashboard
railway open
```

---

## = Debugging & Monitoring

### View Logs

```bash
# Local development logs
npm run dev
# Logs appear in terminal (Winston logger)

# Railway production logs
railway logs

# Railway logs (live/follow mode)
railway logs --follow

# Railway logs (last 100 lines)
railway logs --tail 100
```

### Health Check Endpoint

```bash
# Check if app is running locally
curl http://localhost:3000/health

# Check if app is running on Railway
curl https://your-app.railway.app/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-10-01T12:00:00.000Z",
  "uptime": 3600,
  "connections": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### Check Service Status

```bash
# Railway service status
railway status

# Check database connection
railway run psql $DATABASE_URL -c "SELECT 1;"

# Check Redis connection
railway run redis-cli -u $REDIS_URL PING
```

---

## =Ñ Preventing Duplicate Server Instances

### Problem: Multiple Processes Running

If you see errors like:
```
Error: listen EADDRINUSE: address already in use :::3000
```

This means another process is already using port 3000.

### Solution 1: Find and Kill Process (macOS/Linux)

```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)

# Or combined:
lsof -ti:3000 | xargs kill -9

# Then restart your app
npm run dev
```

### Solution 2: Use Different Port

```bash
# Set custom port in .env file
PORT=3001

# Or inline:
PORT=3001 npm run dev
```

### Solution 3: Stop All Node Processes

```bash
# Kill ALL node processes (  stops everything!)
pkill -9 node

# Then restart
npm run dev
```

### Solution 4: Check for Background Processes

```bash
# List all node processes
ps aux | grep node

# Kill specific process by PID
kill -9 <PID>
```

### Solution 5: Use PM2 (Production)

```bash
# Install PM2
npm install -g pm2

# Start app with PM2
pm2 start dist/index.js --name whatsapp-bot

# Stop app
pm2 stop whatsapp-bot

# Restart app
pm2 restart whatsapp-bot

# View logs
pm2 logs whatsapp-bot

# List all PM2 processes
pm2 list

# Delete process from PM2
pm2 delete whatsapp-bot
```

### Preventing Duplicates in Development

**Option A: Always stop before starting**
```bash
# Create npm script in package.json:
"scripts": {
  "dev:safe": "lsof -ti:3000 | xargs kill -9; npm run dev"
}

# Use it:
npm run dev:safe
```

**Option B: Use nodemon properly**
```bash
# nodemon already handles restarts
# Just Ctrl+C once to stop, then run again
npm run dev
```

---

## < Environment Variables

### Local Development (.env file)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/whatsapp_bot

# Redis
REDIS_URL=redis://localhost:6379

# App
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Session
SESSION_PATH=./sessions

# WhatsApp
MESSAGE_PROVIDER=baileys
```

### Railway Production (Auto-set)

Railway automatically sets:
- `DATABASE_URL` (from PostgreSQL service)
- `REDIS_URL` (from Redis service)
- `PORT` (Railway assigns dynamically)

You only need to set:
```bash
railway variables set NODE_ENV=production
railway variables set LOG_LEVEL=info
railway variables set SESSION_PATH=/app/sessions
railway variables set MESSAGE_PROVIDER=baileys
```

### View Environment Variables

```bash
# Railway variables
railway variables

# Load Railway env locally
railway run node -e "console.log(process.env)"

# Test with Railway env locally
railway run npm run dev
```

---

## =' Troubleshooting

### App Won't Start

```bash
# Check if dependencies are installed
ls node_modules/ | wc -l
# Should show 100+ packages

# Reinstall if needed
rm -rf node_modules package-lock.json
npm install

# Check TypeScript compilation
npm run type-check

# Check for syntax errors
npm run build
```

### Database Connection Failed

```bash
# Check if PostgreSQL is running
psql -U postgres -c "SELECT 1;"

# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:password@host:port/database

# Test connection manually
psql $DATABASE_URL -c "SELECT 1;"

# Railway: Check if PostgreSQL service exists
railway status
```

### Redis Connection Failed

```bash
# Check if Redis is running
redis-cli ping

# Check REDIS_URL format
echo $REDIS_URL
# Should be: redis://host:port or redis://user:password@host:port

# Test connection manually
redis-cli -u $REDIS_URL PING

# Railway: Check if Redis service exists
railway status
```

### Port Already in Use

See **"Preventing Duplicate Server Instances"** section above.

### Railway Deployment Failed

```bash
# View build logs
railway logs --deployment

# Check build command
cat railway.json

# Ensure package.json scripts are correct
cat package.json | grep "scripts" -A 5

# Test build locally
npm run build
npm start

# Redeploy manually
railway up
```

---

## =Ë Quick Reference

| Task | Command |
|------|---------|
| **Start dev server** | `npm run dev` |
| **Build for production** | `npm run build` |
| **Start production** | `npm start` |
| **Run migrations** | `npm run migrate:up` |
| **Create migration** | `npm run migrate:create <name>` |
| **Run tests** | `npm test` |
| **Type check** | `npm run type-check` |
| **Deploy to Railway** | `git push` (auto) or `railway up` (manual) |
| **View Railway logs** | `railway logs --follow` |
| **Kill port 3000** | `lsof -ti:3000 \| xargs kill -9` |
| **Connect to Railway DB** | `railway connect postgres` |
| **Connect to Railway Redis** | `railway run redis-cli -u $REDIS_URL` |
| **Open Railway dashboard** | `railway open` |

---

## =¦ Startup Checklist

Before running the app, ensure:

- [ ] Dependencies installed: `npm install`
- [ ] PostgreSQL running (local) or `DATABASE_URL` set
- [ ] Redis running (local) or `REDIS_URL` set
- [ ] `.env` file created with required variables
- [ ] Migrations applied: `npm run migrate:up`
- [ ] No duplicate processes on port 3000
- [ ] TypeScript compiles: `npm run type-check`

Then start:
```bash
npm run dev
```

---

## <¯ Development Workflow

```bash
# 1. Start services (local)
brew services start postgresql
brew services start redis

# 2. Start dev server
npm run dev

# 3. Make changes (auto-reloads)
# Edit files in src/

# 4. Run migrations (if DB changes)
npm run migrate:create add_new_column
npm run migrate:up

# 5. Test
npm test

# 6. Commit & deploy
git add .
git commit -m "Add feature X"
git push  # Auto-deploys to Railway

# 7. Check Railway deployment
railway logs --follow
```

---

## =¡ Pro Tips

1. **Use `railway run` to test with production env locally:**
   ```bash
   railway run npm run dev
   ```

2. **Create aliases for common commands (add to `.bashrc` or `.zshrc`):**
   ```bash
   alias wr="npm run dev"
   alias wb="npm run build"
   alias wt="npm test"
   alias wl="railway logs --follow"
   alias killport="lsof -ti:3000 | xargs kill -9"
   ```

3. **Use VS Code tasks (`.vscode/tasks.json`):**
   ```json
   {
     "version": "2.0.0",
     "tasks": [
       {
         "label": "Start Dev Server",
         "type": "npm",
         "script": "dev",
         "problemMatcher": []
       }
     ]
   }
   ```

4. **Monitor Railway deployments:**
   ```bash
   watch -n 5 railway status
   ```

---

**Status:** Complete Development Command Reference 
**Updated:** 2025-10-01
