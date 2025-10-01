# 🚀 Railway Setup Guide

Your code is now on GitHub! Let's connect it to Railway.

---

## Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

---

## Step 2: Login to Railway

```bash
railway login
```

This will open your browser. Sign in with GitHub.

---

## Step 3: Create New Project

```bash
cd /Users/michaelmishayev/Desktop/Projects/wAssitenceBot
railway init
```

**Choose:**
- "Create new project"
- Project name: `whatsapp-assistant-bot`

---

## Step 4: Link to GitHub Repository

### Option A: Via Railway Dashboard (Recommended)

1. Go to [railway.app](https://railway.app)
2. Select your project: `whatsapp-assistant-bot`
3. Click "New" → "GitHub Repo"
4. Select: `MichaelMishaev/assitentWAbot`
5. Railway will auto-deploy on every push

### Option B: Via CLI

```bash
railway link
# Select your project from the list
```

---

## Step 5: Add PostgreSQL

### Via Dashboard:
1. In your Railway project
2. Click "New" → "Database" → "PostgreSQL"
3. Railway auto-creates `DATABASE_URL` environment variable

### Via CLI:
```bash
railway add postgresql
```

---

## Step 6: Add Redis

### Via Dashboard:
1. Click "New" → "Database" → "Redis"
2. Railway auto-creates `REDIS_URL` environment variable

### Via CLI:
```bash
railway add redis
```

---

## Step 7: Configure Environment Variables

### Via Dashboard:
1. Go to your app service (not DB/Redis)
2. Click "Variables" tab
3. Add these variables:

```bash
NODE_ENV=production
SESSION_PATH=/app/sessions
LOG_LEVEL=info
MESSAGE_PROVIDER=baileys
```

**Note:** `DATABASE_URL` and `REDIS_URL` are automatically set by Railway

### Via CLI:
```bash
railway variables set NODE_ENV=production
railway variables set SESSION_PATH=/app/sessions
railway variables set LOG_LEVEL=info
railway variables set MESSAGE_PROVIDER=baileys
```

---

## Step 8: Deploy

### Automatic (from GitHub):
```bash
git add .
git commit -m "Add feature X"
git push
# Railway auto-deploys
```

### Manual (from CLI):
```bash
railway up
```

---

## Step 9: View Your App

```bash
# Open Railway dashboard
railway open

# View logs
railway logs

# Check service status
railway status
```

---

## Step 10: Get Database Credentials (for local development)

```bash
# View all environment variables
railway variables

# Connect to PostgreSQL locally
railway connect postgres

# Connect to Redis locally
railway connect redis
```

---

## Expected Costs

### Your Current Setup:
```
Base Plan:       $10/month (includes $10 usage credit)
PostgreSQL:      ~$2/month
Redis:           ~$2/month
App (Node.js):   ~$0-1/month
──────────────────────────────────────
Total:           $12-15/month
```

### Monitor Costs:
1. Go to Railway dashboard
2. Click your profile → "Billing"
3. See real-time usage

---

## Project Structure (What Railway Sees)

```
assitentWAbot/              ← Your GitHub repo
├── docs/                   ← Documentation (ignored by Railway)
├── src/                    ← Your app code (will be here)
├── package.json            ← Railway reads this
├── tsconfig.json           ← TypeScript config
└── README.md
```

**When you add code later:**
Railway will detect Node.js and automatically:
1. Run `npm install`
2. Run `npm run build` (if defined)
3. Run `npm start`

---

## Custom Build Configuration (Optional)

Create `railway.json` in project root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "nixpacks",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "on_failure",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Verify Setup Checklist

- [ ] Railway CLI installed
- [ ] Logged in to Railway
- [ ] Project created
- [ ] GitHub repo connected
- [ ] PostgreSQL added (DATABASE_URL exists)
- [ ] Redis added (REDIS_URL exists)
- [ ] Environment variables set
- [ ] Can see project in Railway dashboard

---

## Next Steps

Once Railway is setup:

1. **Start Week 1** of `docs/DEV_PLAN.md`
2. **Create project structure** (src/, migrations/, etc.)
3. **Install dependencies** (package.json)
4. **Build features** week by week
5. **Git push** after each feature (auto-deploys to Railway)

---

## Troubleshooting

### "Railway CLI not found"
```bash
npm install -g @railway/cli
# Restart terminal
```

### "Failed to authenticate"
```bash
railway logout
railway login
# Try again
```

### "Can't connect to GitHub repo"
- Make sure repo is public OR
- Grant Railway access to private repos in GitHub settings

### "DATABASE_URL not found"
- Make sure PostgreSQL service is added
- Check Variables tab in Railway dashboard
- Variables are automatically injected at runtime

### "Deployment failed"
- Check Railway logs: `railway logs`
- Make sure `package.json` has `start` script
- Make sure all dependencies are in `package.json`

---

## Useful Commands

```bash
# View logs (real-time)
railway logs --follow

# Open project in dashboard
railway open

# Run command in Railway environment
railway run node -v

# Check service status
railway status

# View environment variables
railway variables

# Set environment variable
railway variables set KEY=value

# Delete environment variable
railway variables delete KEY

# Link different project
railway link

# Deploy current code
railway up
```

---

## Cost Optimization Tips

1. **Use hobby plan** ($5/month credit for trial)
2. **Monitor usage** in dashboard weekly
3. **Set budget alerts** in Railway settings
4. **Shut down dev environments** when not testing
5. **Use Railway only for production** (local dev uses local DB/Redis)

---

## Security Notes

- ✅ Railway uses SSL by default
- ✅ Environment variables are encrypted
- ✅ Database connections are private (not exposed to internet)
- ✅ Each service has unique credentials
- ❌ Don't commit `.env` files (already in .gitignore)
- ❌ Don't expose database credentials publicly

---

## Railway Dashboard Overview

When you log in, you'll see:

```
Project: whatsapp-assistant-bot
├── Services:
│   ├── whatsapp-bot (your app)      ← Node.js code
│   ├── postgres                     ← Database
│   └── redis                        ← Cache/Queue
├── Deployments:
│   └── main (active)                ← Auto-deploys from GitHub
├── Variables:                       ← Environment vars
└── Settings:                        ← Project config
```

---

## After Railway Setup

Your workflow becomes:

```bash
# 1. Code locally
npm run dev

# 2. Test locally
npm test

# 3. Commit & push
git add .
git commit -m "Add feature X"
git push

# 4. Railway auto-deploys!
# Check deployment status:
railway logs
```

**That's it!** No manual deployment steps.

---

## Support

- **Railway Docs:** https://docs.railway.com/
- **Railway Discord:** https://discord.gg/railway
- **Status Page:** https://status.railway.app/

---

**Status:** Ready to setup Railway ✅
**Next:** Follow steps above, then start `docs/DEV_PLAN.md` Week 1 🚀
