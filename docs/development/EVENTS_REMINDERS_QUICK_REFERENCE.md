# Events & Reminders - Quick Reference Guide

## File Locations (Absolute Paths)

### Core Services
- **EventService** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/EventService.ts`
- **ReminderService** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/ReminderService.ts`
- **NLPService** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/NLPService.ts`

### Scheduling & Processing
- **ReminderQueue** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/queues/ReminderQueue.ts`
- **ReminderWorker** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/queues/ReminderWorker.ts`
- **DailySchedulerService** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/DailySchedulerService.ts`

### Parsing & NLP
- **Hebrew Date Parser** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/utils/hebrewDateParser.ts`
- **Entity Extraction Phase** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/domain/phases/phase3-entity-extraction/EntityExtractionPhase.ts`
- **NLP Router** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/routing/NLPRouter.ts`

### Configuration
- **Database Config** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/config/database.ts`
- **Redis Config** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/config/redis.ts`

### Types & Models
- **Type Definitions** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/types/index.ts` (lines 67-94)

### Database Migrations
- **Initial Schema** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1733086800000_initial-schema.sql`
- **Event Comments (JSONB)** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1733176800000_add_event_comments_jsonb.sql`
- **Reminder Notes** - `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1760183452000_add_reminder_notes.sql`

---

## Data Flow Diagram

### Event Creation
```
User Input → NLPService.parseIntent() 
    ↓
EntityExtractionPhase (AI + Regex)
    ↓
EventService.createEvent()
    ├→ checkOverlappingEvents()
    └→ INSERT into PostgreSQL
    ↓
Response to user (with conflict warnings)
```

### Reminder Scheduling
```
User Input → NLPService.parseIntent()
    ↓
hebrewDateParser.parseHebrewDate()
    ↓
ReminderService.createReminder()
    ├→ INSERT into PostgreSQL
    └→ return Reminder object
    ↓
scheduleReminder() (ReminderQueue)
    ├→ Validate lead time (0-120 min)
    ├→ Calculate delay: (due - lead) - now
    └→ Queue job in Redis
    ↓
(At scheduled time) ReminderWorker processes job
    └→ Send WhatsApp message to user
```

---

## Key Concepts

### Storage
- **PostgreSQL**: Events, Reminders (persistent)
- **Redis + BullMQ**: Scheduled reminder jobs (transient)
- **Event Comments**: JSONB array in PostgreSQL (structure: {id, text, timestamp, priority, tags, reminderId?})

### Timezones
- All DB times: UTC (columns: `*_ts_utc`)
- User timezone: From `users.timezone` (e.g., "Asia/Jerusalem")
- NLP gets: `DateTime.now().setZone(userTimezone).toISO()`

### Hebrew Date Keywords
- **Days**: היום (today), מחר (tomorrow), אתמול (yesterday)
- **Weeks**: השבוע (this week), שבוע הבא (next week)
- **Time**: בבוקר (AM), אחרי הצהריים (PM), בערב (evening), בלילה (night)

### Reminder Lead Time
- Default: 0 minutes (at exact time)
- Range: 0-120 minutes
- If ≤5 min late: Send immediately
- If >5 min late: Skip

---

## Critical Code Lines

| Feature | File | Lines |
|---------|------|-------|
| Event Model | types/index.ts | 67-81 |
| Reminder Model | types/index.ts | 83-94 |
| Create Event | EventService.ts | 77-133 |
| Create Reminder | ReminderService.ts | 41-75 |
| Schedule Reminder | ReminderQueue.ts | 38-133 |
| Process Reminder | ReminderWorker.ts | 38-78 |
| Parse Intent | NLPService.ts | 77-82 |
| Parse Date | hebrewDateParser.ts | 15-18 |
| Extract Entities | EntityExtractionPhase.ts | 46-100 |
| Daily Scheduler | DailySchedulerService.ts | 72-100 |

---

## Reminder Statuses (Database)
- `pending` - Waiting to be sent
- `completed` - User marked done
- `cancelled` - User cancelled
- `failed` - Failed to send (legacy)

---

## NLP Intents (Supported)
- `create_event` / `create_reminder`
- `search_event` / `list_events` / `list_reminders`
- `delete_event` / `delete_reminder`
- `update_event` / `update_reminder`
- `add_comment` / `view_comments` / `delete_comment`
- `complete_task` / `send_message` / `add_contact`

---

## Important Notes

1. **Event Comments**: Stored as JSONB array, not plain text
2. **Timezone Handling**: Always work with user's timezone, store in UTC
3. **Lead Time**: Not persisted - only used during queue scheduling
4. **Participants**: Extract in Phase 9 (ParticipantPhase), NOT Phase 3!
5. **Conflicts**: Warned but not blocking - user can create overlapping events
6. **Time-only**: "16:10" without date = TODAY at 16:10
7. **Recurrence**: RRULE field exists but not fully implemented

---

## Testing & Debugging

### Check Events
```bash
SELECT * FROM events WHERE user_id = '<user_id>' ORDER BY start_ts_utc DESC;
```

### Check Reminders
```bash
SELECT * FROM reminders WHERE user_id = '<user_id>' ORDER BY due_ts_utc DESC;
```

### Check BullMQ Queue
```bash
redis-cli
> KEYS bull:reminders:*
> HGETALL bull:reminders:jobs
```

### Check Sessions
```bash
redis-cli
> KEYS session:*
> GET session:<user_id>
```

