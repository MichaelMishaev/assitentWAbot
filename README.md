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
| **[ENSEMBLE_AI.md](ENSEMBLE_AI.md)** ⭐ | 3-model voting system (NEW!) |
| **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** | V2 Architecture - All 10 phases complete! |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guide |
| [BUG_FIX_SUMMARY.md](BUG_FIX_SUMMARY.md) | Date parsing fixes (Oct 2025) |
| [TEST_REPORT_COMPREHENSIVE.md](TEST_REPORT_COMPREHENSIVE.md) | Hebrew NLP test results |

---

## 🐛 Bug Reporting Convention

**IMPORTANT:** All `#` comments in the codebase are **user-reported bugs** documented during testing.

**In WhatsApp Chat (Production Testing):**
```
# Bug: Asked for "today" but got all events
# היום (today) not recognized - shows all upcoming events instead
# Date parser interprets "16:10" as time, not filtering by date
```

**Convention:**
- **`#` = User-reported bug** during real-world testing
- Bot **logs** these to `logs/dev-comments.log`
- Developer reviews comments to batch-fix issues
- **DO NOT** treat `#` as general comments - they're bug reports!

**View bug reports:**
```bash
# Interactive viewer (local or production)
./scripts/view-dev-comments.sh

# Or SSH directly
ssh root@167.71.145.9
cat /root/wAssitenceBot/logs/dev-comments.log
```

**Workflow:**
1. User tests in WhatsApp → documents bugs with `#` comments
2. Developer reviews all `#` comments later
3. Ask Claude: "analyze all # comments and fix the bugs"
4. Claude identifies patterns and fixes issues systematically

---

## 📊 Tech Stack

```
Language:     Node.js 20 + TypeScript
Database:     Railway Postgres
Queue:        BullMQ + Redis
WhatsApp:     Baileys
AI:           Ensemble (GPT-4o-mini, Gemini Flash, Claude Haiku)
Architecture: V2 Pipeline (10 phases) + Plugin System
Cost:         $12-15/month (MVP)
```

### 🤖 Ensemble AI - 3 Models Voting

The bot uses **3 AI models in parallel** for higher accuracy:

- **GPT-4o-mini** ($0.15/$0.60 per 1M tokens)
- **Gemini 2.0 Flash** ($0.075/$0.30 per 1M tokens) - CHEAPEST!
- **Claude 3 Haiku** ($0.25/$1.25 per 1M tokens)

**Result:** 96% accuracy at 95% cost savings vs GPT-4 Turbo!

📚 **Full documentation:** [ENSEMBLE_AI.md](ENSEMBLE_AI.md)

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
# Clone & setup
git clone <repo>
cd whatsapp-bot
npm install

# Configure environment (.env file)
cp .env.example .env
# Add your API keys:
# - OPENAI_API_KEY (from https://platform.openai.com/api-keys)
# - GEMINI_API_KEY (from https://aistudio.google.com/apikey)
# - ANTHROPIC_API_KEY (from https://console.anthropic.com/settings/keys)

# Setup database & Redis
# Option 1: Railway CLI
railway login && railway init && railway add postgresql && railway add redis

# Option 2: Local Docker
docker-compose up -d

# Start development
npm run dev
```

**⚠️ REQUIRED API Keys for Ensemble AI:**
- OpenAI (GPT-4o-mini)
- Google Gemini (Gemini 2.0 Flash)
- Anthropic Claude (Claude 3 Haiku)

All 3 keys are **required** for the bot to work properly.

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

## 🎯 Features (V2 Architecture)

### Core Features ✅
- ✅ Events (create, update, delete, search)
- ✅ Reminders (one-time + recurring with RRULE)
- ✅ Contacts management
- ✅ Draft messages
- ✅ Settings (language, timezone)

### Advanced Features (NEW!) 🚀
- ✅ **Ensemble AI** - 3 models voting (96% accuracy)
- ✅ **Hebrew Calendar** - Shabbat & holiday warnings
- ✅ **Cost Tracking** - WhatsApp alerts at $10 increments
- ✅ **User Profiles** - Smart defaults & pattern learning
- ✅ **Fuzzy Matching** - Typo-tolerant event search
- ✅ **Multi-Event** - Create multiple events from one message
- ✅ **Recurrence** - Daily/weekly/monthly patterns
- ✅ **Comments** - Add notes to events
- ✅ **Participants** - Multi-person events
- ✅ **Voice Support** - Voice message normalization

### 10-Phase Pipeline
1. Voice Normalizer (Hebrew number conversion)
2. Ensemble Intent (3-model voting)
3. Multi-Event Detection
4. Entity Extraction
5. Hebrew Calendar Check
6. User Profiles & Smart Defaults
7. Update/Delete Fuzzy Matching
8. Recurrence Pattern Detection
9. Comment System
10. Participant Detection

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

*Last Updated: October 12, 2025*
*Status: **V2 Architecture Complete - 95% Done!** 🚀*
*Version: 2.0.0*

**✨ New in V2:**
- Ensemble AI with 3 models (GPT-4o-mini, Gemini Flash, Claude Haiku)
- 10-phase pipeline for advanced message processing
- Hebrew calendar integration (Shabbat & holiday warnings)
- Cost tracking with automatic WhatsApp alerts
- Smart user profiles that learn from history
- Fuzzy matching for typo-tolerant search
- Multi-event detection and recurring events
- Voice message support with Hebrew number conversion

**📦 Implementation:** 2,900+ lines of production code across 22 new files!
