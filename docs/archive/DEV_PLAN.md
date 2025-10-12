# WhatsApp Assistant Bot - Development Checklist

**Timeline:** 14 weeks to MVP
**Start Date:** 2025-10-01
**Target Launch:** 2026-01-08

---

## 🗓️ WEEK 1-2: Foundation & Infrastructure

### Database Setup
- [ ] Install PostgreSQL (or setup Supabase account)
- [ ] Create database: `whatsapp_assistant`
- [ ] Create tables:
  ```sql
  - [ ] users (id, phone, username, password_hash, name, locale, timezone, prefs_jsonb, calendar_provider, created_at)
  - [ ] contacts (id, user_id, name, relation, aliases, created_at)
  - [ ] events (id, user_id, title, start_ts_utc, end_ts_utc, rrule, location, notes, source, confidence, created_at)
  - [ ] reminders (id, user_id, title, due_ts_utc, rrule, status, event_id, created_at)
  - [ ] sessions (user_id, state, context, last_activity, expires_at)
  ```
- [ ] Add indexes on: `phone`, `user_id`, `start_ts_utc`, `due_ts_utc`
- [ ] Setup migration tool (node-pg-migrate or Prisma)
- [ ] Test connection & create seed data

### Redis Setup
- [ ] Install Redis locally (or use Redis Cloud)
- [ ] Configure persistence (RDB + AOF)
- [ ] Test connection
- [ ] Setup Redis client in Node.js

### BullMQ Setup
- [ ] Install BullMQ: `npm install bullmq`
- [ ] Create queues folder structure
- [ ] Setup `reminders` queue
- [ ] Setup `recurrence` queue
- [ ] Create basic worker template
- [ ] Test job scheduling & processing

### Project Structure
- [ ] Initialize Node.js project: `npm init`
- [ ] Install dependencies:
  ```bash
  npm install baileys @whiskeysockets/baileys
  npm install bullmq ioredis pg
  npm install express dotenv winston
  npm install typescript @types/node ts-node
  npm install bcrypt luxon zod
  ```
- [ ] Setup TypeScript config
- [ ] Create folder structure:
  ```
  src/
  ├── config/          # DB, Redis, Baileys config
  ├── providers/       # Message provider interface
  ├── services/        # Business logic
  ├── queues/          # BullMQ workers
  ├── utils/           # Helpers (logger, timezone)
  ├── types/           # TypeScript interfaces
  └── index.ts         # Main entry
  ```
- [ ] Setup environment variables (.env):
  ```
  DATABASE_URL=
  REDIS_URL=
  MESSAGE_PROVIDER=baileys
  SESSION_PATH=./sessions
  LOG_LEVEL=info
  ```
- [ ] Setup Winston logger
- [ ] Setup error handling middleware

### Baileys Integration
- [ ] Initialize Baileys client
- [ ] Implement session storage (multi-file auth state)
- [ ] QR code generation (save to file or send to admin)
- [ ] Auto-reconnect logic (on disconnect)
- [ ] Test message send/receive
- [ ] Implement session manager (support multiple users)

**End of Week 2 Milestone:** ✅ Can send/receive WhatsApp messages, DB connected, Redis working

---

## 🗓️ WEEK 3-4: Authentication & State Management

### State Manager
- [ ] Create `StateManager` class (Redis-based)
- [ ] Define enum `ConversationState` (IDLE, MAIN_MENU, ADDING_EVENT_NAME, etc.)
- [ ] Implement `setState(userId, state, context)`
- [ ] Implement `getState(userId)` with timeout check
- [ ] Implement `clearState(userId)`
- [ ] Implement `handleTimeout(userId, session)` - send message + clear
- [ ] Create timeout configs per state
- [ ] Write tests for state transitions

### Authentication Service
- [ ] Create `AuthService` class
- [ ] Implement registration flow:
  ```typescript
  - [ ] Detect new user (phone not in DB)
  - [ ] State: ASK_NAME → collect name
  - [ ] State: ASK_PIN → collect 4-digit PIN
  - [ ] Hash PIN with bcrypt
  - [ ] Save to DB
  - [ ] Auto-login after registration
  ```
- [ ] Implement login flow:
  ```typescript
  - [ ] Detect existing user
  - [ ] Prompt for PIN
  - [ ] Verify PIN (bcrypt.compare)
  - [ ] Track failed attempts (Redis)
  - [ ] Lockout after 3 failed attempts (5 min)
  - [ ] Set authenticated state
  ```
- [ ] Implement `/logout` command
- [ ] Implement session expiry (30 days)
- [ ] Write tests for auth flows

### Rate Limiting
- [ ] Create `RateLimiter` class
- [ ] Implement per-user inbound limit (30 msg/min):
  ```typescript
  - [ ] Use Redis sorted set (sliding window)
  - [ ] Return error if exceeded
  - [ ] Temp ban for 5 min
  ```
- [ ] Implement per-user outbound limit (20 msg/min):
  ```typescript
  - [ ] Check before sending
  - [ ] Queue if exceeded
  ```
- [ ] Implement global limit (5000 msg/hour):
  ```typescript
  - [ ] Redis counter per hour
  - [ ] Pause all sends if exceeded
  - [ ] Alert admin
  ```
- [ ] Implement quality tracker:
  ```typescript
  - [ ] Track messages sent vs read
  - [ ] Detect blocks (user blocks bot)
  - [ ] Alert if block rate > 5%
  ```

**End of Week 4 Milestone:** ✅ Users can register, login, rate limiting works

---

## 🗓️ WEEK 5: Menu System & Navigation

### Main Menu
- [ ] Create Hebrew menu text:
  ```
  תפריט ראשי
  1) 📅 האירועים שלי
  2) ➕ הוסף אירוע
  3) ⏰ הוסף תזכורת
  4) ✅ משימות (בקרוב)
  5) 👨‍👩‍👧 אנשי קשר
  6) ⚙️ הגדרות
  7) 📝 ניסוח הודעה
  8) ❓ עזרה
  ```
- [ ] Implement menu rendering function
- [ ] Handle numeric input (1-8)
- [ ] Route to appropriate submenu

### List Message UI (Better UX)
- [ ] Research Baileys list message format
- [ ] Implement list message wrapper:
  ```typescript
  async sendListMessage(to: string, title: string, sections: Section[])
  ```
- [ ] Test list messages
- [ ] Add fallback to numbered text menu (if list not supported)

### Commands
- [ ] Implement `/תפריט` - return to main menu
- [ ] Implement `/ביטול` - cancel current operation, go back
- [ ] Implement `/עזרה` - show help text with examples
- [ ] Implement `/התנתק` - logout
- [ ] Command parser (detect `/` prefix)

### Help System
- [ ] Write help text in Hebrew:
  ```
  דוגמאות שימוש:
  • הוסף אירוע: תפריט → 2
  • צפה באירועי היום: תפריט → 1 → 1
  • תזכורת חדשה: תפריט → 3

  פקודות מהירות:
  /תפריט - תפריט ראשי
  /ביטול - ביטול פעולה
  /עזרה - עזרה
  ```
- [ ] Implement help command handler

**End of Week 5 Milestone:** ✅ Menu navigation works, commands functional

---

## 🗓️ WEEK 6-7: Events CRUD

### LocalCalendarProvider
- [ ] Create `ICalendarProvider` interface:
  ```typescript
  interface ICalendarProvider {
    createEvent(userId, event): Promise<Event>
    getEvents(userId, filter): Promise<Event[]>
    updateEvent(eventId, updates): Promise<Event>
    deleteEvent(eventId): Promise<void>
  }
  ```
- [ ] Implement `LocalCalendarProvider`:
  ```typescript
  - [ ] createEvent() → INSERT into events table
  - [ ] getEvents() → SELECT with filters (today, tomorrow, week, all)
  - [ ] updateEvent() → UPDATE
  - [ ] deleteEvent() → DELETE
  ```
- [ ] Timezone utilities:
  ```typescript
  - [ ] utcToUserTz(utc, timezone)
  - [ ] userTzToUtc(local, timezone)
  - [ ] formatDateTime(ts, locale, timezone)
  ```

### Create Event Flow
- [ ] State: `ADDING_EVENT_NAME`
  - [ ] Prompt: "מה השם של האירוע?"
  - [ ] Validate: non-empty, max 100 chars
  - [ ] Save to context
- [ ] State: `ADDING_EVENT_DATE`
  - [ ] Prompt: "מתי? (DD/MM/YYYY או 'מחר', 'יום ראשון')"
  - [ ] Parse date (support Hebrew keywords: מחר, היום, יום ראשון, etc.)
  - [ ] Validate: future date
  - [ ] Save to context
- [ ] State: `ADDING_EVENT_TIME`
  - [ ] Prompt: "באיזו שעה? (HH:MM)"
  - [ ] Parse time (24h format)
  - [ ] Validate: valid time
  - [ ] Save to context
- [ ] State: `ADDING_EVENT_LOCATION` (optional)
  - [ ] Prompt: "איפה? (אופציונלי, שלח - לדלג)"
  - [ ] Save to context
- [ ] State: `ADDING_EVENT_CONFIRM`
  - [ ] Show summary:
    ```
    סיכום האירוע:
    📅 שם: פגישה עם דני
    🕐 תאריך: 15/10/2025 14:00
    📍 מיקום: משרד

    לאשר? (כן/לא)
    ```
  - [ ] If yes → save to DB via LocalCalendarProvider
  - [ ] If no → ask what to change or cancel
- [ ] Success message: "האירוע נוסף בהצלחה! ✅"
- [ ] Return to main menu

### List Events
- [ ] Create submenu:
  ```
  איזה אירועים להציג?
  1) היום
  2) מחר
  3) השבוע
  4) הכל (הבאים)
  ```
- [ ] Implement filters:
  - [ ] Today: start >= today 00:00, < tomorrow 00:00
  - [ ] Tomorrow: start >= tomorrow 00:00, < day after 00:00
  - [ ] This week: start >= today, < end of week
  - [ ] All: start >= now, ORDER BY start_ts_utc
- [ ] Format output:
  ```
  📅 האירועים שלך היום:

  1. 09:00 - 10:00 | ישיבת צוות
  2. 14:00 - 15:00 | פגישה עם דני
     📍 משרד

  סה"כ: 2 אירועים
  ```
- [ ] Handle empty: "אין אירועים"

### Delete Event
- [ ] Show numbered list of upcoming events
- [ ] User selects number
- [ ] Confirmation prompt:
  ```
  למחוק את האירוע:
  "פגישה עם דני" (15/10/2025 14:00)

  בטוח? (כן/לא)
  ```
- [ ] Delete from DB
- [ ] Success: "האירוע נמחק ✅"

### Hebrew Date Parser
- [ ] Support keywords:
  - [ ] היום → today
  - [ ] מחר → tomorrow
  - [ ] מחרתיים → day after tomorrow
  - [ ] יום ראשון, שני, שלישי... → next occurrence
  - [ ] סופש → next Saturday
- [ ] Support DD/MM/YYYY format
- [ ] Support DD/MM (assume current year)
- [ ] Error handling: invalid dates

**End of Week 7 Milestone:** ✅ Can create, list, delete events

---

## 🗓️ WEEK 8-9: Reminders & BullMQ

### Create Reminder Flow
- [ ] State: `ADDING_REMINDER_TITLE`
  - [ ] Prompt: "על מה להזכיר?"
  - [ ] Validate: non-empty
  - [ ] Save to context
- [ ] State: `ADDING_REMINDER_DATETIME`
  - [ ] Prompt: "מתי? (DD/MM/YYYY HH:MM)"
  - [ ] Parse date + time
  - [ ] Validate: future
  - [ ] Save to context
- [ ] State: `ADDING_REMINDER_RECURRENCE`
  - [ ] Prompt:
    ```
    חוזר?
    1) לא (חד פעמי)
    2) כל יום
    3) כל שבוע
    ```
  - [ ] Save to context
- [ ] State: `ADDING_REMINDER_CONFIRM`
  - [ ] Show summary
  - [ ] Save to DB
  - [ ] Schedule BullMQ job
- [ ] Success: "התזכורת נוצרה! ✅"

### BullMQ Integration
- [ ] Create `ReminderQueue`:
  ```typescript
  - [ ] addJob(reminderId, userId, dueDate, message)
  - [ ] Use jobId: `reminder:${reminderId}`
  - [ ] Set delay: dueDate - now
  - [ ] Set attempts: 3
  - [ ] Set backoff: exponential
  ```
- [ ] Create `RecurrenceQueue`:
  ```typescript
  - [ ] For recurring reminders
  - [ ] Use repeat option (cron or every)
  - [ ] Handle weekly recurrence
  ```
- [ ] Implement idempotency:
  ```typescript
  - [ ] Check if job already exists before adding
  - [ ] Use unique jobId
  ```

### Reminder Worker
- [ ] Create `ReminderWorker`:
  ```typescript
  - [ ] Process job when due
  - [ ] Get reminder from DB
  - [ ] Check if still active (not cancelled)
  - [ ] Send WhatsApp message:
      "⏰ תזכורת: קנה חלב!"
  - [ ] Update status in DB (sent)
  - [ ] Log success
  ```
- [ ] Error handling:
  ```typescript
  - [ ] If send fails → retry (3 times)
  - [ ] If user blocked bot → mark failed, don't retry
  - [ ] Log all failures
  ```
- [ ] Recurring reminders:
  ```typescript
  - [ ] After sending, schedule next occurrence
  - [ ] Update next_due_ts in DB
  ```

### List Reminders
- [ ] Show active reminders:
  ```
  ⏰ התזכורות שלך:

  1. 15/10 14:00 | קנה חלב
  2. כל יום 09:00 | קח תרופה
  3. 20/10 18:00 | יום הולדת לדני

  סה"כ: 3 תזכורות
  ```
- [ ] Option to cancel:
  - [ ] Select number
  - [ ] Confirm
  - [ ] Remove from BullMQ
  - [ ] Mark inactive in DB

**End of Week 9 Milestone:** ✅ Reminders work, sent on time via BullMQ

---

## 🗓️ WEEK 10: Contacts & Settings

### Contacts Management
- [ ] Add Contact Flow:
  ```typescript
  - [ ] State: collect name
  - [ ] State: collect relation (family/friend/work)
  - [ ] State: collect aliases (comma-separated)
  - [ ] Save to DB
  ```
- [ ] List Contacts:
  ```
  👨‍👩‍👧 אנשי הקשר שלך:

  1. דני (חבר)
     כינויים: דניאל, Daniel
  2. שרה (משפחה)
  3. יוסי (עבודה)
  ```
- [ ] Delete Contact (with confirmation)

### Settings
- [ ] Language Setting:
  ```
  בחר שפה:
  1) עברית 🇮🇱
  2) English 🇺🇸
  ```
  - [ ] Update user locale in DB
  - [ ] Apply to all future messages
- [ ] Timezone Setting:
  ```
  בחר אזור זמן:
  1) ירושלים (GMT+2/+3)
  2) ניו יורק (GMT-5/-4)
  3) לונדון (GMT+0/+1)
  ```
  - [ ] Update user timezone in DB
  - [ ] Apply to date/time formatting

**End of Week 10 Milestone:** ✅ Contacts work, settings functional

---

## 🗓️ WEEK 11: Draft Messages

### Message Drafting Flow
- [ ] State: `DRAFT_SELECT_RECIPIENT`
  - [ ] Show list of contacts (numbered)
  - [ ] Or enter phone manually
  - [ ] Save to context
- [ ] State: `DRAFT_COMPOSE`
  - [ ] Prompt: "מה לכתוב?"
  - [ ] User types message
  - [ ] Save to context
- [ ] State: `DRAFT_SCHEDULE`
  - [ ] Prompt:
    ```
    מתי לשלוח?
    1) עכשיו
    2) בזמן מסוים (תזמן)
    ```
  - [ ] If now → preview + confirm
  - [ ] If scheduled → collect datetime
- [ ] State: `DRAFT_CONFIRM`
  - [ ] Preview:
    ```
    למי: דני (0521234567)
    הודעה: "שלום דני, מה קורה?"
    זמן: עכשיו / 15/10 14:00

    לשלוח? (כן/לא)
    ```
  - [ ] If yes + now → send immediately
  - [ ] If yes + scheduled → add to BullMQ
  - [ ] If no → back to edit

### Scheduled Message Worker
- [ ] Create `MessageQueue` (similar to reminders)
- [ ] Worker:
  ```typescript
  - [ ] Get message from job data
  - [ ] Send WhatsApp message to recipient
  - [ ] Notify sender (confirmation)
  - [ ] Log success
  ```

**End of Week 11 Milestone:** ✅ Can draft and send/schedule messages

---

## 🗓️ WEEK 12-13: Polish, Testing, Monitoring

### Polish
- [ ] Review all Hebrew text (grammar, tone)
- [ ] Add emojis to menus (📅⏰✅👨‍👩‍👧⚙️📝❓)
- [ ] Loading indicators:
  - [ ] "רגע, מעבד..." while processing
  - [ ] "שולח..." when sending message
- [ ] Better error messages:
  ```
  ❌ קלט לא תקין. נסה שוב או שלח /עזרה
  ⚠️ זמן לא תקין. השתמש בפורמט HH:MM (לדוגמה: 14:30)
  🔒 החשבון נעול. נסה שוב בעוד 5 דקות
  ```
- [ ] Confirmation messages with context:
  ```
  ✅ האירוע נוסף ליום ראשון 15/10 בשעה 14:00
  ✅ התזכורת תישלח ביום חמישי 20/10 בשעה 09:00
  ```

### Unit Tests
- [ ] Test AuthService:
  - [ ] Registration flow
  - [ ] Login success/failure
  - [ ] Lockout after 3 attempts
- [ ] Test StateManager:
  - [ ] State transitions
  - [ ] Timeout handling
  - [ ] Context persistence
- [ ] Test RateLimiter:
  - [ ] Per-user limits
  - [ ] Global limits
  - [ ] Temp bans
- [ ] Test date parser:
  - [ ] Hebrew keywords (מחר, היום, יום ראשון)
  - [ ] DD/MM/YYYY format
  - [ ] Invalid inputs
- [ ] Test LocalCalendarProvider:
  - [ ] CRUD operations
  - [ ] Timezone conversions

### Integration Tests
- [ ] Full event creation flow (end-to-end)
- [ ] Full reminder flow + BullMQ processing
- [ ] Menu navigation paths
- [ ] Error recovery (timeout, cancel, invalid input)

### Manual Testing
- [ ] Test with real WhatsApp account
- [ ] Test all menu options
- [ ] Test edge cases:
  - [ ] Very long event names
  - [ ] Invalid dates (Feb 30)
  - [ ] Timezone edge cases (DST)
  - [ ] Concurrent messages
- [ ] Hebrew text rendering
- [ ] Emoji rendering

### Monitoring Setup
- [ ] Winston logger levels:
  - [ ] ERROR: failures, crashes
  - [ ] WARN: rate limits, timeouts
  - [ ] INFO: user actions, reminders sent
  - [ ] DEBUG: state transitions
- [ ] Log to file + console
- [ ] Rotate logs daily
- [ ] Setup Sentry (error tracking):
  - [ ] Install Sentry SDK
  - [ ] Capture exceptions
  - [ ] User context in errors
- [ ] Metrics tracking:
  - [ ] Events created per day
  - [ ] Reminders sent per day
  - [ ] Active users per day
  - [ ] Average response time
  - [ ] Error rate
- [ ] Health check endpoint:
  ```typescript
  GET /health
  {
    "status": "ok",
    "db": "connected",
    "redis": "connected",
    "baileys": "connected",
    "uptime": 123456
  }
  ```

### Load Testing
- [ ] Simulate 50 concurrent users
- [ ] Test rate limiting kicks in
- [ ] Check memory usage
- [ ] Check Redis/DB connection pool
- [ ] Identify bottlenecks

**End of Week 13 Milestone:** ✅ Fully tested, monitored, polished MVP

---

## 🗓️ WEEK 14: Deployment & Launch

### Server Setup
- [ ] Choose provider:
  - [ ] DigitalOcean Droplet ($12/month)
  - [ ] AWS EC2 t3.small
  - [ ] Hetzner VPS
- [ ] Provision server (Ubuntu 22.04)
- [ ] Install Node.js 20
- [ ] Install PostgreSQL 15
- [ ] Install Redis 7
- [ ] Setup firewall (UFW):
  - [ ] Allow 22 (SSH)
  - [ ] Allow 80 (HTTP)
  - [ ] Allow 443 (HTTPS)

### Docker Deployment (Optional but Recommended)
- [ ] Create Dockerfile:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --production
  COPY . .
  RUN npm run build
  CMD ["node", "dist/index.js"]
  ```
- [ ] Create docker-compose.yml:
  ```yaml
  services:
    app:
      build: .
      restart: always
    postgres:
      image: postgres:15
      restart: always
    redis:
      image: redis:7-alpine
      restart: always
  ```
- [ ] Test locally: `docker-compose up`

### PM2 Process Manager
- [ ] Install PM2: `npm install -g pm2`
- [ ] Create ecosystem.config.js:
  ```javascript
  module.exports = {
    apps: [{
      name: 'whatsapp-bot',
      script: './dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    }]
  }
  ```
- [ ] Start: `pm2 start ecosystem.config.js`
- [ ] Setup auto-restart on boot: `pm2 startup`
- [ ] Save process list: `pm2 save`

### SSL & Domain (Optional)
- [ ] Buy domain or use free subdomain (afraid.org)
- [ ] Point DNS to server IP
- [ ] Install Certbot: `apt install certbot`
- [ ] Get SSL cert: `certbot certonly --standalone`
- [ ] Setup Nginx reverse proxy (for health check endpoint)

### Environment Variables
- [ ] Create production .env:
  ```
  DATABASE_URL=postgresql://user:pass@localhost:5432/whatsapp_prod
  REDIS_URL=redis://localhost:6379
  MESSAGE_PROVIDER=baileys
  SESSION_PATH=/var/whatsapp/sessions
  LOG_LEVEL=info
  SENTRY_DSN=https://...
  ```
- [ ] Secure .env (chmod 600)

### Database Migration
- [ ] Run migrations on production DB
- [ ] Create admin user (for testing)
- [ ] Verify schema

### First QR Code Scan
- [ ] Start bot
- [ ] Get QR code (from logs or file)
- [ ] Scan with WhatsApp (primary admin number)
- [ ] Verify connection success
- [ ] Test sending message to self

### Monitoring & Alerts
- [ ] Setup monitoring dashboard (PM2 Plus or Datadog)
- [ ] Setup alerts:
  - [ ] Email if bot crashes
  - [ ] Email if error rate > 5%
  - [ ] Email if reminder queue > 1000
- [ ] Setup backup cron job:
  ```bash
  0 2 * * * pg_dump whatsapp_prod | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz
  ```

### Beta Testing
- [ ] Invite 5-10 beta testers
- [ ] Collect feedback
- [ ] Fix critical bugs
- [ ] Monitor error logs

### Launch Checklist
- [ ] ✅ All tests passing
- [ ] ✅ Monitoring working
- [ ] ✅ Backups configured
- [ ] ✅ Error tracking active
- [ ] ✅ Rate limiting tested
- [ ] ✅ Hebrew text correct
- [ ] ✅ QR code connection stable
- [ ] ✅ Reminders sending on time
- [ ] ✅ Help documentation complete

### Post-Launch (Week 1-2)
- [ ] Monitor daily:
  - [ ] Error logs
  - [ ] User registrations
  - [ ] Reminder delivery rate
  - [ ] Response times
- [ ] Collect user feedback
- [ ] Create bug list (prioritize)
- [ ] Plan Phase 2 features

**End of Week 14 Milestone:** 🚀 MVP LIVE IN PRODUCTION

---

## 📋 Optional: Phase 2 (Weeks 15-20)

### Advanced Features
- [ ] Full Tasks CRUD (add, list, mark done)
- [ ] NLP integration (OpenAI for free-text parsing):
  ```
  User: "פגישה עם דני מחר ב-3"
  → Bot extracts: title="פגישה עם דני", date=tomorrow, time=15:00
  ```
- [ ] Recurring events (weekly, monthly)
- [ ] Conflict detection (warn if overlapping events)
- [ ] Smart time suggestions ("בבוקר" → 09:00, "בערב" → 19:00)
- [ ] Group RSVPs (invite contacts, track responses)
- [ ] Voice message support (Whisper API transcription)
- [ ] Image parsing (screenshot of invite → extract event)

### WhatsApp Business API Migration
- [ ] Follow migration plan in ARCHITECTURE_SPEC.md
- [ ] Apply for API access
- [ ] Implement provider interface
- [ ] Shadow mode testing
- [ ] Gradual rollout

---

## 📊 Daily Standup Template

**Date:** YYYY-MM-DD
**Week:** X

**Yesterday:**
- [ ] Task completed
- [ ] Blockers

**Today:**
- [ ] Task 1
- [ ] Task 2

**Blockers:**
- None / Issue description

---

## 🚨 Common Issues & Solutions

### Issue: Baileys disconnects frequently
**Solution:**
- Check internet connection stability
- Increase reconnect timeout
- Check if WhatsApp banned the number (too many messages)
- Switch to backup number

### Issue: Reminders not sending on time
**Solution:**
- Check BullMQ worker is running (`pm2 list`)
- Check Redis connection
- Check system clock (NTP sync)
- Check logs for errors

### Issue: Hebrew text garbled
**Solution:**
- Check file encoding (UTF-8)
- Check terminal encoding
- Check WhatsApp client supports RTL

### Issue: High memory usage
**Solution:**
- Check for memory leaks (use `process.memoryUsage()`)
- Restart PM2 process
- Increase max_memory_restart limit
- Check for too many open sessions

### Issue: Rate limit false positives
**Solution:**
- Adjust rate limit thresholds
- Check Redis sorted set cleanup
- Clear rate limit keys manually if needed

---

## 🎯 Success Criteria

- [x] Users can register via WhatsApp (no external app)
- [x] Users can create events in <30 seconds
- [x] Reminders sent within ±2 minutes of scheduled time
- [x] Response time < 3 seconds
- [x] Hebrew language fully supported
- [x] Zero WhatsApp bans during testing
- [x] Error rate < 1%
- [x] Beta testers report "easy to use"

---

## 📚 Resources

- **Baileys Docs:** https://baileys.wiki/
- **BullMQ Docs:** https://docs.bullmq.io/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Luxon (Timezone):** https://moment.github.io/luxon/
- **WhatsApp Business API:** https://developers.facebook.com/docs/whatsapp/

---

**Last Updated:** 2025-10-01
**Status:** Ready to Start ✅
**Next Action:** Begin Week 1 - Foundation Setup
