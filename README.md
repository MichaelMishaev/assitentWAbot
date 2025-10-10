# WhatsApp Personal Assistant Bot

A Hebrew-first WhatsApp bot for managing events, reminders, and messages.

---

## 🚀 Quick Start

**New here?** → Read **[docs/START_HERE.md](docs/START_HERE.md)**

That's it. Everything else is optional.

---

## 📚 Documentation

**Start Here:**

| File | Purpose | Read When |
|------|---------|-----------|
| **[START_HERE.md](docs/START_HERE.md)** ⭐ | Quick start guide + setup | **First!** |
| **[PROJECT_STATUS.md](docs/PROJECT_STATUS.md)** | Current progress & roadmap | After setup |
| **[commands.md](docs/commands.md)** | Development commands reference | Daily use |

**Deep Dives:**

| File | Purpose | Read When |
|------|---------|-----------|
| [prd.md](docs/prd.md) | Product requirements & vision | Understanding goals |
| [ARCHITECTURE_SPEC.md](docs/ARCHITECTURE_SPEC.md) | Technical architecture deep dive | Implementation details |
| [DEV_PLAN.md](docs/DEV_PLAN.md) | Week-by-week development plan | Project planning |
| [ARCHITECTURE_ANALYSIS.md](docs/ARCHITECTURE_ANALYSIS.md) | Architecture decisions explained | If curious about choices |
| [TESTING.md](docs/TESTING.md) | Test coverage & quality metrics | Writing tests |

**Recent Work:**

| File | Purpose |
|------|---------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guide |
| [BUG_FIX_SUMMARY.md](BUG_FIX_SUMMARY.md) | Date parsing fixes (Oct 2025) |
| [TEST_REPORT_COMPREHENSIVE.md](TEST_REPORT_COMPREHENSIVE.md) | Hebrew NLP test results |

---

## 🐛 Developer Comment System

This bot has a built-in **async bug reporting** system for developers:

**In WhatsApp Chat:**
```
# Bug: Reminder feature doesn't show date correctly
# Feature request: Link reminder to event
# Issue: Date format recognizes time wrong
```

**How it works:**
- Any message starting with `#` is logged to `logs/dev-comments.log`
- Bot **silently acknowledges** (no response to avoid clutter)
- Comments are searchable with special formatting
- 30-day retention for historical tracking

**View comments:**
```bash
# Interactive viewer (local or production)
./scripts/view-dev-comments.sh

# Or SSH directly
ssh root@167.71.145.9
cat /root/wAssitenceBot/logs/dev-comments.log
```

**Use case:** Document bugs as they happen in real-time, then batch-fix them later by asking Claude to analyze all `#` comments.

---

## 📊 Tech Stack

```
Language:     Node.js 20 + TypeScript
Database:     Railway Postgres
Queue:        BullMQ + Redis
WhatsApp:     Baileys
Architecture: Single server (modular folders)
Cost:         $12-15/month (MVP)
```

---

## 🏗️ Project Structure

```
whatsapp-bot/
├── src/
│   ├── index.ts          # Main entry
│   ├── config/           # DB, Redis, Baileys
│   ├── services/         # Business logic
│   ├── queues/           # BullMQ workers
│   └── utils/            # Helpers
├── docs/                 # Documentation
├── tests/
└── migrations/
```

---

## ⚡ Setup

```bash
# Install Railway CLI
npm install -g @railway/cli

# Clone & setup
git clone <repo>
cd whatsapp-bot
npm install

# Configure Railway
railway login
railway init
railway add postgresql
railway add redis

# Start development
npm run dev
```

---

## 📋 Timeline

- **Week 1-2:** Foundation (DB, Baileys, BullMQ)
- **Week 3-4:** Auth & State Management
- **Week 5:** Menu System
- **Week 6-7:** Events CRUD
- **Week 8-9:** Reminders
- **Week 10:** Contacts & Settings
- **Week 11:** Draft Messages
- **Week 12-13:** Testing & Polish
- **Week 14:** Deploy & Launch 🚀

**Full checklist:** [docs/DEV_PLAN.md](docs/DEV_PLAN.md)

---

## 🎯 MVP Features

- ✅ Events (create, list, delete)
- ✅ Reminders (one-time + weekly)
- ✅ Contacts management
- ✅ Draft messages
- ✅ Settings (language, timezone)
- ✅ Hebrew hard-coded menu

**Not in MVP:** NLP, Google Calendar, Tasks, Shabbat rules

---

## 💰 Cost

| Users | Monthly Cost |
|-------|-------------|
| 100 | $15-20 |
| 500 | $30-40 |
| 1,000 | $50-70 |

**Includes:** Database, Redis, hosting, everything

---

## 🔒 Security

- PIN-based authentication (bcrypt hashed)
- Rate limiting (multi-layer)
- Session management (Redis)
- PII masking in logs
- Explicit message confirmation

---

## 📖 Learn More

- [Baileys Docs](https://baileys.wiki/)
- [BullMQ Docs](https://docs.bullmq.io/)
- [Railway Docs](https://docs.railway.com/)

---

## 🎯 Next Steps

1. Read **[docs/START_HERE.md](docs/START_HERE.md)** ⭐
2. Check **[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)** for current progress
3. Setup local development (see START_HERE.md)
4. Review **[docs/commands.md](docs/commands.md)** for daily tasks
5. Deploy when ready (see [DEPLOYMENT.md](DEPLOYMENT.md))

**Start building!** 🚀

---

*Last Updated: October 2, 2025*
*Status: **MVP Complete + Production Ready** ✅*
*Version: 0.1.0*
