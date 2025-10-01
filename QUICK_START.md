# 🚀 Quick Start - First Steps

You now have Railway PostgreSQL connected! Let's get the bot running.

---

## ✅ What's Done

- ✅ GitHub repository created
- ✅ Railway PostgreSQL setup
- ✅ Project structure created
- ✅ Basic configuration files ready
- ✅ Database schema designed

---

## 📦 Step 1: Install Dependencies

```bash
cd /Users/michaelmishayev/Desktop/Projects/wAssitenceBot
npm install
```

**This will install:**
- Baileys (WhatsApp client)
- PostgreSQL client
- Redis (ioredis)
- BullMQ (job queue)
- Express (health check API)
- TypeScript + all dev tools

---

## 🗄️ Step 2: Setup Local Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your Railway credentials:

```bash
# Copy from Railway dashboard (Postgres Variables tab)
DATABASE_URL=postgresql://postgres:cZNyfHAnQNtKARoAkmYJelYNFyDYTlLV@postgres.railway.internal:5432/railway

# For Redis (you need to add Redis service in Railway)
REDIS_URL=redis://default:password@redis.railway.internal:6379

# Other settings
NODE_ENV=development
SESSION_PATH=./sessions
LOG_LEVEL=info
PORT=3000
```

**Note:** Use the `DATABASE_URL` (internal) not `DATABASE_PUBLIC_URL` for production

---

## 🔧 Step 3: Add Redis to Railway

### Via Railway Dashboard:

1. Go to your Railway project
2. Click "New" → "Database" → "Redis"
3. Railway creates `REDIS_URL` automatically
4. Copy it to your local `.env`

### Via CLI:

```bash
railway add redis
railway variables
# Copy REDIS_URL to .env
```

---

## 🏗️ Step 4: Run Database Migration

```bash
npm run build
node scripts/run-migration.js
```

**This creates:**
- `users` table
- `contacts` table
- `events` table
- `reminders` table
- `sessions` table
- Indexes for performance
- Triggers for auto-timestamps

---

## ▶️ Step 5: Start the Bot

```bash
npm run dev
```

**You should see:**
```
✅ Connected to PostgreSQL database
✅ Connected to Redis
✅ Database connection test successful
✅ Redis connection test successful
✅ Health check API listening on port 3000
✅ WhatsApp Assistant Bot is running!
```

**Test health check:**
```bash
curl http://localhost:3000/health
```

---

## 🚢 Step 6: Deploy to Railway

```bash
git add .
git commit -m "Add initial project structure and configs"
git push
```

**Railway will:**
1. Detect Node.js project
2. Run `npm install`
3. Run `npm run build`
4. Run `npm start`
5. Your bot is live! 🎉

**Check deployment:**
```bash
railway logs
# or
railway open
```

---

## ✅ Verify Everything Works

### Local Testing:

```bash
# Health check
curl http://localhost:3000/health

# Should return:
{
  "status": "ok",
  "timestamp": "2025-10-01T...",
  "uptime": 123,
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### Railway Testing:

```bash
railway logs --follow
# Should see same startup messages
```

---

## 📊 Current Status

```
✅ GitHub: Connected
✅ Railway: Setup
✅ PostgreSQL: Connected
⏭️ Redis: Need to add service
⏭️ Baileys: Not yet configured
⏭️ Auth: Not yet implemented
⏭️ WhatsApp: Not yet connected
```

---

## 🎯 Next Steps (Week 1 - Foundation)

### Today:
- [x] Setup Railway PostgreSQL ✅
- [ ] Add Redis service to Railway
- [ ] Install dependencies (`npm install`)
- [ ] Run migration
- [ ] Test local connection

### This Week:
- [ ] Configure Baileys WhatsApp client
- [ ] Implement session manager
- [ ] QR code handling
- [ ] First WhatsApp message test

### Follow:
**docs/DEV_PLAN.md** - Week 1 checklist for detailed tasks

---

## 🐛 Troubleshooting

### "Cannot connect to database"

Check DATABASE_URL in .env:
```bash
echo $DATABASE_URL
# Should show Railway connection string
```

For local dev, use `DATABASE_PUBLIC_URL` from Railway dashboard.

### "Redis connection failed"

1. Make sure Redis service is added in Railway
2. Check REDIS_URL in .env
3. For local dev, install Redis locally:
```bash
# macOS
brew install redis
brew services start redis

# Or use Railway Redis with public URL
```

### "npm install fails"

```bash
# Clear cache
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### "TypeScript errors"

```bash
# Rebuild
npm run build

# Check types
npm run type-check
```

---

## 💡 Tips

### Use Railway for Everything (Easiest):
- Don't install Postgres/Redis locally
- Use Railway DATABASE_PUBLIC_URL and REDIS_URL for local dev
- Slightly slower but zero setup

### Or Use Local Databases (Faster):
- Install Postgres and Redis locally
- Faster for development
- Need to manage two environments

**Recommendation:** Start with Railway URLs, switch to local later if needed

---

## 📚 Documentation Reference

- **docs/START_HERE.md** - Overview and tech decisions
- **docs/prd.md** - What we're building
- **docs/DEV_PLAN.md** - Week-by-week tasks
- **docs/ARCHITECTURE_SPEC.md** - Technical details

---

## 🎉 You're Ready!

Once you:
1. `npm install` ✅
2. Add Redis to Railway ✅
3. Run migration ✅
4. `npm run dev` and see it connect ✅

**Then:** Start building features from `docs/DEV_PLAN.md` Week 1! 🚀

---

**Status:** Foundation setup in progress 🏗️
**Next:** Add Redis, install deps, run migration
