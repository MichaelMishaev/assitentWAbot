# 🚀 WhatsApp Assistant Bot - START HERE

**Read this first. Everything else is optional.**

---

## What We're Building

A WhatsApp bot (Hebrew first) that manages:
- 📅 Events (calendar)
- ⏰ Reminders (one-time + recurring)
- 📝 Draft messages
- 👥 Contacts

**Interface:** Hard-coded Hebrew menu (no NLP in MVP)
**Timeline:** 14 weeks to launch
**Cost:** $12-15/month

---

## Tech Stack (Final Decisions)

```
Language:    Node.js 20 + TypeScript  (Baileys requires it)
Database:    Railway Postgres         ($12/month includes Redis + hosting)
Queue:       BullMQ                   (Redis-based job queue)
WhatsApp:    Baileys                  (unofficial, will migrate to Business API later)
Architecture: Single server           (modular folders, NOT monorepo)
```

**Why these choices?** Read TECH_STACK_DECISION.md (optional)

---

## Project Structure

```
whatsapp-bot/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/               # DB, Redis, Baileys setup
│   ├── providers/            # Message provider interface
│   ├── services/             # Business logic (Auth, Calendar, etc.)
│   ├── queues/               # BullMQ workers
│   ├── utils/                # Helpers (logger, dates, etc.)
│   └── types/                # TypeScript interfaces
├── migrations/               # Database migrations
├── tests/
├── docs/                     # ← You are here
├── package.json
├── tsconfig.json
└── .env
```

**Single Node.js process** runs everything:
- Baileys (WhatsApp client)
- BullMQ workers (reminders)
- Express (health check)

**Why not monorepo?** Read ARCHITECTURE_ANALYSIS.md (optional)

---

## Architecture Decisions Made

### ✅ Single Server (Not Monorepo)
- You have ~5,000 LOC (small project)
- 1-2 developers
- No need for package complexity
- Can refactor later if needed

### ✅ Railway (Not Supabase)
- 70% cheaper ($12 vs $45/month)
- Includes DB + Redis + hosting
- Simpler deployment (git push)

### ✅ Node.js (Not Python/Go)
- Baileys = TypeScript library
- Python/Go would need REST wrapper (2x complexity)
- BullMQ native to Node.js
- Perfect for real-time bots

**All decisions backed by analysis in supporting docs.**

---

## What Got Removed

- ❌ Shabbat rules (removed from all specs)
- ❌ Tasks feature (stub only: "בקרוב")
- ❌ NLP (Phase 2)
- ❌ Google Calendar (Phase 2)
- ❌ Monorepo complexity
- ❌ Microservices

**Focus:** Ship working MVP in 14 weeks

---

## Next Steps

### Step 1: Setup Railway (10 min)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login & create project
railway login
railway init

# Add services
railway add postgresql
railway add redis

# Get credentials (auto-added to env)
railway variables
```

### Step 2: Initialize Project (20 min)

```bash
# Create project
mkdir whatsapp-bot
cd whatsapp-bot

# Initialize
npm init -y

# Install core dependencies
npm install typescript ts-node @types/node
npm install baileys @whiskeysockets/baileys
npm install pg ioredis bullmq
npm install express dotenv winston bcrypt luxon zod

# Dev dependencies
npm install -D nodemon @types/express @types/bcrypt

# Setup TypeScript
npx tsc --init

# Create folders
mkdir -p src/{config,providers,services,queues,utils,types,api}
mkdir migrations tests
```

### Step 3: Follow the Dev Plan

Open **DEV_PLAN.md** and start **Week 1: Foundation**

---

## Development Flow

### Week 1-2: Foundation
- Setup DB schema
- Configure Baileys
- Setup BullMQ
- Test WhatsApp connection

### Week 3-4: Auth & State
- Registration (name + PIN)
- Login flow
- Redis state machine
- Rate limiting

### Week 5: Menu System
- Hebrew menu structure
- Command routing
- Help system

### Week 6-7: Events
- Create/list/delete events
- Date parsing (Hebrew keywords)
- LocalCalendarProvider

### Week 8-9: Reminders
- Create reminders
- BullMQ scheduling
- Worker processing
- WhatsApp notifications

### Week 10: Contacts & Settings
- Contacts CRUD
- Language (HE/EN)
- Timezone settings

### Week 11: Draft Messages
- Compose messages
- Schedule sending
- Confirmation flow

### Week 12-13: Polish & Testing
- Error handling
- Unit tests
- Integration tests
- Load testing

### Week 14: Deploy & Launch 🚀

**Each week has detailed checklist in DEV_PLAN.md**

---

## Key Files to Read

### Must Read:
1. **START_HERE.md** ← You are here ✅
2. **prd.md** - Product requirements (10 min)
3. **DEV_PLAN.md** - Your daily guide (reference throughout)

### Optional (When Needed):
- **ARCHITECTURE_ANALYSIS.md** - Why single server not monorepo
- **ARCHITECTURE_SPEC.md** - Technical deep dive (auth, rate limiting, etc.)
- **TECH_STACK_DECISION.md** - Why Railway not Supabase, why Node not Python

**Don't read everything now.** Start coding, refer back as needed.

---

## Important Reminders

### Do's:
- ✅ Follow DEV_PLAN.md week by week
- ✅ Test each feature before moving on
- ✅ Use TypeScript (type safety)
- ✅ Commit often
- ✅ Keep it simple

### Don'ts:
- ❌ Skip authentication (security critical)
- ❌ Skip rate limiting (WhatsApp bans)
- ❌ Skip state management (users get stuck)
- ❌ Add features not in MVP (scope creep)
- ❌ Over-engineer (YAGNI principle)

---

## Cost Breakdown

### Railway (All-in-One):
```
Base plan:      $10/month (includes $10 usage credit)
Postgres:       ~$2/month
Redis:          ~$2/month
Node.js app:    ~$0-1/month
─────────────────────────
Total:          $12-15/month (MVP, 100 users)

Scaling:
100 users:      $15-20/month
500 users:      $30-40/month
1K users:       $50-70/month
```

**Very affordable!**

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Event creation | <30 seconds |
| Reminder accuracy | ±2 minutes |
| Response time | <3 seconds |
| Error rate | <1% |
| 30-day retention | >35% |

---

## Common Questions

**Q: Why not use Python?**
A: Baileys requires Node.js. Python would need REST wrapper = 2x complexity.

**Q: Why not use Supabase?**
A: 3x more expensive ($45 vs $12), features we don't need (auth, storage, realtime).

**Q: Why not use monorepo?**
A: Overkill for 5K LOC, slows development, adds complexity we don't need.

**Q: Can we scale later?**
A: Yes! Single server handles 1K users easily. Can extract to microservices later if needed.

**Q: Why remove Shabbat rules?**
A: User requested removal. Can add back in Phase 2 if needed.

**Full answers in supporting docs.**

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Baileys ban** | Provider abstraction + migration plan to WhatsApp Business API |
| **Rate limiting** | Multi-layer protection (per-user, global, adaptive) |
| **State loss** | Redis persistence + timeout handling |
| **Scaling** | Clear path: single server → pool → microservices |

**Details in ARCHITECTURE_SPEC.md sections 1, 3, 4, 5**

---

## Quick Commands

```bash
# Start development
npm run dev

# Build
npm run build

# Test
npm test

# Deploy to Railway
git push
# Railway auto-deploys on push

# View logs
railway logs

# Check costs
railway dashboard
```

---

## What's Next?

### Right Now:
1. ✅ Read this file (done!)
2. ⏭️ Skim prd.md (understand the product)
3. ⏭️ Setup Railway (10 min)
4. ⏭️ Initialize project (20 min)
5. ⏭️ Open DEV_PLAN.md Week 1
6. ⏭️ Start coding! 🚀

### This Week:
- Setup database schema
- Configure Baileys
- Send first WhatsApp message
- Setup BullMQ

### This Month:
- Complete auth system
- Build menu structure
- Implement events CRUD

### In 14 Weeks:
- 🎉 Launch MVP!

---

## Resources

### Documentation:
- [Baileys Docs](https://baileys.wiki/)
- [BullMQ Docs](https://docs.bullmq.io/)
- [Railway Docs](https://docs.railway.com/)

### Example Code:
- [Baileys Examples](https://github.com/WhiskeySockets/Baileys/tree/master/Example)
- [BullMQ Patterns](https://github.com/taskforcesh/bullmq/tree/master/docs/gitbook/patterns)

---

## Support

**Questions about:**
- Product features → prd.md
- Tech choices → TECH_STACK_DECISION.md
- Architecture → ARCHITECTURE_SPEC.md or ARCHITECTURE_ANALYSIS.md
- Implementation → DEV_PLAN.md

**All answers are in the docs. Search before asking.**

---

## Final Checklist

- [x] Understand what we're building (prd.md)
- [x] Know the tech stack (Node.js + Railway + Baileys)
- [x] Know the architecture (single server, modular)
- [x] Know the cost ($12-15/month)
- [x] Know the timeline (14 weeks)
- [ ] Setup Railway
- [ ] Initialize project
- [ ] Start Week 1 of DEV_PLAN.md

---

## 🎯 TL;DR

```
What:  WhatsApp bot (Hebrew calendar/reminders)
Tech:  Node.js + TypeScript, Railway Postgres, Baileys
Cost:  $12-15/month
Time:  14 weeks to MVP
Next:  Read prd.md, then follow DEV_PLAN.md Week 1
```

**Stop reading. Start building.** 🚀

---

*Last updated: 2025-10-01*
*Status: Ready for Development ✅*
