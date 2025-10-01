Product Requirements Document (PRD)
Product name (working): WhatsApp Personal Assistant Bot
Version: MVP (BullMQ + Local Calendar, Hebrew Menu Edition)
1) Objective
A WhatsApp-first assistant (Hebrew/English) that manages events, reminders, and tasks directly inside WhatsApp.
MVP: local per-user calendar in our DB, reminders with Redis + BullMQ, Hebrew hard-coded menu.
Later: NLP free-text, advanced recurrence, optional switch to Google Calendar via a provider interface.
Design Mandate: Calendar logic must always work locally, but architecture allows fast switch to Google Calendar if required (adapter + feature flag, with rollback).
2) Target Users
Busy parents, individuals, freelancers, small business owners.
Users who live in WhatsApp and don’t want to switch to separate apps for time management.
Hebrew speakers first, English support later.
3) Features
MUST HAVE (MVP)
📅 Events: create/list/delete events via menu.
⏰ Reminders: create one-time or weekly reminders.
✅ Tasks (stub): menu item present, returns “בקרוב” until Phase-2.
👨‍👩‍👧 Contacts: manage family/friend aliases for later NLP use.
⚙️ Settings: language (HE/EN), timezone.
📝 Draft Messages: write messages for user, send only on confirmation.
❓ Help: examples of usage and power commands.
Hard-coded Hebrew menu as main navigation (numbers 1–8).
SHOULD HAVE (Phase-2)
Full Tasks CRUD (add/list/done).
Smart conflict detection (warn if events overlap).
Advanced recurrence (weekly, monthly, yearly).
Special dates detection (birthdays, anniversaries auto-repeat).
RSVPs via WhatsApp messages to invited contacts.
COULD HAVE (Phase-3)
Smart reminder suggestions (context-based).
History search (“מתי נפגשתי עם דני?”).
Style customization (formal/friendly/funny).
Voice → text parsing of WhatsApp voice notes.
Weekly/monthly reports.
Image parsing (invites/photos → event).
4) User Experience (Menu-first Flow)
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
User replies with a number.
Each submenu provides structured options (see menu spec).
At any time: /תפריט returns to main menu.
Future: add natural-language fallback (“מה יש לי מחר?”).
5) Architecture & Stack
WhatsApp: Baileys (unofficial client; persistent session).
Scheduler: Redis + BullMQ (delayed + recurring jobs, retries).
DB: Postgres (Railway recommended); calendar always stored locally.
NLP: OpenAI API (Phase-2+); Hebrew/English date parsing.
Infra: Node.js service on a VM/container (serverless unsuitable for Baileys).
Calendar provider interface:
MVP: LocalCalendarProvider.
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
Parsing accuracy (when NLP added): ≥85%.
Active users after 30 days: ≥35%.
Reminder delivery: ≥99.5% on time.
Time to confirm event: ≤5s.
10) Risks
Baileys fragility → pin versions, quick QR re-login flow.
Hebrew ambiguity → clarify with 1 follow-up question.
TZ/DST issues → all UTC in DB, tested conversions.
Switch to Google → safe by design (adapter + shadow mode + rollback).