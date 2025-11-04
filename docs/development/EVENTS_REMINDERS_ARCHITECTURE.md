# Event & Reminder System - Architecture Summary

## System Overview

This WhatsApp bot manages events and reminders with a multi-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    User Input (WhatsApp)                    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              NLPService.parseIntent()                        │
│   (OpenAI API extracts intent + entities)                   │
├─────────────────────────────────────────────────────────────┤
│ Input: "תזכורת למחר בשעה 14:00"                             │
│ Output: {                                                    │
│   intent: "create_reminder",                                │
│   reminder: {                                               │
│     title: "תזכורת",                                        │
│     dateText: "מחר",                                        │
│     date: "2024-12-31T14:00:00Z"                           │
│   }                                                          │
│ }                                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│           Pipeline Orchestrator (10 Phases)                 │
│                                                              │
│  Phase 1: Intent Classification                             │
│  Phase 2: Multi-event Detection                             │
│  Phase 3: Entity Extraction (AI + Regex)                    │
│  Phase 4: Hebrew Calendar Conversion                        │
│  Phase 5: User Profiles                                     │
│  Phase 6: Update/Delete Logic                               │
│  Phase 7: Recurrence (RRULE expansion)                      │
│  Phase 8: Comments Enrichment                               │
│  Phase 9: Participants Extraction (Hebrew regex)            │
│  Phase 10: Validation & Enrichment                          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Service Layer                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EventService          ReminderService                      │
│  ├─ createEvent()      ├─ createReminder()                  │
│  ├─ getEventById()     ├─ getReminderById()                 │
│  ├─ updateEvent()      ├─ updateReminder()                  │
│  ├─ deleteEvent()      ├─ deleteReminder()                  │
│  ├─ searchEvents()     ├─ getActiveReminders()              │
│  └─ addComment()       └─ completeReminder()                │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Data Persistence Layer                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  PostgreSQL                    Redis + BullMQ               │
│  ├─ events table               ├─ Reminder jobs             │
│  ├─ reminders table            ├─ Morning summaries         │
│  ├─ event_comments (JSONB)     └─ Daily scheduler           │
│  └─ other metadata                                          │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│            Async Job Processing                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ReminderWorker        DailySchedulerService                │
│  ├─ Wait for time      ├─ Run daily at 9 AM UTC            │
│  ├─ Process job        ├─ For each user:                    │
│  ├─ Build message      │  ├─ Check preferences             │
│  └─ Send via WhatsApp  │  └─ Schedule morning summary       │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Output (WhatsApp Message)                      │
│                                                              │
│  "⏰ תזכורת                                                  │
│   ביום רביעי בשעה 14:00                                     │
│                                                              │
│   ⏳ בעוד 5 דקות"                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Deep Dive

### 1. Natural Language Processing

**Entry Point:** `NLPService.parseIntent()`

Location: `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/NLPService.ts` (Line 77)

```typescript
async parseIntent(
  userMessage: string,
  userContacts: Contact[],
  userTimezone: string = 'Asia/Jerusalem',
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
): Promise<NLPIntent>
```

**Process:**
1. Takes user message in Hebrew or English
2. Includes user's contacts and timezone context
3. Calls OpenAI API with system prompt
4. Extracts intent (create_event, create_reminder, etc.)
5. Extracts entities (dates, titles, locations, etc.)
6. Returns structured NLPIntent object

**Key Feature:** Timezone-aware processing
- NLP gets current time: `DateTime.now().setZone(userTimezone).toISO()`
- Prevents "11:00 UTC = now" confusion when user is in a different timezone

---

### 2. Date & Time Parsing

**Entry Point:** `parseHebrewDate()`

Location: `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/utils/hebrewDateParser.ts` (Line 15)

```typescript
function parseHebrewDate(
  input: string,
  timezone: string = 'Asia/Jerusalem'
): ParseResult
```

**Supported Formats:**

| Category | Examples | Default Time |
|----------|----------|---------------|
| Days | היום, מחר, מחרתיים, אתמול | Start of day |
| Weeks | השבוע, שבוע הבא | Monday of week |
| Months | החודש, חודש הבא | 1st of month |
| Time (natural) | בבוקר (8:00), אחרי הצהריים (15:00), בערב (19:00) | Varies |
| Time (standard) | 14:00, בשעה 14:00, ב-14:00 | As specified |

**Example Parsing:**
- Input: `"מחר בשעה 14:00"`
- Output: `{ success: true, date: Date(tomorrow at 14:00 UTC) }`

---

### 3. Event Management

**Service:** `EventService`

Location: `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/EventService.ts`

**Event Lifecycle:**

```
CREATE
  ├─ Validate fields
  ├─ Check overlapping events (warning only)
  ├─ Insert into PostgreSQL
  └─ Return with conflict metadata

READ
  ├─ By ID
  ├─ By date (single day)
  ├─ By week
  ├─ Upcoming (10 default)
  └─ Search (full-text with Hebrew support)

UPDATE
  ├─ Modify title, date, location
  ├─ Add/update comments
  └─ Update JSONB notes array

DELETE
  ├─ Remove event
  └─ Cascade delete comments
```

**Comment Management:**
- Comments stored as JSONB array in `events.notes`
- Structure: `{ id, text, timestamp, priority, tags, reminderId? }`
- Full CRUD operations available
- Link to reminders via `reminderId` field

---

### 4. Reminder Management & Scheduling

**Service:** `ReminderService`

Location: `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/ReminderService.ts`

**Reminder Lifecycle:**

```
CREATE (ReminderService)
  ├─ Validate required fields
  ├─ Insert into PostgreSQL with status='pending'
  └─ Return reminder object

SCHEDULE (ReminderQueue)
  ├─ Validate lead time (0-120 min)
  ├─ Calculate: delay = (dueTime - leadTime) - now
  ├─ Safety checks (past date, adjusted lead time)
  └─ Queue job in Redis/BullMQ

EXECUTE (ReminderWorker)
  ├─ Wait for scheduled time
  ├─ Build Hebrew message with lead time info
  └─ Send via WhatsAppWebJSProvider

COMPLETION
  ├─ Update status to 'completed' or 'cancelled'
  └─ Remove from queue
```

**Lead Time Logic:**
- Default: 0 (send at exact time)
- Range: 0-120 minutes
- Calculation: `targetSendTime = dueTime - (leadTimeMinutes * 60000)`
- Safety: If target is >5 min in past, skip. If ≤5 min past, send immediately.

---

### 5. Async Job Processing

**Queue System:** BullMQ + Redis

**Queues:**

1. **Reminders Queue** (`bull:reminders:*`)
   - Job: Send reminder to user
   - Processing: 5 concurrent workers
   - Retry: 3 attempts with exponential backoff
   - Cleanup: Keep successful for 24h, failed for 7d

2. **Morning Summary Queue** (`bull:morning-summaries:*`)
   - Job: Send daily event summary
   - Processing: 1 worker (sequential)
   - Scheduled: Per user's preferences

3. **Daily Scheduler Queue** (`bull:daily-scheduler:*`)
   - Job: Run daily scheduler
   - Processing: 1 worker (sequential)
   - Cron: `0 9 * * *` (9 AM UTC daily)
   - Task: Schedule morning summaries for all users

---

### 6. Database Schema

**Events Table**
```sql
CREATE TABLE events (
    id UUID PRIMARY KEY,
    user_id UUID,
    title VARCHAR(500),
    start_ts_utc TIMESTAMP,      -- UTC storage
    end_ts_utc TIMESTAMP,
    rrule VARCHAR(255),           -- RFC 5545 format
    location VARCHAR(500),
    notes JSONB,                  -- Array of comments
    source VARCHAR(50),           -- 'user_input', 'google_calendar'
    confidence DECIMAL(3,2),      -- 0-1 score
    external_ref_jsonb JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Reminders Table**
```sql
CREATE TABLE reminders (
    id UUID PRIMARY KEY,
    user_id UUID,
    title VARCHAR(500),
    due_ts_utc TIMESTAMP,         -- UTC storage
    rrule VARCHAR(255),           -- RFC 5545 format
    status VARCHAR(20),           -- pending, completed, cancelled
    event_id UUID,                -- Reference to event
    notes TEXT,
    external_ref_jsonb JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Indexes for Performance:**
- Events: `(user_id, start_ts_utc)` for quick date range queries
- Reminders: `(user_id, due_ts_utc, status)` for active reminders
- Comments: GIN index on JSONB for fast searches

---

## Key Design Decisions

### 1. Timezone Handling
- **Storage:** Always UTC (prevents DST issues)
- **Processing:** Convert to user's timezone for queries
- **Input:** User provides time in their timezone (via NLP context)
- **Output:** Display in user's timezone

### 2. Event Comments as JSONB
- **Why:** Structured data with metadata (priority, tags, reminderId)
- **Index:** GIN index for fast searching
- **Backward Compat:** Old text notes migrated as first comment
- **Benefit:** Link comments to reminders

### 3. Reminder Lead Time
- **Storage:** Only in queue job data, not persisted
- **Flexibility:** Can change per reminder without DB changes
- **Limitation:** Lost if bot restarts before delivery
- **Future:** Could persist in `reminders` table

### 4. Conflict Detection (Non-Blocking)
- **Current:** Detect and warn, but allow creation
- **Reason:** User might want overlapping events intentionally
- **Future:** Could add user preference to block

### 5. Participant Extraction in Phase 9
- **Why:** Phase 3 (AI) extracts truncated Hebrew names
- **Solution:** Phase 9 uses regex patterns specific to Hebrew
- **Result:** More reliable extraction than AI alone

---

## Performance Characteristics

### Queries
- **Get upcoming events:** ~10ms (indexed on user_id, start_ts_utc)
- **Search events:** ~50ms (indexed ILIKE with tokenization)
- **Get active reminders:** ~10ms (indexed on user_id, status)
- **Comment operations:** ~5ms (JSONB array operations)

### Scaling
- **Users:** Sharded by user_id for event/reminder queries
- **Reminders:** BullMQ handles thousands of concurrent jobs
- **Comments:** JSONB array (efficient up to ~1000 comments per event)
- **Storage:** PostgreSQL with connection pooling (max 20)

---

## Error Handling & Safety

### Validation
1. **Required fields:** title, start_ts_utc (events), due_ts_utc (reminders)
2. **Date validation:** Must be in future (or today for reminders)
3. **UUID validation:** All IDs must be valid format
4. **Authorization:** All queries include user_id check

### Retry Strategy
- **Failed reminders:** 3 retries with exponential backoff (2s → 4s → 8s)
- **Failed summaries:** 3 retries
- **Failed daily jobs:** Scheduled again next day

### Safety Checks (Reminder Scheduling)
1. If reminder target >5 min in past: Skip
2. If reminder target ≤5 min in past: Send immediately
3. If lead time > time until due: Warn and adjust

---

## Current Limitations

1. **Recurrence:** RRULE field exists but not expanded to individual jobs
2. **Persistence:** Lead time not saved to DB (lost on restart)
3. **Blocking:** Conflicts detected but not blocking
4. **Time-only:** "16:10" without date interpreted as TODAY
5. **Comments:** No nested comments (flat array only)
6. **Deletion:** Cascade delete when event deleted, orphan reminders without parent

---

## Future Improvements

1. **Persistent Lead Time:** Save to reminders table
2. **Recurrence Expansion:** Expand RRULE into individual jobs/occurrences
3. **Conflict Blocking:** User preference to block overlapping events
4. **Smart Reminders:** Learn user's typical reminder times
5. **Sync:** Full bidirectional Google Calendar sync
6. **Participants:** Send event invites to contacts
7. **Agenda View:** Show week/month overview with heat map

