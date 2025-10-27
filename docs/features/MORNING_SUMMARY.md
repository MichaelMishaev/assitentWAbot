# Morning Summary Notifications Feature

## Overview
Automated daily morning summary messages that provide users with their day's schedule, including events and reminders, delivered at their preferred time.

## Architecture

### Components

#### 1. Services Layer
- **UserService** (`src/services/UserService.ts`)
  - `getAllUsers()` - Retrieve all users
  - `getUsersWithMorningNotifications()` - Get users with feature enabled
  - `getUserById(userId)` - Get specific user

- **SettingsService** (`src/services/SettingsService.ts`) - Extended with:
  - `getMorningNotificationPrefs(userId)` - Get user preferences
  - `updateMorningNotificationEnabled(userId, enabled)` - Toggle feature
  - `updateMorningNotificationTime(userId, time)` - Set preferred time
  - `updateMorningNotificationDays(userId, days)` - Set active days
  - `updateMorningNotificationIncludeMemos(userId, includeMemos)` - Toggle memos

- **MorningSummaryService** (`src/services/MorningSummaryService.ts`)
  - `generateSummaryForUser(userId, date)` - Create formatted message
  - `shouldSendToday(user)` - Check if user should receive today
  - `getSummaryStats(userId)` - Get event/reminder counts

- **DailySchedulerService** (`src/services/DailySchedulerService.ts`)
  - `setupRepeatingJob()` - Configure daily 1 AM UTC job
  - `processDailySchedule()` - Schedule summaries for all users
  - `triggerNow()` - Manual trigger for testing

#### 2. Queue Infrastructure (BullMQ)
- **MorningSummaryQueue** (`src/queues/MorningSummaryQueue.ts`)
  - Job data: userId, phone, timezone, date
  - `scheduleMorningSummary(job, sendAtMs)` - Schedule individual summary
  - `cancelMorningSummary(userId, date)` - Cancel scheduled summary

- **MorningSummaryWorker** (`src/queues/MorningSummaryWorker.ts`)
  - Processes summary jobs
  - Generates message via MorningSummaryService
  - Sends via WhatsApp provider
  - Rate limiting: 10 jobs/second, concurrency: 5
  - Retry: 3 attempts with exponential backoff

### Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Daily Trigger (1 AM UTC)                   │
│                   DailySchedulerService                        │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ Get All Users With         │
         │ Morning Notifications      │
         │ Enabled                    │
         └───────────┬────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ For Each User:            │
         │ • Check day preferences   │
         │ • Calculate send time     │
         │ • Schedule summary job    │
         └───────────┬────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ MorningSummaryQueue       │
         │ (Delayed jobs based on    │
         │  user timezone + time)    │
         └───────────┬────────────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │ MorningSummaryWorker      │
         │ • Generate summary        │
         │ • Format message          │
         │ • Send via WhatsApp       │
         └────────────────────────────┘
```

## Configuration

### User Preferences Schema
```typescript
interface MorningNotificationPreferences {
  enabled: boolean;          // Default: false
  time: string;              // HH:mm format, Default: "08:00"
  days: number[];            // 0=Sunday, 6=Saturday, Default: [1,2,3,4,5]
  includeMemos: boolean;     // Default: true
}
```

### Storage
Preferences stored in PostgreSQL:
```sql
-- users.prefs_jsonb structure
{
  "morningNotification": {
    "enabled": true,
    "time": "08:00",
    "days": [1, 2, 3, 4, 5],
    "includeMemos": true
  }
}
```

## Usage Examples

### Enable for a User
```typescript
import { settingsService } from './services/SettingsService.js';

// Enable feature
await settingsService.updateMorningNotificationEnabled(userId, true);

// Set time
await settingsService.updateMorningNotificationTime(userId, '07:30');

// Weekdays only
await settingsService.updateMorningNotificationDays(userId, [1, 2, 3, 4, 5]);
```

### Manually Trigger for Testing
```typescript
import { getDailyScheduler } from './services/DailySchedulerService.js';

const scheduler = getDailyScheduler();
await scheduler.triggerNow();
```

### Generate Summary Preview
```typescript
import { morningSummaryService } from './services/MorningSummaryService.js';

const summary = await morningSummaryService.generateSummaryForUser(
  userId,
  new Date()
);
console.log(summary);
```

## Message Format

### Example Output
```
🌅 *בוקר טוב!*

📅 *יום חמישי, 24 באוקטובר*

*אירועים להיום:*
• 09:00 - פגישה עם לקוח 📍 משרד
• 14:30 - ישיבת צוות
• 18:00 - ארוחת ערב

📝 *תזכורות להיום:*
• 10:00 - התקשר לרופא
• 15:00 - קנה חלב

---
💡 *טיפ:* שלח "הגדרות בוקר" לשינוי העדפות התזכורת
💤 שלח "כבה תזכורת בוקר" להפסקת ההתראות
```

### Message Sections
1. **Header** - Greeting and date (Hebrew day name + date)
2. **Events** - List of today's events with time and optional location
3. **Reminders** - List of today's reminders (if includeMemos = true)
4. **Footer** - Helpful tips for managing preferences

## Testing

### QA Test Suite
```bash
# Run comprehensive test suite (10 tests)
npm run test:morning-summary
```

### Test Coverage
- User service queries
- Settings CRUD operations
- Preference validation (time format, day numbers)
- Summary generation with events
- Summary statistics
- Day preference logic

### Manual Testing Checklist
- [ ] Enable morning notifications for test user
- [ ] Set preferred time
- [ ] Create test event for tomorrow
- [ ] Trigger daily scheduler manually
- [ ] Verify job scheduled in BullMQ
- [ ] Wait for send time and verify message received
- [ ] Disable notifications
- [ ] Verify no message sent next day

## Production Deployment

### Prerequisites
- PostgreSQL database with users table
- Redis instance for BullMQ
- WhatsApp provider configured

### Environment Variables
```bash
# Standard database/Redis config
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# No additional env vars needed
```

### Startup
Services auto-initialize on bot startup:
```
✅ MorningSummaryWorker started
✅ DailyScheduler initialized (runs daily at 1 AM UTC)
```

### Monitoring

#### Check Scheduled Jobs
```bash
# Redis CLI
redis-cli

# View repeatable jobs
SMEMBERS "bull:daily-scheduler:repeat"

# View pending morning summaries
ZRANGE "bull:morning-summaries:wait" 0 -1
```

#### Logs
```bash
# Daily scheduler runs
grep "Processing daily schedule" logs/app.log

# Individual summaries
grep "Morning summary sent successfully" logs/app.log
```

## Performance Considerations

### Rate Limiting
- **WhatsApp:** 10 messages/second max
- **Worker Concurrency:** 5 simultaneous jobs
- **Batch Processing:** All users scheduled within ~5 seconds

### Scalability
- **100 users:** ~10 seconds to schedule
- **1,000 users:** ~1-2 minutes to schedule
- **10,000 users:** Consider batching scheduler runs

### Resource Usage
- **Redis Memory:** ~100 bytes per job
- **Database Queries:** 1 query per user during scheduling
- **Network:** 1 WhatsApp API call per user

## Troubleshooting

### No Summaries Sent
1. Check if daily scheduler job exists:
   ```bash
   redis-cli SMEMBERS "bull:daily-scheduler:repeat"
   ```

2. Check if users have feature enabled:
   ```sql
   SELECT id, phone, prefs_jsonb->'morningNotification'->>'enabled'
   FROM users
   WHERE prefs_jsonb->'morningNotification'->>'enabled' = 'true';
   ```

3. Check worker is running:
   ```bash
   grep "Morning summary worker initialized" logs/app.log
   ```

### Jobs Not Processing
- Verify Redis connection
- Check worker logs for errors
- Inspect failed jobs in BullMQ

### Incorrect Timezone
- Verify user's timezone in database
- Check Luxon timezone calculations
- Ensure system timezone properly configured

## Future Enhancements

### Planned Features
- [ ] User chat commands ("הפעל תזכורת בוקר", "שנה שעה ל-7:30")
- [ ] Weekly summary option
- [ ] RRule expansion for recurring events
- [ ] Custom message templates
- [ ] Voice message summaries
- [ ] Smart scheduling (skip if no events)
- [ ] Summary analytics dashboard

### Architecture Improvements
- [ ] Batch database queries for better performance
- [ ] Caching layer for frequently accessed preferences
- [ ] A/B testing framework for message formats
- [ ] Webhook callbacks for delivery confirmation

## API Reference

### SettingsService

#### getMorningNotificationPrefs
```typescript
async getMorningNotificationPrefs(userId: string): Promise<{
  enabled: boolean;
  time: string;
  days: number[];
  includeMemos: boolean;
}>
```

#### updateMorningNotificationEnabled
```typescript
async updateMorningNotificationEnabled(
  userId: string,
  enabled: boolean
): Promise<void>
```

#### updateMorningNotificationTime
```typescript
async updateMorningNotificationTime(
  userId: string,
  time: string // HH:mm format
): Promise<void>
// Throws: Error if invalid time format
```

#### updateMorningNotificationDays
```typescript
async updateMorningNotificationDays(
  userId: string,
  days: number[] // 0-6
): Promise<void>
// Throws: Error if invalid day numbers
```

### MorningSummaryService

#### generateSummaryForUser
```typescript
async generateSummaryForUser(
  userId: string,
  date?: Date
): Promise<string>
// Returns: Formatted Hebrew message
```

#### shouldSendToday
```typescript
shouldSendToday(user: User): boolean
// Returns: true if summary should be sent today
```

#### getSummaryStats
```typescript
async getSummaryStats(userId: string): Promise<{
  eventsToday: number;
  eventsThisWeek: number;
  remindersToday: number;
}>
```

## License
MIT

## Contributors
- Implementation: Claude AI Assistant
- Architecture Design: User & Claude
- Testing: Automated QA Suite

## Support
For issues or questions, please file an issue in the repository.
