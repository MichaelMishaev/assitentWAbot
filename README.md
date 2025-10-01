# WhatsApp Personal Assistant Bot

A Hebrew-first WhatsApp bot for managing events, reminders, and messages.

---

## 🚀 Quick Start

**New here?** → Read **[docs/START_HERE.md](docs/START_HERE.md)**

That's it. Everything else is optional.

---

## 📚 Documentation

| File | Purpose | Read When |
|------|---------|-----------|
| **[START_HERE.md](docs/START_HERE.md)** ⭐ | Quick start + tech stack decisions | First |
| **[prd.md](docs/prd.md)** | Product requirements | Before coding |
| **[DEV_PLAN.md](docs/DEV_PLAN.md)** | Week-by-week development checklist | Throughout development |
| [ARCHITECTURE_ANALYSIS.md](docs/ARCHITECTURE_ANALYSIS.md) | Monorepo vs single server decision | If curious |
| [ARCHITECTURE_SPEC.md](docs/ARCHITECTURE_SPEC.md) | Technical deep dive | When implementing |
| [TECH_STACK_DECISION.md](docs/TECH_STACK_DECISION.md) | Database & language analysis | If questioning choices |

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

1. Read [docs/START_HERE.md](docs/START_HERE.md)
2. Setup Railway
3. Follow [docs/DEV_PLAN.md](docs/DEV_PLAN.md) Week 1

**Start building!** 🚀

---

*Status: Ready for Development ✅*
