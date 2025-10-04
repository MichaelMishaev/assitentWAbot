# QA Test Suite - 5 Critical Bug Fixes

## Overview
This document provides QA tests for verifying 5 critical bug fixes in the NLP and event matching system.

---

## Bug #1: NLP Not Extracting Full Event Details

### Issue
When user provides full event details (title, date, time, location) in one message, the bot still asks "When is the event?"

### Example Input
```
משחק כדורגל נתניה סכנין יום ראשון 5 באוקטובר 20:00 אצטדיון נתניה
```

### Expected Behavior
Bot should extract:
- **Title:** משחק כדורגל נתניה סכנין
- **Date:** Sunday, October 5, 2025
- **Time:** 20:00
- **Location:** אצטדיון נתניה

Bot should show confirmation message with all details, NOT ask for time.

### Test Cases

#### TC1.1: Full event details in Hebrew
**Input:** `משחק כדורגל נתניה סכנין יום ראשון 5 באוקטובר 20:00 אצטדיון נתניה`

**Expected Output:**
```
✅ זיהיתי אירוע חדש:

📌 משחק כדורגל נתניה סכנין
📅 05/10/2025 20:00
📍 אצטדיון נתניה

האם לקבוע את האירוע? (כן/לא)
```

**Status:** ✅ PASS / ❌ FAIL

---

#### TC1.2: Event with contact and time
**Input:** `פגישה עם דני מחר בשעה 14:30 בקפה נמרוד`

**Expected Output:**
```
✅ זיהיתי אירוע חדש:

📌 פגישה עם דני
📅 [Tomorrow's date] 14:30
👤 דני
📍 קפה נמרוד

האם לקבוע את האירוע? (כן/לא)
```

**Status:** ✅ PASS / ❌ FAIL

---

#### TC1.3: Event without time (should ask for time)
**Input:** `פגישה עם אמא מחר`

**Expected Output:**
```
📌 פגישה עם אמא
📅 [Tomorrow's date]

⏰ באיזו שעה?

הזן שעה (למשל: 14:00)

או שלח /ביטול
```

**Status:** ✅ PASS / ❌ FAIL

---

## Bug #2: "When is..." Questions Classified as Create Instead of Search

### Issue
Questions like "מתי הבר מצווה של טל?" (When is Tal's bar mitzvah?) are interpreted as create_event instead of search_event.

### Example Input
```
מתי הבר מצווה של טל?
```

### Expected Behavior
Bot should SEARCH for existing "bar mitzvah" events for "Tal", not try to create a new event.

### Test Cases

#### TC2.1: "When is" question in Hebrew
**Input:** `מתי הבר מצווה של טל?`

**Expected Output:** List of events matching "בר מצווה טל" OR "לא נמצאו אירועים" if none exist.

**Should NOT output:** "לא הצלחתי להבין את התאריך" (Failed to understand date)

**Status:** ✅ PASS / ❌ FAIL

---

#### TC2.2: "When is" question in English
**Input:** `When is the meeting with Danny?`

**Expected Output:** List of meetings with Danny OR "No events found"

**Should NOT output:** Date parsing error

**Status:** ✅ PASS / ❌ FAIL

---

#### TC2.3: General "When do I have" question
**Input:** `מתי יש לי פגישות השבוע?`

**Expected Output:** List of meetings this week

**Status:** ✅ PASS / ❌ FAIL

---

## Bug #3: Fuzzy Matching Too Strict (should be ~60-80%)

### Issue
Small variations in event names prevent the bot from finding events. For example, "תבטל בדיקת דם" doesn't find "בדיקת דם עם ריאל".

### Example Input
```
תבטל בדיקת דם
```

### Expected Behavior
Bot should find event titled "בדיקת דם עם ריאל" even though it's not an exact match (fuzzy matching ~60%+).

### Test Cases

#### TC3.1: Partial title match
**Pre-condition:** Create event "בדיקת דם עם ריאל" for tomorrow at 08:00

**Input:** `תבטל בדיקת דם`

**Expected Output:**
```
🗑️ למחוק את האירוע הבא?

📌 בדיקת דם עם ריאל
📅 [Tomorrow's date] 08:00

האם למחוק? (כן/לא)
```

**Status:** ✅ PASS / ❌ FAIL

---

#### TC3.2: Partial contact name match
**Pre-condition:** Create event "פגישה עם מיכאל" for next week

**Input:** `מה יש לי עם מיכ`

**Expected Output:** Should find and display "פגישה עם מיכאל"

**Status:** ✅ PASS / ❌ FAIL

---

#### TC3.3: Event name with extra words
**Pre-condition:** Create event "רופא שיניים - ד״ר כהן"

**Input:** `מתי רופא שיניים?`

**Expected Output:** Should find "רופא שיניים - ד״ר כהן"

**Status:** ✅ PASS / ❌ FAIL

---

## Bug #4: Location Asked Even Though Optional

### Issue
After providing event name, date, and time manually, the bot asks "Where is the event?" even though location is optional.

### Example Flow (Manual Event Creation)
```
User: /תפריט
Bot: [Shows menu]
User: 1 (Create event)
Bot: What's the event name?
User: פגישה עם דני
Bot: When is the event?
User: מחר
Bot: What time?
User: 14:00
Bot: [Should show confirmation, NOT ask for location]
```

### Expected Behavior
After time input, bot should skip location question and go straight to confirmation:
```
📌 פגישה עם דני
⏰ [Tomorrow's date] 14:00

האם הכל נכון?

✅ שלח "כן" לאישור
❌ שלח "לא" לביטול
```

### Test Cases

#### TC4.1: Manual event creation without location
**Steps:**
1. Send `/תפריט`
2. Select `1` (Create event)
3. Enter title: `פגישה עם דני`
4. Select date option (e.g., `2` for tomorrow)
5. Enter time: `14:00`

**Expected Output:** Confirmation message WITHOUT location prompt

**Should NOT ask:** "איפה האירוע?" (Where is the event?)

**Status:** ✅ PASS / ❌ FAIL

---

#### TC4.2: User can add location later via edit
**Pre-condition:** Create event without location (from TC4.1)

**Steps:**
1. Send `/תפריט`
2. Select `3` (View/Edit events)
3. Select the event
4. Select `3` (Edit location)
5. Enter: `קפה נמרוד`

**Expected Output:** Location should be updated successfully

**Status:** ✅ PASS / ❌ FAIL

---

## Bug #5: Time Parsing Issues in Complex Strings

### Issue
Sometimes the bot doesn't understand time even when clearly written in the message.

### Example Input
```
פגישה מחר ב-15:00
```

### Expected Behavior
Bot should extract time `15:00` and NOT ask for time again.

### Test Cases

#### TC5.1: Time with dash separator
**Input:** `פגישה עם לקוח מחר ב-15:00`

**Expected Output:** Event confirmation with time 15:00, NOT a request for time

**Status:** ✅ PASS / ❌ FAIL

---

#### TC5.2: Time with "at" preposition
**Input:** `meeting tomorrow at 3pm`

**Expected Output:** Event confirmation with time 15:00 (3 PM)

**Status:** ✅ PASS / ❌ FAIL

---

#### TC5.3: Time in Hebrew format
**Input:** `פגישה מחר בשעה שלוש אחרי הצהריים`

**Expected Output:** Event confirmation with time 15:00 (3 PM)

**Status:** ✅ PASS / ❌ FAIL

---

#### TC5.4: Evening time indicator
**Input:** `ארוחת ערב מחר בשמונה בערב`

**Expected Output:** Event confirmation with time 20:00 (8 PM)

**Status:** ✅ PASS / ❌ FAIL

---

#### TC5.5: Midnight time (00:00) edge case
**Input:** `אירוע מחר בחצות`

**Expected Output:** Event confirmation with time 00:00, NOT a request for time

**Status:** ✅ PASS / ❌ FAIL

---

## Summary Checklist

### Bug #1: Full Event Details Extraction
- [ ] TC1.1: Full details in one message
- [ ] TC1.2: Event with contact and time
- [ ] TC1.3: Event without time (edge case)

### Bug #2: "When is" Search Intent
- [ ] TC2.1: Hebrew "when is" question
- [ ] TC2.2: English "when is" question
- [ ] TC2.3: General "when do I have" question

### Bug #3: Fuzzy Matching (~60-80%)
- [ ] TC3.1: Partial title match
- [ ] TC3.2: Partial contact name match
- [ ] TC3.3: Event name with extra words

### Bug #4: Optional Location
- [ ] TC4.1: Manual creation skips location
- [ ] TC4.2: Location editable later

### Bug #5: Time Parsing
- [ ] TC5.1: Time with dash separator
- [ ] TC5.2: Time with "at" preposition
- [ ] TC5.3: Hebrew time format
- [ ] TC5.4: Evening time indicator
- [ ] TC5.5: Midnight edge case

---

## Test Environment

- **Test Date:** 2025-10-04
- **Server:** Production (167.71.145.9)
- **PM2 App:** ultrathink
- **WhatsApp Number:** [Test number]
- **Tester:** [Name]

---

## Notes

### How to Run Tests
1. Connect to production WhatsApp bot
2. Follow test cases in order
3. Mark each test as PASS ✅ or FAIL ❌
4. Document any unexpected behavior
5. Take screenshots if needed

### Regression Considerations
- Test on both Hebrew and English inputs
- Test with and without contacts in database
- Test during different times of day (for timezone edge cases)
- Test with past dates (should reject)

---

**Last Updated:** 2025-10-04
**Version:** 1.0
**Related Commit:** df2eeeb
