# Events & Reminders System Documentation

Welcome! This directory contains comprehensive documentation about how events and reminders are managed in the WhatsApp bot.

## Quick Navigation

### For Quick Lookups
Start here if you need quick answers:
- **[EVENTS_REMINDERS_QUICK_REFERENCE.md](./EVENTS_REMINDERS_QUICK_REFERENCE.md)** - File locations, critical line numbers, key concepts, SQL queries for debugging

### For Deep Understanding
Read these for comprehensive understanding:
- **[EVENTS_REMINDERS_SYSTEM.md](./EVENTS_REMINDERS_SYSTEM.md)** - Complete technical reference (13 sections, covers every aspect)
- **[EVENTS_REMINDERS_ARCHITECTURE.md](./EVENTS_REMINDERS_ARCHITECTURE.md)** - System design, flow diagrams, design decisions, limitations

---

## At a Glance

### What Is This System?

A multi-layer event and reminder management system for WhatsApp that:
1. **Accepts** natural language input (Hebrew & English)
2. **Parses** dates, times, and intents using NLP + regex
3. **Stores** events and reminders in PostgreSQL
4. **Schedules** reminders using Redis + BullMQ
5. **Executes** scheduled tasks asynchronously
6. **Sends** reminders back to WhatsApp with lead time info

### Key Technologies
- **PostgreSQL** - Event and reminder storage
- **Redis + BullMQ** - Job scheduling and async processing
- **OpenAI/Gemini** - Natural language understanding
- **Luxon** - Timezone-aware date handling
- **Node.js + TypeScript** - Application runtime

---

## Core Components at a Glance

### Services (Persistent Storage)
| Service | Purpose | Key File |
|---------|---------|----------|
| EventService | Create, read, update, delete events | `src/services/EventService.ts` |
| ReminderService | Create, read, update, delete reminders | `src/services/ReminderService.ts` |
| NLPService | Parse user intent and extract entities | `src/services/NLPService.ts` |

### Queues (Async Jobs)
| Queue | Purpose | Key File |
|-------|---------|----------|
| ReminderQueue | Schedule reminder jobs in Redis | `src/queues/ReminderQueue.ts` |
| ReminderWorker | Process and send reminders | `src/queues/ReminderWorker.ts` |
| DailySchedulerService | Run daily scheduler at 9 AM UTC | `src/services/DailySchedulerService.ts` |

### Parsing
| Module | Purpose | Key File |
|--------|---------|----------|
| hebrewDateParser | Parse Hebrew date keywords | `src/utils/hebrewDateParser.ts` |
| EntityExtractionPhase | Extract structured entities (AI + regex) | `src/domain/phases/phase3-entity-extraction/EntityExtractionPhase.ts` |
| NLPRouter | Route messages to appropriate handler | `src/routing/NLPRouter.ts` |

---

## Data Models

### Event
```typescript
{
  id: UUID,
  userId: UUID,
  title: string,
  startTsUtc: Date,              // UTC
  endTsUtc?: Date,
  rrule?: string,                // RFC 5545
  location?: string,
  notes: EventComment[],         // JSONB array
  source: string,                // 'user_input', 'google_calendar'
  confidence?: number,           // 0-1
  createdAt: Date,
  updatedAt: Date
}
```

### Reminder
```typescript
{
  id: UUID,
  userId: UUID,
  title: string,
  dueTsUtc: Date,                // UTC
  rrule?: string,                // RFC 5545
  status: 'pending' | 'completed' | 'cancelled',
  eventId?: UUID,                // Link to event
  notes?: string,
  createdAt: Date,
  updatedAt: Date
}
```

### EventComment
```typescript
{
  id: UUID,
  text: string,
  timestamp: string,             // ISO 8601
  priority: 'normal' | 'high' | 'urgent',
  tags?: string[],
  reminderId?: UUID              // Link to reminder
}
```

---

## Data Flow Examples

### Creating an Event
```
"שמחה ביום חמישי בשעה 18:00 בביתי"
            ↓
[NLPService.parseIntent()]
            ↓
{ intent: 'create_event', event: { title: 'שמחה', dateText: 'חמישי', ... } }
            ↓
[Pipeline Orchestrator - 10 Phases]
            ↓
[EventService.createEvent()]
            ↓
PostgreSQL: INSERT INTO events (...)
            ↓
"✅ אירוע שמחה נוסף ביום חמישי בשעה 18:00"
```

### Creating a Reminder
```
"תזכור לי מחר בשעה 09:00 לקנות חלב"
            ↓
[NLPService.parseIntent()]
            ↓
{ intent: 'create_reminder', reminder: { title: '...', dateText: 'מחר', ... } }
            ↓
[Pipeline Orchestrator - 10 Phases]
            ↓
[ReminderService.createReminder()]
            ↓
PostgreSQL: INSERT INTO reminders (status='pending', ...)
            ↓
[scheduleReminder() with leadTime=0]
            ↓
Redis/BullMQ: Schedule job with delay=(tomorrow 09:00 - now)
            ↓
(At 09:00 tomorrow)
            ↓
[ReminderWorker.processReminder()]
            ↓
WhatsApp: "⏰ תזכורת\n\nלקנות חלב"
```

---

## Storage Locations

### Persistent (PostgreSQL)
| Data | Table | Location |
|------|-------|----------|
| Events | `events` | `src/migrations/1733086800000_initial-schema.sql` |
| Reminders | `reminders` | `src/migrations/1733086800000_initial-schema.sql` |
| Event Comments | `events.notes` (JSONB) | `src/migrations/1733176800000_add_event_comments_jsonb.sql` |
| Reminder Notes | `reminders.notes` (TEXT) | `src/migrations/1760183452000_add_reminder_notes.sql` |

### Transient (Redis)
| Data | Key Pattern | TTL |
|------|-------------|-----|
| Reminder Jobs | `bull:reminders:*` | Until processed |
| Morning Summary Jobs | `bull:morning-summaries:*` | Until processed |
| Daily Scheduler | `bull:daily-scheduler:*` | Repeating daily |

---

## Key Features

### 1. Hebrew Date Parsing
Supports natural language date expressions:
- **Days**: היום (today), מחר (tomorrow), אתמול (yesterday)
- **Weeks**: השבוע (this week), שבוע הבא (next week)
- **Time**: בבוקר (AM), אחרי הצהריים (PM), בערב (evening), בלילה (night)
- **Standard**: 14:00, בשעה 14:00, ב-14:00

### 2. Event Comments
- Structured comments with metadata (priority, tags)
- Link comments to reminders
- Full CRUD operations
- Search by text

### 3. Reminder Lead Time
- Configurable per reminder (0-120 minutes)
- Safety checks for past dates
- Hebrew message with time remaining

### 4. Timezone Awareness
- Database stores all times as UTC
- User timezone from preferences
- NLP context includes current time in user's timezone
- Queries convert user's timezone to UTC range

### 5. Conflict Detection
- Detects overlapping events
- Warns but doesn't block
- Logged for user awareness

---

## Common Queries

### Get User's Upcoming Events
```sql
SELECT * FROM events 
WHERE user_id = '<user_id>' 
  AND start_ts_utc >= NOW()
ORDER BY start_ts_utc ASC
LIMIT 10;
```

### Get User's Active Reminders
```sql
SELECT * FROM reminders 
WHERE user_id = '<user_id>' 
  AND status = 'pending'
ORDER BY due_ts_utc ASC;
```

### Search Events by Title
```sql
SELECT * FROM events 
WHERE user_id = '<user_id>' 
  AND (title ILIKE '%מחר%' OR location ILIKE '%מחר%')
ORDER BY start_ts_utc ASC;
```

### Get Event with Comments
```sql
SELECT id, title, start_ts_utc, 
       jsonb_array_length(notes) as comment_count,
       notes
FROM events 
WHERE id = '<event_id>' 
  AND user_id = '<user_id>';
```

---

## Testing & Debugging

### Enable Logging
Check `src/utils/logger.ts` for log levels. Logs show:
- NLP intent extraction
- Date parsing results
- Event creation/updates
- Reminder scheduling
- Job processing

### Monitor Redis Queues
```bash
redis-cli
> KEYS "bull:*"
> HGETALL "bull:reminders:*"
```

### Test NLP Intent
See `src/test-nlp.ts` for examples:
```bash
npm run test:nlp
```

### Test Date Parser
See `tests/` directory for unit tests:
```bash
npm test -- hebrewDateParser
```

---

## Common Issues & Solutions

### Issue: Reminders Not Sending
**Check:**
1. Is Redis running? (`redis-cli PING`)
2. Is ReminderWorker running? (Check logs)
3. Is due time in past? (Use safety checks)
4. Is job in queue? (`redis-cli HGETALL bull:reminders:jobs`)

### Issue: Wrong Event Time
**Check:**
1. User's timezone correct? (`SELECT timezone FROM users WHERE id = '...'`)
2. Date parsing correct? (Run test)
3. UTC conversion correct? (Check database vs expected)

### Issue: NLP Not Extracting Intent
**Check:**
1. OpenAI API key set? (`echo $OPENAI_API_KEY`)
2. API quota exceeded? (Check OpenAI dashboard)
3. Message clear enough? (Test with similar phrasing)

---

## Modifications & Customization

### Adding New Reminder Status
1. Update `ReminderService.ts` interfaces
2. Update database constraint (if using enum)
3. Update `ReminderWorker` handling

### Adding New Date Keyword
1. Edit `hebrewDateParser.ts` keywords map (line 25)
2. Add mapping to DateTime calculation
3. Test with `npm test -- hebrewDateParser`

### Changing Lead Time Range
1. Edit `ReminderQueue.ts` validation (line 52): change `Math.min(120, ...)`
2. Update type comment
3. Update user settings UI

### Adding Event Sync
1. Create `CalendarSyncService`
2. Add to `EventService.createEvent()` after DB insert
3. Schedule periodic sync via DailySchedulerService

---

## Performance Tips

### Database
- Use indexed queries: `(user_id, start_ts_utc)`
- Limit comment array size: Keep <1000 per event
- Archive old events: Query with date range

### Redis
- Monitor job queue size: `LLEN bull:reminders:jobs`
- Clean old completed jobs: BullMQ auto-cleanup
- Use connection pooling: Already configured

### NLP
- Cache intent for repeated messages
- Batch process if handling multiple users
- Use Gemini instead of OpenAI for cost savings

---

## Further Reading

### System Design
- **[EVENTS_REMINDERS_SYSTEM.md](./EVENTS_REMINDERS_SYSTEM.md)** - Deep technical reference
- **[EVENTS_REMINDERS_ARCHITECTURE.md](./EVENTS_REMINDERS_ARCHITECTURE.md)** - Design decisions & diagrams

### Related Documentation
- Database schema: `migrations/`
- Type definitions: `src/types/index.ts`
- Configuration: `src/config/`

### External Resources
- BullMQ: https://docs.bullmq.io/
- Luxon: https://moment.github.io/luxon/
- RFC 5545 (RRULE): https://datatracker.ietf.org/doc/html/rfc5545

---

## Questions?

For specific questions about:
- **Event creation/management** → See EventService.ts (lines 77-875)
- **Reminder scheduling** → See ReminderQueue.ts (lines 38-133)
- **Date parsing** → See hebrewDateParser.ts (lines 15-250)
- **NLP intent** → See NLPService.ts (lines 77-200+)
- **Database schema** → See migrations/ directory

---

**Last Updated:** 2025-11-02
**Status:** Complete & Production-Ready
**Version:** 1.0
