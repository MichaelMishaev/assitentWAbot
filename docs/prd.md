Product Requirements Document (PRD)
Product name (working): WhatsApp Personal Assistant Bot
Version: MVP (BullMQ + Local Calendar + NLP Edition)
1) Objective
A WhatsApp-first assistant (Hebrew/English) that manages events, reminders, and tasks directly inside WhatsApp.
MVP: local per-user calendar in our DB, reminders with Redis + BullMQ, Hebrew NLP date parsing, menu-based navigation with natural language fallback.
Later: advanced recurrence, optional switch to Google Calendar via a provider interface, full Tasks CRUD.
Design Mandate: Calendar logic must always work locally, but architecture allows fast switch to Google Calendar if required (adapter + feature flag, with rollback).
2) Target Users
Busy parents, individuals, freelancers, small business owners.
Users who live in WhatsApp and don’t want to switch to separate apps for time management.
Hebrew speakers first, English support later.
3) Features
MUST HAVE (MVP) ✅ IMPLEMENTED
📅 Events: create/list/delete events via menu or natural language.
⏰ Reminders: create one-time or weekly reminders.
👨‍👩‍👧 Contacts: manage family/friend aliases for NLP use.
⚙️ Settings: language (HE/EN), timezone.
❓ Help: examples of usage and power commands.
🧠 Hebrew NLP: advanced date parsing ("מחר", "שבוע הבא", "15/12", etc.).
🤖 OpenAI Integration: natural language understanding for event creation.
📊 Rate Limiting: multi-layer protection (per-user, per-phone, global).
🔍 Advanced Menu: dynamic rendering with context-aware navigation.
⏱️ Timezone Support: full UTC storage with user-specific timezone conversion.

IN PROGRESS
📝 Draft Messages: write messages for user, send only on confirmation.
✅ Tasks: full CRUD (add/list/done/delete).

SHOULD HAVE (Phase-2)
Smart conflict detection (warn if events overlap).
Advanced recurrence (weekly, monthly, yearly with complex patterns).
Special dates detection (birthdays, anniversaries auto-repeat).
RSVPs via WhatsApp messages to invited contacts.
Google Calendar integration (via provider interface).
COULD HAVE (Phase-3)
Smart reminder suggestions (context-based).
History search (“מתי נפגשתי עם דני?”).
Style customization (formal/friendly/funny).
Voice → text parsing of WhatsApp voice notes.
Weekly/monthly reports.
Image parsing (invites/photos → event).
4) User Experience (Hybrid: Menu + Natural Language)
Main Menu (Hebrew):
תפריט ראשי
1) 📅 האירועים שלי
2) ➕ הוסף אירוע
3) ⏰ הוסף תזכורת
4) ✅ משימות
5) 👨‍👩‍👧 אנשי קשר / משפחה
6) ⚙️ הגדרות
7) 📝 ניסוח הודעה
8) ❓ עזרה

Interaction Modes:
• Menu-based: User replies with number (1-8), bot shows submenu with options.
• Natural language: User types free-text ("תזכיר לי מחר בשעה 3"), NLP parses and creates.
• Mixed: User can switch between modes seamlessly.
• Command: /תפריט returns to main menu anytime.

Hebrew Date Parsing Examples:
✅ Keywords: "היום", "מחר", "מחרתיים", "שבוע הבא", "חודש הבא"
✅ Dates: "15/12", "15/12/2025", "15.12.2025"
✅ Days: "יום ראשון", "יום שני הבא", "שישי"
✅ Ranges: "השבוע", "החודש", "בשבוע הבא"
5) Architecture & Stack
WhatsApp: Baileys (unofficial client; persistent session).
Scheduler: Redis + BullMQ (delayed + recurring jobs, retries).
DB: Postgres (Railway recommended); calendar always stored locally.
NLP: ✅ IMPLEMENTED IN MVP
  • OpenAI API (GPT-4) for natural language understanding
  • Custom Hebrew date parser (hebrewDateParser.ts) - handles keywords, dates, days, ranges
  • Hebrew text matcher (hebrewMatcher.ts) - fuzzy matching for Hebrew input
  • Date validator (dateValidator.ts) - comprehensive validation logic
Infra: Node.js 20+ / TypeScript, deployed on Railway/VM (serverless unsuitable for Baileys).
Testing: Jest + comprehensive test coverage for NLP components.
Logging: Winston with PII masking.

Calendar provider interface:
MVP: LocalCalendarProvider (PostgreSQL storage).
Future: GoogleCalendarProvider.
Switch with CAL_PROVIDER=LOCAL|GOOGLE.
6) Data Model
users
id | phone | username | password_hash | name | locale | timezone | prefs_jsonb | calendar_provider ('LOCAL' default)
contacts
id | user_id | name | relation | aliases text[]
events
id | user_id | title | start_ts_utc | end_ts_utc | rrule | location | notes | source | confidence | external_ref_jsonb
reminders
id | user_id | title | due_ts_utc | rrule | status | event_id | external_ref_jsonb
7) Scheduling (BullMQ)
Queues: reminders, recurrence.
Job options: attempts=3, exponential backoff.
Idempotency: ${user_id}:${entity}:${id}:${ts}.
All timestamps UTC; render in user TZ.
8) Security
Passwords hashed (bcrypt), even for admin/admin test user.
Baileys session keys encrypted.
Secrets in env vars.
PII masked in logs.
Explicit approval before sending messages “on behalf of” user.
9) KPIs
Hebrew NLP parsing accuracy: ≥90% (tested and validated).
Active users after 30 days: ≥35%.
Reminder delivery: ≥99.5% on time (BullMQ reliability).
Time to confirm event: ≤5s.
Rate limit violations: <1% of requests.
10) Risks & Mitigations
Baileys fragility → ✅ Pinned versions, session persistence, QR re-login flow.
Hebrew ambiguity → ✅ Multi-layer NLP (custom parser + OpenAI fallback), confirmation prompts.
TZ/DST issues → ✅ All UTC in DB, Luxon for conversions, comprehensive timezone tests.
OpenAI costs → Monitor usage, implement caching for common phrases, fallback to local parser.
Rate limiting → ✅ Multi-layer protection (per-user, per-phone, global).
Future Google Calendar switch → Safe by design (adapter pattern + feature flag + rollback).