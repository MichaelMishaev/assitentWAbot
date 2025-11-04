# WhatsApp Assistant Bot - Events & Reminders System Analysis

## Executive Summary

This WhatsApp bot has a comprehensive event and reminder management system built with:
- **PostgreSQL** for persistent storage
- **Redis + BullMQ** for scheduling and async job processing
- **Luxon** for timezone-aware date/time handling
- **OpenAI/Gemini APIs** for NLP intent extraction
- **Natural language parsing** for Hebrew date expressions

---

## 1. DATA MODELS

### 1.1 Event Model
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/types/index.ts` (lines 67-81)

```typescript
interface Event {
  id: string;                          // UUID primary key
  userId: string;                      // Reference to user
  title: string;                       // Event name
  startTsUtc: Date;                    // Start time (UTC)
  endTsUtc?: Date;                     // End time (optional)
  rrule?: string;                      // RFC 5545 recurrence rule
  location?: string;                   // Location string
  notes?: EventComment[];              // Array of comments (not simple text)
  source: string;                      // Source: 'user_input', 'google_calendar', etc.
  confidence?: number;                 // Confidence score (0-1)
  externalRefJsonb?: Record<string, any>; // For Google Calendar sync
  createdAt: Date;
  updatedAt: Date;
}

// Comment structure (nested in notes)
interface EventComment {
  id: string;                          // UUID
  text: string;                        // Comment text
  timestamp: string;                   // ISO 8601 format
  priority: 'normal' | 'high' | 'urgent';
  tags?: string[];                     // Tags for organizing comments
  reminderId?: string;                 // Link to reminder if created from comment
}
```

**Database Schema:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1733086800000_initial-schema.sql` (lines 40-59)

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    start_ts_utc TIMESTAMP NOT NULL,
    end_ts_utc TIMESTAMP,
    rrule VARCHAR(255),
    location VARCHAR(500),
    notes TEXT,                        -- NOW: JSONB array (see migration below)
    source VARCHAR(50) DEFAULT 'manual',
    confidence DECIMAL(3,2),
    external_ref_jsonb JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_start_ts ON events(start_ts_utc);
CREATE INDEX idx_events_user_start ON events(user_id, start_ts_utc);
```

**Migration to JSONB Comments:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1733176800000_add_event_comments_jsonb.sql`
- Converts notes from TEXT to JSONB array
- Maintains backward compatibility (migrates old text as first comment)
- Adds GIN index for fast comment searches

---

### 1.2 Reminder Model
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/ReminderService.ts` (lines 6-16)

```typescript
interface Reminder {
  id: string;                          // UUID primary key
  userId: string;                      // Reference to user
  title: string;                       // Reminder text
  dueTsUtc: Date;                      // Due time (UTC)
  rrule?: string;                      // RFC 5545 recurrence rule
  status: 'pending' | 'completed' | 'cancelled';
  eventId?: string;                    // Link to event (optional)
  externalRefJsonb?: Record<string, any>;
  notes: string | null;                // Added in migration 1760183452000
  createdAt: Date;
  updatedAt: Date;
}
```

**Database Schema:** (lines 62-79 of initial schema)

```sql
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    due_ts_utc TIMESTAMP NOT NULL,
    rrule VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    external_ref_jsonb JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notes field added later in migration 1760183452000
ALTER TABLE reminders ADD COLUMN notes TEXT DEFAULT NULL;

CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_due_ts ON reminders(due_ts_utc);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_user_due ON reminders(user_id, due_ts_utc);
```

---

## 2. EVENT CREATION & MANAGEMENT

### 2.1 EventService Class
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/EventService.ts`

#### Key Methods:

| Method | Purpose | Lines |
|--------|---------|-------|
| `createEvent()` | Create new event, check for conflicts | 77-133 |
| `getEventById()` | Retrieve single event | 138-162 |
| `getUpcomingEvents()` | Get future events (default 10) | 167-188 |
| `getEventsByDate()` | Get events for specific date | 193-214 |
| `getEventsForWeek()` | Get week view (Sunday-Saturday) | 219-242 |
| `updateEvent()` | Modify event fields | 247-325 |
| `deleteEvent()` | Remove event | 330-363 |
| `getAllEvents()` | Paginated retrieval | 368-389 |
| `searchEvents()` | Full-text search with Hebrew support | 395-432 |
| `checkOverlappingEvents()` | Detect scheduling conflicts | 438-465 |
| `getPastEvents()` | Historical events with stats | 740-875 |

#### Comment Management (Lines 487-735):
- `addComment()` - Add structured comment to event
- `getComments()` - Retrieve all comments for event
- `deleteComment()` - Remove comment by ID
- `deleteCommentByIndex()` - Remove by position (1-based)
- `deleteLastComment()` - Remove most recent comment
- `updateComment()` - Modify comment and link to reminders
- `findCommentByText()` - Search comments
- `getCommentCount()` - Count comments

#### Conflict Detection (Line 88-94):
```typescript
const overlapping = await this.checkOverlappingEvents(
  input.userId, 
  input.startTsUtc, 
  input.endTsUtc
);
if (overlapping.length > 0) {
  logger.warn('Creating event with time conflict', {
    newEvent: { title: input.title, startTsUtc: input.startTsUtc },
    overlapping: overlapping.map(e => ({ id: e.id, title: e.title }))
  });
}
```

---

### 2.2 ReminderService Class
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/ReminderService.ts`

#### Key Methods:

| Method | Purpose | Lines |
|--------|---------|-------|
| `createReminder()` | Create new reminder | 41-75 |
| `getReminderById()` | Get reminder by ID | 80-98 |
| `getActiveReminders()` | Get pending reminders | 103-118 |
| `getOverdueReminders()` | Get past-due reminders | 123-141 |
| `getRemindersForToday()` | Get today's reminders | 146-167 |
| `updateReminder()` | Modify reminder | 172-228 |
| `completeReminder()` | Mark as completed | 233-235 |
| `cancelReminder()` | Mark as cancelled | 240-242 |
| `deleteReminder()` | Remove reminder | 247-267 |
| `getAllReminders()` | Paginated retrieval | 272-291 |

#### Status Values:
- `pending` - Awaiting send time
- `completed` - User marked done
- `cancelled` - User cancelled
- `failed` - Failed to send (legacy status in database schema)

---

## 3. REMINDER SCHEDULING & EXECUTION

### 3.1 ReminderQueue with BullMQ
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/queues/ReminderQueue.ts`

#### Queue Configuration (Lines 14-30):
```typescript
const queueOptions: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,                       // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,                     // Start with 2s delay, exponential backoff
    },
    removeOnComplete: {
      age: 24 * 3600,                  // Keep successful jobs for 24 hours
      count: 1000,                     // Keep up to 1000 jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600,              // Keep failed jobs for 7 days
    },
  },
};

export const reminderQueue = new Queue<ReminderJob>('reminders', queueOptions);
```

#### ReminderJob Interface:
```typescript
interface ReminderJob {
  reminderId: string;
  userId: string;
  title: string;
  phone: string;
  leadTimeMinutes?: number;            // Minutes before due time to send
}
```

#### Schedule Reminder Function (Lines 38-133):
```typescript
async function scheduleReminder(
  job: ReminderJob,
  dueDate: Date,
  leadTimeMinutes?: number
): Promise<void>
```

**Key Features:**
1. **Lead Time Support** (Lines 48-59)
   - Validates and clamps to [0, 120] minutes
   - Converts to milliseconds for calculation

2. **Safety Checks:**
   - **Check #1** (Lines 68-101): Reminder in past
     - If >5 min past: Skip
     - If ≤5 min past: Send immediately
   - **Check #2** (Lines 103-112): Lead time adjustment
     - Warns if lead time > time until due date

3. **Job Scheduling** (Lines 114-122):
   ```typescript
   await reminderQueue.add(
     'send-reminder',
     { ...job, leadTimeMinutes: validatedLeadTime },
     {
       delay: Math.max(0, delay),  // Ensure non-negative
       jobId: `reminder-${reminderId}`,
     }
   );
   ```

#### Cancel Reminder Function (Lines 135-143):
```typescript
async function cancelReminder(reminderId: string): Promise<void> {
  const jobId = `reminder-${reminderId}`;
  const job = await reminderQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info('Reminder cancelled', { reminderId });
  }
}
```

---

### 3.2 ReminderWorker - Job Processor
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/queues/ReminderWorker.ts`

#### Worker Configuration (Lines 10-18):
```typescript
this.worker = new Worker<ReminderJob>(
  'reminders',
  this.processReminder.bind(this),
  {
    connection: redis,
    concurrency: 5,                    // Process 5 reminders in parallel
  }
);
```

#### Process Reminder Function (Lines 38-78):
```typescript
private async processReminder(job: Job<ReminderJob>): Promise<void> {
  const { reminderId, userId, title, phone, leadTimeMinutes } = job.data;

  // Build Hebrew message
  let message = `⏰ תזכורת\n\n${title}`;

  // Add lead time info (Hebrew)
  if (leadTimeMinutes && leadTimeMinutes > 0) {
    if (leadTimeMinutes === 1) {
      message += `\n\n⏳ בעוד דקה אחת`;
    } else if (leadTimeMinutes < 60) {
      message += `\n\n⏳ בעוד ${leadTimeMinutes} דקות`;
    } else if (leadTimeMinutes === 60) {
      message += `\n\n⏳ בעוד שעה`;
    } else {
      const hours = Math.floor(leadTimeMinutes / 60);
      const minutes = leadTimeMinutes % 60;
      message += `\n\n⏳ בעוד ${hours} שעות ו-${minutes} דקות`;
    }
  }

  await this.messageProvider.sendMessage(phone, message);
}
```

#### Event Handlers (Lines 20-33):
- `completed` - Log successful reminder sent
- `failed` - Log and attempt retries

---

## 4. NATURAL LANGUAGE PROCESSING

### 4.1 NLP Intent Extraction
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/NLPService.ts`

#### NLPIntent Interface:
```typescript
interface NLPIntent {
  intent: 'create_event' | 'create_reminder' | 'search_event' | 'list_events' 
        | 'list_reminders' | 'delete_event' | 'delete_reminder' | 'update_event' 
        | 'update_reminder' | 'complete_task' | 'send_message' | 'add_contact' 
        | 'add_comment' | 'view_comments' | 'delete_comment' | 'update_comment' 
        | 'generate_dashboard' | 'unknown';
  confidence: number;
  urgency?: 'urgent' | 'important' | 'normal';
  
  // Event data
  event?: {
    title: string;
    date?: string;                     // ISO 8601
    dateText?: string;                 // Hebrew keywords
    endDate?: string;
    location?: string;
    contactName?: string;
    notes?: string;
    deleteAll?: boolean;
  };

  // Reminder data
  reminder?: {
    title: string;
    dueDate?: string;                  // ISO 8601
    dateText?: string;                 // Hebrew keywords
    time?: string;                     // HH:MM
    recurrence?: string;               // RRULE format
  };

  // Comment data
  comment?: {
    eventTitle: string;
    text?: string;
    priority?: 'normal' | 'high' | 'urgent';
    reminderTime?: string;
    reminderOffset?: number;           // Minutes before event
    commentIndex?: number;
    deleteBy?: 'index' | 'last' | 'text';
    deleteValue?: string | number;
  };
}
```

#### parseIntent Method (Lines 77-82):
```typescript
async parseIntent(
  userMessage: string,
  userContacts: Contact[],
  userTimezone: string = 'Asia/Jerusalem',
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
): Promise<NLPIntent>
```

**Uses OpenAI API** with system prompt that includes:
- User's timezone (in user's local time, not UTC!)
- User's contacts list
- Conversation history for context

---

### 4.2 Hebrew Date Parser
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/utils/hebrewDateParser.ts`

#### parseHebrewDate Function:
```typescript
function parseHebrewDate(
  input: string,
  timezone: string = 'Asia/Jerusalem'
): ParseResult {
  success: boolean;
  date: Date | null;
  error?: string;
}
```

#### Supported Hebrew Keywords (Lines 25-54):

**Single Days:**
- `היום` - Today
- `מחר` - Tomorrow  
- `מחרתיים` - Day after tomorrow
- `אתמול` - Yesterday
- `סופש` - Saturday (next available Saturday)

**Week Keywords (Multiple variations):**
- `השבוע` / `השבוע הזה` / `בשבוע` / `לשבוע` - This week (Monday)
- `שבוע הבא` / `בשבוע הבא` / `שבוע הקרוב` - Next week (next Monday)

**Month Keywords:**
- `החודש` / `בחודש` - This month
- `חודש הבא` / `בחודש הבא` - Next month

#### Time Expression Patterns (Lines 56-128):

**Natural Language Times** (Lines 60-128):
- `8 בבוקר` - 8 AM (default 8:00 if no number)
- `3 אחרי הצהריים` / `אחה"צ` - 3 PM (default 15:00)
- `בערב` - Evening (default 19:00)
- `בלילה` - Night (default 22:00)
- `בצהריים` - Noon (default 12:00)

**Standard Time Format** (Lines 130-139):
- `14:00` - 24-hour format
- `בשעה 14:00` - With Hebrew prefix
- `ב-14:00` - Short prefix
- `, בשעה 14:00` - Separated by comma

#### Key Behavior:
- **Time-only ambiguity** (Lines 141-150):
  - Input: `16:10` (no date keyword)
  - Behavior: Interprets as TODAY at 16:10
  - Prevents confusion with dates

---

### 4.3 Entity Extraction Phase
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/domain/phases/phase3-entity-extraction/EntityExtractionPhase.ts`

#### Multi-Stage Extraction (Lines 46-100):
1. **Primary: AI Extraction** (Line 59)
   - Uses GPT-4 Mini or Claude Haiku
   - Extracts entities with AI understanding

2. **Fallback: Regex Extraction** (Line 62)
   - Regex-based parser as safety net
   - Fills gaps AI might miss

3. **Merge: Combine Results** (Line 65)
   - AI takes priority
   - Regex fills missing fields

#### Extracted Entity Types:
- `title` - Event/reminder name
- `date` - Parsed datetime
- `time` - Time component
- `dateText` - Original Hebrew text
- `location` - Location string
- `contactNames` - Participant names (→ stored for legacy compatibility)
- `duration` - Event duration in minutes
- `priority` - Comment priority level

#### Critical Note on Participant Extraction (Lines 84-91):
```typescript
// ✅ CRITICAL FIX: Do NOT extract participants here!
// Phase 3 (AI) was extracting truncated names like "סי" instead of "יוסי"
// Phase 9 (ParticipantPhase) has reliable Hebrew regex patterns
// Only store contactName for backward compatibility, NOT participants
if (extracted.contactNames && extracted.contactNames.length > 0) {
  context.entities.contactName = extracted.contactNames[0];
  // DO NOT SET participants here - Phase 9 will handle it correctly
}
```

---

## 5. REDIS STORAGE & CACHING

### 5.1 Redis Configuration
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/config/redis.ts`

```typescript
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  maxRetriesPerRequest: null,          // Required for BullMQ blocking
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};
```

### 5.2 BullMQ Queues
1. **Reminders Queue** - Reminder sending jobs
2. **Morning Summary Queue** - Daily morning summary jobs
3. **Daily Scheduler Queue** - Orchestrates daily tasks

---

## 6. SCHEDULED JOBS & CRON

### 6.1 DailySchedulerService
**Location:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/DailySchedulerService.ts`

#### Repeating Job Setup (Lines 72-100):
```typescript
async setupRepeatingJob(): Promise<void> {
  // Remove existing repeatable jobs
  const repeatableJobs = await this.queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await this.queue.removeRepeatableByKey(job.key);
  }

  // Add new repeatable job - every day at 9 AM UTC
  await this.queue.add(
    'daily-schedule',
    { date: new Date().toISOString() },
    {
      repeat: {
        pattern: '0 9 * * *',          // Cron: 9 AM UTC daily
      },
      jobId: 'daily-scheduler-repeatable',
    }
  );
}
```

#### Daily Process (Lines 106-195):
1. Get all users with morning notifications enabled
2. For each user:
   - Check if should send today (based on preferences)
   - Calculate user's preferred time in their timezone
   - If time passed, schedule for tomorrow
   - Schedule morning summary job

#### Key Variables:
- User's `timezone` (e.g., "Asia/Jerusalem")
- User's `prefsJsonb.morningNotification`:
  - `enabled: boolean`
  - `time: string` (HH:mm format)
  - `days: number[]` (0=Sunday, 1=Monday, etc.)
  - `includeMemos: boolean`

---

## 7. STORAGE LOCATIONS SUMMARY

| Component | Storage | Location |
|-----------|---------|----------|
| Events | PostgreSQL | `events` table |
| Reminders | PostgreSQL | `reminders` table |
| Event Comments | PostgreSQL (JSONB) | `events.notes` column |
| Pending Reminders | BullMQ Queue | Redis (key: `bull:reminders:*`) |
| User Sessions | Redis | Key: `session:${userId}` |
| Message Deduplication | Redis | Key: `dedup:${messageId}` (TTL: 12h) |
| Crash Tracking | Redis | Key: `bot:crash:count` (TTL: 5 min) |
| Instance Lock | Redis | Key: `bot:instance:lock` (TTL: 60s) |

---

## 8. KEY ARCHITECTURAL PATTERNS

### 8.1 Message Flow for Event Creation

```
User Message
    ↓
[NLPRouter] - Routes to appropriate handler
    ↓
[NLPService] - Extracts intent (create_event)
    ↓
[Pipeline Orchestrator]
    ├→ Phase 1: Intent Classification
    ├→ Phase 2: Multi-event Detection
    ├→ Phase 3: Entity Extraction (dates, titles, locations)
    ├→ Phase 4: Hebrew Calendar Conversion
    ├→ Phase 5: User Profiles
    ├→ Phase 6: Update/Delete Logic
    ├→ Phase 7: Recurrence (RRULE)
    ├→ Phase 8: Comments
    ├→ Phase 9: Participants
    └→ Phase 10: Validation & Enrichment
    ↓
[EventService.createEvent()]
    ├→ Check overlapping events
    ├→ Insert into PostgreSQL
    └→ Return event with conflict info
    ↓
[MessageRouter] - Send confirmation to user
```

### 8.2 Reminder Scheduling Flow

```
User Command: "תזכורת ביום רביעי בשעה 14:00"
    ↓
[NLPService] - Extract: intent=create_reminder, dueDate="Wednesday 14:00"
    ↓
[hebrewDateParser] - Parse Hebrew date → ISO 8601 Date
    ↓
[ReminderService.createReminder()]
    ├→ Insert into reminders table
    └→ Return reminder object
    ↓
[scheduleReminder()] - BullMQ scheduling
    ├→ Validate lead time
    ├→ Calculate delay: (due - lead) - now
    └→ Queue job with delay
    ↓
[Redis/BullMQ] - Wait for scheduled time
    ↓
[ReminderWorker.processReminder()]
    ├→ Build Hebrew message with lead time
    └→ Send via WhatsAppWebJSProvider
    ↓
User receives: "⏰ תזכורת\n\nביום רביעי בשעה 14:00\n\n⏳ בעוד דקה אחת"
```

---

## 9. TIMEZONE HANDLING

### Critical Timezone Considerations:

1. **Database Storage**: All times stored as UTC (`*_ts_utc` columns)
2. **User Timezone**: From `users.timezone` (e.g., "Asia/Jerusalem")
3. **NLP Processing**: Current time passed as `DateTime.now().setZone(userTimezone).toISO()`
4. **Event Queries**: Convert user's timezone to UTC for database queries

### Example from EventService.getEventsByDate():
```typescript
async getEventsByDate(userId: string, date: Date): Promise<Event[]> {
  // Convert user's date to UTC boundaries
  const dt = DateTime.fromJSDate(date).setZone('Asia/Jerusalem');
  const startOfDay = dt.startOf('day').toUTC().toJSDate();
  const endOfDay = dt.endOf('day').toUTC().toJSDate();

  // Query events in UTC range
  const query = `
    SELECT * FROM events
    WHERE user_id = $1
      AND start_ts_utc >= $2
      AND start_ts_utc < $3
  `;
}
```

---

## 10. KEY FILES REFERENCE

| File | Purpose | Key Functions |
|------|---------|----------------|
| `EventService.ts` | Event CRUD & queries | createEvent, updateEvent, searchEvents, getPastEvents |
| `ReminderService.ts` | Reminder CRUD | createReminder, getActiveReminders, updateReminder |
| `ReminderQueue.ts` | Schedule reminders | scheduleReminder, cancelReminder |
| `ReminderWorker.ts` | Process reminder jobs | processReminder (send messages) |
| `NLPService.ts` | Intent extraction | parseIntent (OpenAI API) |
| `hebrewDateParser.ts` | Date parsing | parseHebrewDate (keywords, times) |
| `EntityExtractionPhase.ts` | Extract entities | execute (AI + regex) |
| `DailySchedulerService.ts` | Daily cron jobs | setupRepeatingJob, processDailySchedule |
| `NLPRouter.ts` | Route messages | Calls appropriate handler based on intent |

---

## 11. MIGRATION HISTORY

| Migration | Date | Changes |
|-----------|------|---------|
| `1733086800000_initial-schema.sql` | 2024-12 | Create tables: users, events, reminders, contacts, sessions |
| `1733176800000_add_event_comments_jsonb.sql` | 2024-12 | Convert event notes from TEXT to JSONB array, add GIN index |
| `1733353200000_add_message_logs.sql` | 2024-12 | Message logging table |
| `1733440000000_add_tasks_table.sql` | 2024-12 | Tasks feature |
| `1760183452000_add_reminder_notes.sql` | 2025-01 | Add notes column to reminders |
| `1739100000000_add-user-profiles.sql` | 2025-01 | User profile enhancements |
| `1739200000000_add-event-participants.sql` | 2025-01 | Event participant tracking |

---

## 12. CURRENT GAPS & FUTURE IMPROVEMENTS

### 1. **Reminder Recurrence**
- RRULE field exists but not fully implemented
- No expansion of recurring reminders into individual jobs

### 2. **Event Sync**
- Google Calendar integration partially implemented
- Bidirectional sync not complete

### 3. **Lead Time Persistence**
- Lead time not saved in database
- Only passed during queue scheduling
- If bot restarts, lead time is lost

### 4. **Conflict Resolution**
- Conflicts detected but not blocking
- User can create overlapping events
- Only warns via logging

### 5. **Time Expression Ambiguity**
- Time-only inputs (e.g., "16:10") interpreted as TODAY
- No explicit "future date" disambiguation

---

## 13. DEPENDENCIES

### Key NPM Packages:
```json
{
  "bullmq": "^5.0.0",                 // Job scheduling
  "ioredis": "^5.3.0",                // Redis client
  "pg": "^8.11.0",                    // PostgreSQL driver
  "luxon": "^3.4.0",                  // DateTime with timezones
  "openai": "^4.32.0",                // OpenAI API
  "@google/generative-ai": "^0.24.1", // Gemini API
  "whatsapp-web.js": "^1.25.0",       // WhatsApp connection
  "uuid": "^9.0.0"                    // UUID generation
}
```

