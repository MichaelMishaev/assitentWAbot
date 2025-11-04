# Complete File Index - Events & Reminders System

## All Files in This Documentation Set

```
docs/development/
├── README_EVENTS_REMINDERS.md
│   ├─ Quick navigation
│   ├─ System overview
│   ├─ Core components
│   ├─ Data models
│   ├─ Data flow examples
│   ├─ Storage locations
│   ├─ Key features
│   ├─ Common queries
│   ├─ Testing & debugging
│   ├─ Common issues & solutions
│   ├─ Modifications & customization
│   └─ Performance tips
│
├── EVENTS_REMINDERS_SYSTEM.md (MAIN REFERENCE)
│   ├─ 1. Data Models
│   │   ├─ Event interface (lines 67-81 in types/index.ts)
│   │   ├─ EventComment interface
│   │   └─ Reminder interface (lines 83-94 in types/index.ts)
│   │
│   ├─ 2. Event Creation & Management
│   │   ├─ EventService class overview
│   │   ├─ All 11 methods with line numbers
│   │   └─ Comment management (8 methods)
│   │
│   ├─ 3. Reminder Scheduling & Execution
│   │   ├─ ReminderQueue with BullMQ
│   │   ├─ Queue configuration
│   │   ├─ scheduleReminder() function
│   │   └─ ReminderWorker processor
│   │
│   ├─ 4. Natural Language Processing
│   │   ├─ NLPIntent interface
│   │   ├─ parseIntent() method
│   │   ├─ Hebrew date parser
│   │   └─ Entity Extraction Phase
│   │
│   ├─ 5. Redis Storage & Caching
│   ├─ 6. Scheduled Jobs & Cron
│   ├─ 7. Storage Locations Summary
│   ├─ 8. Key Architectural Patterns
│   ├─ 9. Timezone Handling
│   ├─ 10. Key Files Reference
│   ├─ 11. Migration History
│   ├─ 12. Current Gaps & Future Improvements
│   └─ 13. Dependencies
│
├── EVENTS_REMINDERS_ARCHITECTURE.md
│   ├─ System Overview (with ASCII diagram)
│   ├─ 1. Natural Language Processing
│   ├─ 2. Date & Time Parsing
│   ├─ 3. Event Management
│   ├─ 4. Reminder Management & Scheduling
│   ├─ 5. Async Job Processing
│   ├─ 6. Database Schema
│   ├─ Key Design Decisions
│   ├─ Performance Characteristics
│   ├─ Error Handling & Safety
│   ├─ Current Limitations
│   └─ Future Improvements
│
├── EVENTS_REMINDERS_QUICK_REFERENCE.md
│   ├─ File Locations (absolute paths)
│   ├─ Data Flow Diagrams
│   ├─ Key Concepts
│   ├─ Critical Code Lines
│   ├─ Reminder Statuses
│   ├─ NLP Intents
│   ├─ Important Notes
│   ├─ Testing & Debugging
│   └─ SQL Queries
│
└── FILE_INDEX.md (this file)
    └─ Complete navigation guide
```

---

## Quick Reference by Topic

### Event Creation
- **See:** README_EVENTS_REMINDERS.md → "Data Flow Examples" → "Creating an Event"
- **Details:** EVENTS_REMINDERS_SYSTEM.md → Section 2 → "Event Creation & Management"
- **Code:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/EventService.ts` lines 77-133

### Reminder Scheduling
- **See:** README_EVENTS_REMINDERS.md → "Data Flow Examples" → "Creating a Reminder"
- **Details:** EVENTS_REMINDERS_SYSTEM.md → Section 3 → "Reminder Scheduling & Execution"
- **Code:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/queues/ReminderQueue.ts` lines 38-133

### Date Parsing
- **See:** EVENTS_REMINDERS_QUICK_REFERENCE.md → "Hebrew Date Keywords"
- **Details:** EVENTS_REMINDERS_SYSTEM.md → Section 4.2 → "Hebrew Date Parser"
- **Code:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/utils/hebrewDateParser.ts` lines 15-250

### NLP Intent Extraction
- **See:** EVENTS_REMINDERS_QUICK_REFERENCE.md → "NLP Intents (Supported)"
- **Details:** EVENTS_REMINDERS_SYSTEM.md → Section 4.1 → "NLP Intent Extraction"
- **Code:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/NLPService.ts` lines 77-82

### Entity Extraction
- **Details:** EVENTS_REMINDERS_SYSTEM.md → Section 4.3 → "Entity Extraction Phase"
- **Code:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/domain/phases/phase3-entity-extraction/EntityExtractionPhase.ts` lines 46-100

### Database Queries
- **See:** README_EVENTS_REMINDERS.md → "Common Queries"
- **See:** EVENTS_REMINDERS_QUICK_REFERENCE.md → "Testing & Debugging"
- **Schema:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1733086800000_initial-schema.sql`

### Redis & BullMQ
- **Details:** EVENTS_REMINDERS_SYSTEM.md → Section 5 & 6 → "Redis Storage" & "Scheduled Jobs"
- **Config:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/config/redis.ts`

### Daily Scheduler
- **Details:** EVENTS_REMINDERS_SYSTEM.md → Section 6.1 → "DailySchedulerService"
- **Code:** `/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/DailySchedulerService.ts` lines 72-100

---

## File Lookup by Topic

| Topic | Location | Document | Section |
|-------|----------|----------|---------|
| Event CRUD | EventService.ts | SYSTEM | 2 |
| Reminder CRUD | ReminderService.ts | SYSTEM | 3.2 |
| Event Comments | EventService.ts | SYSTEM | 2 (comment mgmt) |
| Date Parsing | hebrewDateParser.ts | SYSTEM | 4.2 |
| NLP Intent | NLPService.ts | SYSTEM | 4.1 |
| Entity Extraction | EntityExtractionPhase.ts | SYSTEM | 4.3 |
| Job Scheduling | ReminderQueue.ts | SYSTEM | 3.1 |
| Job Processing | ReminderWorker.ts | SYSTEM | 3.2 |
| Daily Scheduler | DailySchedulerService.ts | SYSTEM | 6.1 |
| Database Schema | migrations/...sql | SYSTEM | 1.1 & 1.2 |
| Redis Config | redis.ts | SYSTEM | 5.1 |
| Type Definitions | types/index.ts | SYSTEM | 1 |
| Error Handling | ARCHITECTURE | Error Handling |
| Performance | ARCHITECTURE | Performance |
| Timezone Handling | SYSTEM | 9 |

---

## Finding What You Need

### "I need to understand how X works"
1. Check README_EVENTS_REMINDERS.md for overview
2. See EVENTS_REMINDERS_SYSTEM.md detailed section
3. Look at EVENTS_REMINDERS_ARCHITECTURE.md for design context

### "I need the exact line number for X"
→ EVENTS_REMINDERS_QUICK_REFERENCE.md → "Critical Code Lines" section

### "I need to debug X issue"
1. README_EVENTS_REMINDERS.md → "Common Issues & Solutions"
2. EVENTS_REMINDERS_QUICK_REFERENCE.md → "Testing & Debugging"
3. Check logs per SYSTEM.md → Section 1 onwards

### "I need to modify X feature"
1. README_EVENTS_REMINDERS.md → "Modifications & Customization"
2. Find code location in QUICK_REFERENCE.md
3. Review architecture in ARCHITECTURE.md for impact

### "I need database help"
1. README_EVENTS_REMINDERS.md → "Common Queries"
2. EVENTS_REMINDERS_QUICK_REFERENCE.md → "Testing & Debugging" → SQL
3. SYSTEM.md → Section 1 (Data Models) or Section 7 (Storage)

---

## Absolute File Paths (All Code Files)

```
Core Services:
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/EventService.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/ReminderService.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/NLPService.ts

Queues:
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/queues/ReminderQueue.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/queues/ReminderWorker.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/services/DailySchedulerService.ts

Parsing:
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/utils/hebrewDateParser.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/domain/phases/phase3-entity-extraction/EntityExtractionPhase.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/routing/NLPRouter.ts

Configuration:
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/config/database.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/config/redis.ts
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/src/types/index.ts

Migrations:
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1733086800000_initial-schema.sql
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1733176800000_add_event_comments_jsonb.sql
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/migrations/1760183452000_add_reminder_notes.sql

Documentation:
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/docs/development/README_EVENTS_REMINDERS.md
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/docs/development/EVENTS_REMINDERS_SYSTEM.md
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/docs/development/EVENTS_REMINDERS_ARCHITECTURE.md
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/docs/development/EVENTS_REMINDERS_QUICK_REFERENCE.md
  /Users/michaelmishayev/Desktop/Projects/wAssitenceBot/docs/development/FILE_INDEX.md
```

---

## Summary Statistics

| Document | Lines | Sections | Focus |
|----------|-------|----------|-------|
| README | 379 | Overview + Examples | Getting started |
| SYSTEM | 739 | 13 detailed sections | Technical reference |
| ARCHITECTURE | 388 | Design + components | System design |
| QUICK_REFERENCE | 167 | Tables + quick info | Quick lookup |
| FILE_INDEX | TBD | Navigation | Finding info |

**Total Documentation:** ~1,850+ lines of comprehensive guides

---

## How These Files Work Together

```
User wants to understand Events/Reminders system
    ↓
START → README_EVENTS_REMINDERS.md
           ├─ Quick overview? ✓
           ├─ Data models explained ✓
           └─ Links to deeper docs
    ↓
Need more details?
    → EVENTS_REMINDERS_SYSTEM.md (MAIN REFERENCE)
           ├─ Every method listed
           ├─ All line numbers
           └─ Complete technical details
    ↓
Need architecture understanding?
    → EVENTS_REMINDERS_ARCHITECTURE.md
           ├─ System design diagrams
           ├─ Design decisions
           └─ Performance analysis
    ↓
Need specific line number?
    → EVENTS_REMINDERS_QUICK_REFERENCE.md
           ├─ File locations
           ├─ Critical lines
           └─ Quick queries
    ↓
Lost? → FILE_INDEX.md (THIS FILE)
           └─ Find what you need
```

---

**Last Updated:** 2025-11-02
**Complete:** Yes
**Ready for Use:** Yes
