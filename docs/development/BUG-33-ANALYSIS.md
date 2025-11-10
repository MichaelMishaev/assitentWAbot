# Bug #33: Lead Time Calculation - "יום לפני" Shows Wrong Date

## 🔴 CRITICAL BUG DISCOVERED

**Date Discovered:** 2025-11-10 (ULTRATHINK analysis)
**Severity:** CRITICAL
**Frequency:** 100% (4/4 cases from Nov 4)
**Impact:** Users get reminders on wrong dates

---

## 📊 Production Evidence

### Case 1: Event on 7.11, Reminder Scheduled for 5.11 (2 days early!)

**Conversation:**
```
07:33:39 User: "קבל ליום שישי לשעה 13:00 פגישה חשובה"
07:33:47 Bot:  "✅ אירוע נוסף בהצלחה! 📌 פגישה חשובה 📅 יום שישי (07/11/2025 13:00)"
07:33:57 User: "תזכיר לי יום לפני"
07:34:04 Bot:  "✅ תזכורת נקבעה: 📌 פגישה חשובה 📅 05/11/2025 12:00"
                                                   ^^^^^^^^^^^^^^^^ WRONG!

07:36:16 User: "#the event scheduled for 7.11, asked for it to remind me a day before,
                it scheduler reminder for the 5.11, it's 2 days, not 1. Bug"
```

**Expected:** 06/11/2025 13:00 (1 day before event on 7.11)
**Actual:** 05/11/2025 12:00 (2 days before!)
**Error:** Reminder is **1 day too early** + time is wrong (12:00 instead of 13:00)

---

### Case 2: Event on 8.11, Reminder Scheduled for 5.11 (3 days early!)

**Conversation:**
```
07:55:51 User: "בשבת בשעה 9:00 פגישה בפארק גיבורים"
07:55:59 Bot:  "✅ אירוע נוסף בהצלחה! 📌 פגישה 📅 יום שבת (08/11/2025 09:00)"
07:56:08 User: "תזכיר לי יום לפני"
07:56:15 Bot:  "✅ תזכורת נקבעה: 📌 פגישה 📅 05/11/2025 12:00"
                                              ^^^^^^^^^^^^^^^^ WRONG!

07:57:14 User: "#asked to remind me day before a meeting, the meeting on 8.11,
                the reminder on 5.11, bug!"
```

**Expected:** 07/11/2025 09:00 (1 day before event on 8.11)
**Actual:** 05/11/2025 12:00 (3 days before!)
**Error:** Reminder is **2 days too early** + time is wrong (12:00 instead of 09:00)

---

### Case 3: Event on 9.11, Shows Reminder for 9.11 (No lead time applied!)

**Conversation:**
```
08:22:30 User: "קבע פגישה ליום ראשון, בשעה 11:00, להביא מחברת"
08:22:36 Bot:  "✅ אירוע נוסף בהצלחה! 📌 פגישה 📅 יום ראשון (09/11/2025 11:00)"
08:22:47 User: "תזכיר לי יום לפני"
08:22:53 Bot:  "✅ תזכורת נקבעה: 📌 פגישה 📅 09/11/2025 11:00"
                                              ^^^^^^^^^^^^^^^^ WRONG!

08:23:08 User: "תזכיר לי 5 שעות לפני"
08:23:13 Bot:  "✅ תזכורת נקבעה: 📌 פגישה 📅 09/11/2025 11:00"
                                              ^^^^^^^^^^^^^^^^ WRONG!

08:23:36 User: "#didnt understand the reminder I asked for."
```

**Expected (יום לפני):** 08/11/2025 11:00 (1 day before)
**Expected (5 שעות לפני):** 09/11/2025 06:00 (5 hours before)
**Actual:** 09/11/2025 11:00 (same as event! No lead time applied!)
**Error:** Lead time **completely ignored**

---

### Case 4: Event on 6.11, Shows Reminder for 6.11 (No lead time applied!)

**Conversation:**
```
08:56:49 User: "קבע פגישה ליום חמישי לשעה 15, להביא מים"
08:56:57 Bot:  "✅ אירוע נוסף בהצלחה! 📌 פגישה 📅 יום חמישי (06/11/2025 15:00)"
08:57:09 User: "תזכיר לי יום לפני"
08:57:14 Bot:  "✅ תזכורת נקבעה: 📌 פגישה 📅 06/11/2025 15:00"
                                              ^^^^^^^^^^^^^^^^ WRONG!

08:57:41 User: "#didnt understand the יום לפני"
08:57:51 User: "תזכיר לי 3 שעות לפני"
08:57:58 Bot:  "✅ תזכורת נקבעה: 📌 פגישה 📅 06/11/2025 15:00"
                                              ^^^^^^^^^^^^^^^^ WRONG!

08:58:18 User: "#didnt understand to remind me 3 hours before"
```

**Expected (יום לפני):** 05/11/2025 15:00 (1 day before)
**Expected (3 שעות לפני):** 06/11/2025 12:00 (3 hours before)
**Actual:** 06/11/2025 15:00 (same as event!)
**Error:** Lead time **completely ignored**

---

## 🎯 Pattern Analysis

### Pattern 1: Sometimes Shows Wrong Date (Cases 1, 2)
- Case 1: Event 7.11 → Reminder 5.11 (2 days early)
- Case 2: Event 8.11 → Reminder 5.11 (3 days early)

**Observation:** Both show **05/11/2025 12:00** regardless of event date!
This suggests the reminder date is **NOT calculated from event date at all**.

### Pattern 2: Sometimes Shows Same Date as Event (Cases 3, 4)
- Case 3: Event 9.11 → Reminder 9.11 (no lead time)
- Case 4: Event 6.11 → Reminder 6.11 (no lead time)

**Observation:** Lead time completely ignored. Reminder scheduled for exact event time.

### Common Issue: Time is Wrong
- Case 1: Event at 13:00, reminder shows 12:00
- Case 2: Event at 09:00, reminder shows 12:00
- Both show **12:00** (midday default?) instead of event time

---

## 🔍 Root Cause Investigation

### Context: What's "תזכיר לי יום לפני"?

User workflow:
1. User creates event: "פגישה ביום שישי 13:00"
2. Bot creates event for 07/11/2025 13:00
3. User immediately says: "תזכיר לי יום לפני" (remind me day before)
4. Bot should create reminder for 06/11/2025 13:00

**Current behavior:** Reminder date is calculated WRONG or IGNORED.

### Code Analysis

**File:** `src/routing/NLPRouter.ts` (lines 1086-1114)

```typescript
// Create reminder in database
const createdReminder = await this.reminderService.createReminder({
  userId,
  title: reminder.title,
  dueTsUtc: dueDate,  // ← THIS IS THE PROBLEM!
  rrule: reminder.recurrence || undefined,
  notes: reminder.notes || undefined
});

// Use extracted lead time from message
let leadTimeMinutes: number;
if (reminder.leadTimeMinutes && typeof reminder.leadTimeMinutes === 'number' && reminder.leadTimeMinutes > 0) {
  leadTimeMinutes = reminder.leadTimeMinutes;  // ← 1440 for "יום לפני"
} else {
  leadTimeMinutes = await this.settingsService.getReminderLeadTime(userId);
}

// Schedule with BullMQ
await scheduleReminder({
  reminderId: createdReminder.id,
  userId,
  title: reminder.title,
  phone
}, dueDate, leadTimeMinutes);  // ← dueDate is event date, leadTimeMinutes is lead time
```

### The Problem

**What `dueDate` is in this context:**

When user says "תזכיר לי יום לפני" in reply to an event:
- NLP extracts: `leadTimeMinutes: 1440` (1 day = 24 hours * 60 min)
- NLP should extract: **event date** as the reference point
- But what does NLP actually extract as `dueDate`?

**The issue:** When user says just "תזכיר לי יום לפני" without specifying a date:
- NLP doesn't know WHAT date to calculate "day before" from
- User is referencing the event they just created
- But NLP has no context about that event's date

### Expected Flow

```
User: "פגישה ביום שישי 13:00"
Bot: Creates event for 07/11/2025 13:00

User: "תזכיר לי יום לפני"
NLP should understand:
  - This is a reminder request
  - Lead time: 1440 minutes (1 day)
  - Reference event: The one just created (פגישה on 07/11/2025 13:00)
  - Reminder due date: 07/11/2025 13:00 (event date)
  - Notification time: 06/11/2025 13:00 (1 day before due date)
```

### Actual Flow (BROKEN)

```
User: "תזכיר לי יום לפני"
NLP extracts:
  - leadTimeMinutes: 1440 ✓
  - dueDate: ??? (NLP has no event context!)

Possible scenarios:
1. NLP defaults to "today 12:00" → Creates reminder for today minus 1 day = YESTERDAY!
2. NLP defaults to "now" → Creates reminder for current time minus 1 day
3. NLP fails to extract date → Uses some default date (05/11?)
```

---

## 💡 The Real Problem

### Issue: "תזכיר לי יום לפני" is AMBIGUOUS without Event Context

When user says "תזכיר לי יום לפני", they mean:
- "Remind me 1 day before THE EVENT I JUST CREATED"

But NLP service receives just the text "תזכיר לי יום לפני" without:
- Event ID
- Event date
- Event time

**The code DOES inject event context** (lines 304-315, 360-372):
```typescript
// BUG FIX #14: Inject recent event context
if (hasExplicitReminderKeyword && !eventContextRaw) {
  const recentEvents = await this.getRecentEvents(userId);
  const mostRecent = recentEvents[0];
  const fullEvent = await this.eventService.getEventById(mostRecent.id, userId);

  // Inject event date into text for NLP
  contextEnhancedText = `${text} (בהקשר לאירוע האחרון שנוצר: ${mostRecent.title} בתאריך ${dateStr} בשעה ${timeStr})`;
}
```

So NLP **should** receive:
```
"תזכיר לי יום לפני (בהקשר לאירוע האחרון שנוצר: פגישה חשובה בתאריך 07.11.2025 בשעה 13:00)"
```

### So Why is it Still Broken?

**Hypothesis:** NLP is extracting the WRONG date from this context.

When NLP sees:
```
"תזכיר לי יום לפני (בהקשר לאירוע: פגישה חשובה בתאריך 07.11.2025 בשעה 13:00)"
```

It should extract:
- `title`: "פגישה חשובה"
- `leadTimeMinutes`: 1440
- `dueDate`: 2025-11-07T13:00:00 (event date)

But it might be extracting:
- `title`: "פגישה חשובה" ✓
- `leadTimeMinutes`: 1440 ✓
- `dueDate`: 2025-11-05T12:00:00 ❌ (WRONG DATE!)

**Possible causes:**
1. NLP interprets "יום לפני" as part of the date, creating confusion
2. NLP calculates "day before 07.11" = "06.11" and puts THAT as dueDate
3. Date parsing logic has a bug

---

## 🎯 The Root Cause

**After analyzing the code flow:**

The bug is in **how NLP interprets "תזכיר לי יום לפני" with event context**.

### Current NLP Behavior (INCORRECT):

When NLP sees:
```
"תזכיר לי יום לפני (בהקשר לאירוע: פגישה בתאריך 07.11.2025 בשעה 13:00)"
```

NLP extracts:
- `leadTimeMinutes`: 1440 ✓
- `dueDate`: **06.11.2025 13:00** (calculates "day before 07.11")

Then code does:
```typescript
// Display calculation (line 1022)
const notificationTime = dt.minus({ minutes: 1440 });  // 06.11 - 1 day = 05.11

// Scheduling (line 1114)
await scheduleReminder(..., dueDate, leadTimeMinutes);
// Schedules for: dueDate (06.11) minus leadTimeMinutes (1440) = 05.11
```

**Result:** Reminder scheduled for 05.11 instead of 06.11!

### Correct NLP Behavior (SHOULD BE):

When user says "תזכיר לי יום לפני" about an event:
- `leadTimeMinutes`: 1440 (HOW EARLY to remind)
- `dueDate`: **07.11.2025 13:00** (THE EVENT DATE - what we're reminding about)

Then code should:
```typescript
// Display: Show notification time
const notificationTime = dt.minus({ minutes: 1440 });  // 07.11 - 1 day = 06.11 ✓

// Scheduling: Calculate send time
await scheduleReminder(..., eventDate, leadTimeMinutes);
// Schedules for: eventDate (07.11) minus leadTimeMinutes (1440) = 06.11 ✓
```

---

## 🔧 The Fix

### Option 1: Fix NLP Prompt (Clarify Intent)

**File:** `src/services/NLPService.ts` (lines 161-184)

**Current prompt:**
```
LEAD TIME PARSING:
- "תזכיר לי יום לפני" → leadTimeMinutes: 1440
```

**Clarified prompt:**
```
LEAD TIME PARSING (CRITICAL):
When user says "תזכיר לי [TIME] לפני" in context of an event:
- Extract leadTimeMinutes as LEAD TIME (how early to send reminder)
- Extract dueDate as EVENT DATE (what we're reminding about)
- DO NOT calculate "dueDate minus leadTime"! That's done by the scheduler!

Examples:
- "תזכיר לי יום לפני" about event on 07.11 at 13:00
  → {leadTimeMinutes: 1440, dueDate: "2025-11-07T13:00", title: "[event title]"}
  (Scheduler will send reminder on 06.11 at 13:00)

- "תזכיר לי 3 שעות לפני" about event on 09.11 at 11:00
  → {leadTimeMinutes: 180, dueDate: "2025-11-09T11:00", title: "[event title]"}
  (Scheduler will send reminder on 09.11 at 08:00)

CRITICAL: "לפני" is LEAD TIME, not date modification!
DO NOT subtract lead time from event date when extracting dueDate!
```

### Option 2: Fix Display Logic

**File:** `src/routing/NLPRouter.ts` (lines 1015-1047)

**Problem:** Display logic subtracts lead time AGAIN from dueDate

**Current:**
```typescript
if (isExplicitLeadTime) {
  const notificationTime = dt.minus({ minutes: reminder.leadTimeMinutes });
  displayDate = notificationTime.toFormat('dd/MM/yyyy HH:mm');
}
```

**If NLP already subtracted lead time, this double-subtracts!**

---

## 🎯 Recommendation

**Fix NLP Prompt** to clarify that:
1. `dueDate` = EVENT DATE (what we're reminding about)
2. `leadTimeMinutes` = LEAD TIME (how early to remind)
3. DO NOT calculate "dueDate minus leadTime" in NLP

The scheduler will handle the subtraction.

---

**Status:** Root cause identified, fix ready to implement
**Next Step:** Update NLP prompt and test
