# 🚀 START HERE - WhatsApp Assistant Bot

**Welcome!** This is your starting point for understanding and running the WhatsApp Personal Assistant Bot.

---

## 📱 What Is This?

A **Hebrew-first WhatsApp bot** that helps users manage:
- 📅 **Events** (create, list, search, delete)
- ⏰ **Reminders** (one-time and recurring)
- 👥 **Contacts** (family, friends, work)
- ⚙️ **Settings** (language, timezone)
- 📝 **Draft messages** (schedule messages)

**Key Features:**
- ✅ Natural language processing (Hebrew & English)
- ✅ Fuzzy matching (understands typos and variations)
- ✅ Menu-driven interface (easy navigation)
- ✅ Smart date parsing (מחר, שבוע הבא, etc.)
- ✅ Queue-based reminders (BullMQ + Redis)

---

## ✅ Current Status

**Development Stage:** MVP Complete + Bug Fixes
**Test Coverage:** 272/272 tests passing (100%)
**Production Ready:** Yes ✅

### What's Working

| Feature | Status | Notes |
|---------|--------|-------|
| WhatsApp Connection (Baileys) | ✅ Working | QR code authentication |
| User Authentication | ✅ Working | PIN-based, bcrypt hashed |
| Event CRUD | ✅ Working | Create, list, search, delete |
| Hebrew NLP | ✅ Working | OpenAI GPT-4 integration |
| Date Parsing | ✅ Fixed | All edge cases handled |
| Fuzzy Matching | ✅ Working | Hebrew variations supported |
| Menu System | ✅ Working | 8 main options |
| Reminder Queue | ✅ Working | BullMQ scheduling |
| Rate Limiting | ✅ Working | Multi-layer protection |
| Database (PostgreSQL) | ✅ Working | Migrations complete |
| Redis Cache | ✅ Working | Session & queue storage |

### Recent Fixes (Oct 2025)

- ✅ **Critical:** Fixed NaN timestamp bug (date parsing)
- ✅ **Critical:** Fixed "next week" queries crashing bot
- ✅ **Major:** Enhanced NLP with 31 Hebrew examples
- ✅ **Major:** Added comprehensive date validation
- ✅ **Minor:** Hebrew fuzzy matching improvements

**See:** [BUG_FIX_SUMMARY.md](../BUG_FIX_SUMMARY.md) for details

---

## ⚡ Quick Start (5 Minutes)

### Prerequisites

- **Node.js** >= 20.0.0
- **PostgreSQL** 14+
- **Redis** 6+
- **OpenAI API Key** (for NLP)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy example
cp .env.example .env

# Edit .env with your credentials:
DATABASE_URL=postgresql://user:pass@localhost:5432/whatsapp_bot
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-proj-your-key-here
PORT=7100
```

### 3. Setup Database

```bash
# Run migrations
npm run migrate:up

# Verify tables created
psql $DATABASE_URL -c "\dt"
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Scan QR Code

- QR code appears in terminal
- Open WhatsApp → Settings → Linked Devices
- Scan the QR code
- Done! Bot is ready

---

## 📚 Documentation Map

**Start with these:**

| Document | Purpose | Read When |
|----------|---------|-----------|
| **[START_HERE.md](START_HERE.md)** ⭐ | You are here! Quick start | First |
| **[PROJECT_STATUS.md](PROJECT_STATUS.md)** | Current progress & roadmap | After setup |
| **[commands.md](commands.md)** | Development commands reference | Daily use |
| **[DEPLOYMENT.md](../DEPLOYMENT.md)** | Production deployment guide | When deploying |

**Deep dives:**

| Document | Purpose | Read When |
|----------|---------|-----------|
| [prd.md](prd.md) | Product requirements & vision | Understanding goals |
| [ARCHITECTURE_SPEC.md](ARCHITECTURE_SPEC.md) | Technical architecture | Implementation details |
| [DEV_PLAN.md](DEV_PLAN.md) | Week-by-week development plan | Project planning |
| [TESTING.md](TESTING.md) | Test coverage & quality metrics | Writing tests |

**Recent work:**

| Document | Purpose |
|----------|---------|
| [BUG_FIX_SUMMARY.md](../BUG_FIX_SUMMARY.md) | Date parsing bug fixes |
| [TEST_REPORT_COMPREHENSIVE.md](../TEST_REPORT_COMPREHENSIVE.md) | Hebrew NLP test results |
| [ULTRATHINK_BUG_ANALYSIS.md](../ULTRATHINK_BUG_ANALYSIS.md) | Deep bug analysis |

---

## 🛠️ Tech Stack

```
Language:     TypeScript (Node.js 20)
Database:     PostgreSQL 14+
Cache/Queue:  Redis 6+ + BullMQ
WhatsApp:     Baileys (unofficial client)
NLP:          OpenAI GPT-4o-mini
Testing:      Jest (272 tests)
Deployment:   Railway.app / Docker
```

**Why these choices?**
- TypeScript: Type safety + great tooling
- PostgreSQL: Reliable, ACID compliant, great for events/reminders
- Redis: Fast session storage + queue backend
- Baileys: Free WhatsApp integration (no official API needed)
- OpenAI: Best Hebrew NLP available

---

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────┐
│         WhatsApp (Baileys)              │
│  User sends: "מה יש לי מחר?"           │
└──────────────┬──────────────────────────┘
               │
               v
┌──────────────────────────────────────────┐
│     MessageRouter.ts                     │
│  Routes message to correct handler       │
└──────────────┬───────────────────────────┘
               │
               v
┌──────────────────────────────────────────┐
│     NLPService.ts (OpenAI)              │
│  Parses intent: { action: "search",     │
│                   date: "tomorrow" }     │
└──────────────┬───────────────────────────┘
               │
               v
┌──────────────────────────────────────────┐
│     EventService.ts                      │
│  Queries PostgreSQL for tomorrow's       │
│  events using fuzzy matching            │
└──────────────┬───────────────────────────┘
               │
               v
┌──────────────────────────────────────────┐
│     Response sent to WhatsApp           │
│  "📅 מחר יש לך:                         │
│   1. 09:00 - פגישה עם דני"              │
└──────────────────────────────────────────┘
```

**Key Services:**

- **MessageRouter**: Routes incoming messages
- **NLPService**: Parses Hebrew natural language
- **EventService**: Manages events (CRUD)
- **ReminderService**: Manages reminders
- **StateManager**: Tracks conversation state (Redis)
- **AuthService**: PIN-based authentication
- **RateLimiter**: Prevents spam/abuse

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Test specific suite
npm test hebrewMatcher
```

**Test Stats:**
- Total Tests: **272**
- Pass Rate: **100%**
- Coverage: **100%** of core logic

**See:** [TESTING.md](TESTING.md) for details

---

## 📖 Common Tasks

### Run Development Server
```bash
npm run dev
```

### View Logs
```bash
# Local
tail -f logs/combined.log

# Production (Railway)
railway logs --follow
```

### Database Operations
```bash
# Create migration
npm run migrate:create add_new_column

# Apply migrations
npm run migrate:up

# Rollback
npm run migrate:down
```

### Testing
```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific test
npm test -- hebrewMatcher
```

### Build for Production
```bash
npm run build
npm start
```

**See:** [commands.md](commands.md) for complete reference

---

## 🐛 Troubleshooting

### Bot Won't Start

**Check:**
1. PostgreSQL running? `psql $DATABASE_URL -c "SELECT 1"`
2. Redis running? `redis-cli ping`
3. Environment variables set? `cat .env`
4. Dependencies installed? `npm install`

**Fix:**
```bash
# Restart services
brew services restart postgresql
brew services restart redis

# Reinstall dependencies
rm -rf node_modules
npm install

# Check logs
tail -f logs/error.log
```

### QR Code Issues

**Problem:** QR code not showing
```bash
# Delete old session
rm -rf baileys_auth/*

# Restart bot
npm run dev
```

**Problem:** Connection lost (401)
- WhatsApp revoked session
- Re-scan QR code
- Check phone has internet

### Database Errors

**Problem:** "relation does not exist"
```bash
# Run migrations
npm run migrate:up

# Verify
psql $DATABASE_URL -c "\dt"
```

**See:** [DEPLOYMENT.md](../DEPLOYMENT.md) Section "Troubleshooting" for more

---

## 🎯 What to Do Next?

### If You're New:
1. ✅ You're reading this (good start!)
2. Run quick start above
3. Read [PROJECT_STATUS.md](PROJECT_STATUS.md)
4. Try the bot with WhatsApp
5. Read [commands.md](commands.md)

### If You're Developing:
1. Read [ARCHITECTURE_SPEC.md](ARCHITECTURE_SPEC.md)
2. Check [DEV_PLAN.md](DEV_PLAN.md) for roadmap
3. Review [TESTING.md](TESTING.md)
4. Start coding!

### If You're Deploying:
1. Read [DEPLOYMENT.md](../DEPLOYMENT.md)
2. Setup Railway.app account
3. Configure environment variables
4. Deploy and monitor

---

## 💡 Key Concepts

### 1. State Management
User conversations are stateful (Redis):
```typescript
User: "הוסף אירוע"
State: ADDING_EVENT_NAME

Bot: "מה השם של האירוע?"
User: "פגישה עם דני"
State: ADDING_EVENT_DATE

Bot: "מתי?"
User: "מחר ב-3"
State: ADDING_EVENT_CONFIRM
...
```

### 2. Hebrew NLP
OpenAI parses Hebrew queries:
```typescript
Input: "תבטל את הפגישה עם דני מחר"
Output: {
  action: "delete",
  event: { title: "פגישה", person: "דני" },
  date: "2025-10-03"
}
```

### 3. Fuzzy Matching
Handles Hebrew variations:
```typescript
User: "מחק עם דני"
Event: "פגישה חשובה עם דני במשרד"
Match: ✅ Score 0.9 (90% match)
```

### 4. Queue-Based Reminders
BullMQ schedules reminders:
```typescript
Reminder: "קח תרופה" at 2025-10-03 09:00
↓
BullMQ Job scheduled for that time
↓
Worker sends WhatsApp message at exact time
```

---

## 🔐 Security

- ✅ PIN authentication (bcrypt hashed)
- ✅ Rate limiting (20 msg/min per user)
- ✅ Session timeouts (15 min idle)
- ✅ SQL injection prevention (parameterized queries)
- ✅ PII masking in logs
- ✅ Environment variables (no secrets in code)

---

## 📞 Getting Help

**Documentation Issues:**
- Check [PROJECT_STATUS.md](PROJECT_STATUS.md)
- Review [DEPLOYMENT.md](../DEPLOYMENT.md) troubleshooting

**Code Issues:**
- Check logs: `tail -f logs/error.log`
- Run tests: `npm test`
- Review recent fixes: [BUG_FIX_SUMMARY.md](../BUG_FIX_SUMMARY.md)

**Community:**
- Baileys: https://github.com/WhiskeySockets/Baileys
- BullMQ: https://docs.bullmq.io/
- OpenAI: https://platform.openai.com/docs

---

## ✨ Quick Wins

**5-Minute Tasks:**
- Run the bot locally
- Send a test message
- Create an event via menu
- Run the test suite

**30-Minute Tasks:**
- Deploy to Railway
- Test Hebrew NLP parsing
- Review architecture
- Add a new test

**1-Hour Tasks:**
- Add a new feature
- Write comprehensive tests
- Setup production monitoring
- Customize menu text

---

## 🎉 You're Ready!

Next steps:
1. ✅ Run quick start (above)
2. 📖 Read [PROJECT_STATUS.md](PROJECT_STATUS.md)
3. 💻 Start developing!

**Questions?** Check the documentation map above.

**Happy coding!** 🚀

---

**Last Updated:** October 2, 2025
**Status:** Production Ready ✅
**Version:** 0.1.0
