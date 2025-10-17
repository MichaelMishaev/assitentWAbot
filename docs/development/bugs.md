# Bugs Tracker

## ✅ FIXED - Commit [hash]

### 1. Search for nearest event not understanding Hebrew
**Issue:** When searching for nearest/closest event, bot didn't understand Hebrew keywords like "הקרוב", "הכי קרוב"
**Status:** ✅ ALREADY FIXED
**Location:** `src/services/NLPService.ts` line 84
**Details:** NLP prompt already includes: "מה הקרוב", "מה הבא", "הבא בתור", "הקרוב שלי", "מה הכי קרוב"
**Verification:** No code changes needed - already working

---

### 2. Context loss when replying with time after reminder creation
**Issue:**
```
User: "תזכיר לי עוד 20 ימים לבטל את המנוי של אמזון"
Bot: "📌 לבטל את המנוי של אמזון\n📅 06/11/2025\n\n⏰ באיזו שעה?"
User: "14:00"
Bot: "❌ נא להזין תאריך ושעה."  ← ERROR: Should accept just time!
```

**Root Cause:**
- NLP extracted date "עוד 20 ימים" → 06/11/2025 but didn't pass it to state
- StateRouter required both date+time but date was already known

**Fix Applied:**
1. **File:** `src/routing/NLPRouter.ts` (lines 584-589)
   - Now passes `date` in context when asking for time
   - Changed prompt from "הזן תאריך ושעה" to "הזן שעה"

2. **File:** `src/routing/StateRouter.ts` (lines 702-769)
   - Added `existingDate` check from context
   - Allows entering just time when date already exists
   - Uses existing date from NLP context

**Status:** ✅ FIXED
**Test:** Send "תזכיר לי עוד 20 ימים לבטל מנוי", then reply with just "14:00"
**Expected:** Should accept time and create reminder without error

---

### 3. Multi-line message not parsing time
**Issue:**
```
User sent (multi-line):
"פגישה עם מיכאל על בירה
20.10
16:00
מרפיס פולג"

Bot response:
"📌 פגישה על בירה עם מיכאל על
📅 20/10/2025
⏰ באיזו שעה?"  ← ERROR: Time 16:00 was on line 3!
```

**Root Cause:**
- NLP didn't recognize that multi-line messages have structured data
- Each line has semantic meaning: title → date → time → location
- Time on separate line wasn't being extracted

**Fix Applied:**
- **File:** `src/services/NLPService.ts` (lines 343-370)
- Added comprehensive multi-line parsing instructions to NLP prompt
- Recognition rules:
  - Line with only digits/dots/slashes → DATE
  - Line with only HH:MM → TIME
  - Line with Hebrew text after date/time → LOCATION
  - First substantive line → TITLE + participants
- Instructed AI to combine date + time into single ISO timestamp

**Status:** ✅ FIXED
**Test:** Send the exact message above in multi-line format
**Expected:** Should extract all: title, date, time 16:00, location "מרפיס פולג"

---

## Testing Instructions

1. **Bug #1 (Nearest Event):**
   ```
   Send: "מה האירוע הקרוב שלי?"
   Expected: Returns nearest upcoming event
   ```

2. **Bug #2 (Context Loss):**
   ```
   Send: "תזכיר לי עוד 20 ימים לבטל מנוי"
   Bot asks for time
   Reply: "14:00"
   Expected: ✅ Reminder created for 20 days from now at 14:00
   ```

3. **Bug #3 (Multi-line):**
   ```
   Send (as 4 separate lines):
   פגישה עם מיכאל
   20.10
   16:00
   מרפיס פולג

   Expected: Event created with:
   - Title: "פגישה עם מיכאל"
   - Date: 20/10/2025
   - Time: 16:00
   - Location: "מרפיס פולג"
   ```