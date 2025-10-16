# QA Test Cases - Date Parser & Participant Extraction Fixes

## Date: October 16, 2025
## Issues Fixed:
1. Hebrew date parser missing "עוד X ימים" pattern support
2. Hebrew date parser missing "יום X הקרוב/הבא" patterns
3. Participant extraction capturing location names as participants

---

## Test Case #1: "עוד 10 ימים" (In 10 Days)

### User Input:
```
מה יש לי עוד 10 ימים?
```

### Expected Behavior:
- Bot should parse "עוד 10 ימים" as "10 days from today"
- Calculate correct date (Oct 26, 2025 if run on Oct 16, 2025)
- Return events for that date

### Before Fix:
```
❌ לא נמצאו אירועים עבור "עוד 10 ימים"
```

### After Fix:
```
✅ Shows events for October 26, 2025
```

### Test Variations:
- "עוד 1 יום" (singular) → Tomorrow
- "עוד 5 ימים" → 5 days from now
- "עוד 30 ימים" → 30 days from now
- "עוד 100 ימים" → 100 days from now

---

## Test Case #2: "שבת הקרוב" (Next Saturday)

### User Input:
```
מה יש לי ליום שבת הקרוב?
```

### Expected Behavior:
- Bot should parse "שבת הקרוב" as "next Saturday"
- Return next Saturday's date
- Show events for that Saturday

### Before Fix:
```
❌ לא נמצאו אירועים עבור "שבת הקרוב"
```

### After Fix:
```
✅ Shows events for next Saturday
```

### Test Variations:
- "ראשון הקרוב" → Next Sunday
- "שני הבא" → Next Monday
- "יום רביעי הקרוב" → Next Wednesday
- "שישי הבא" → Next Friday

---

## Test Case #3: Participant Extraction with Location

### User Input:
```
תזכיר פגישה לחיים לשלח 20:00 עם יוסי בקופת חולים כללית
```

### Expected Behavior:
- Extract participants: "יוסי" only
- Extract location: "קופת חולים כללית"
- NOT extract "קופת", "חולים", "כללית" as participants

### Before Fix:
```
❌ Participants: ["יוסי", "קופת", "חולים", "כללית"]
```

### After Fix:
```
✅ Participants: ["יוסי"]
✅ Location: "קופת חולים כללית"
```

### Test Variations:
- "עם דני בבית חולים הדסה" → Participant: דני, Location: בית חולים הדסה
- "עם מיכל ברמת גן" → Participant: מיכל, Location: רמת גן
- "עם רון למשרד" → Participant: רון, Location: למשרד
- "עם שרה מהעבודה" → Participant: שרה

---

## Regression Tests

### Test Hebrew Keywords (Should Still Work):
- ✅ "היום" → Today
- ✅ "מחר" → Tomorrow
- ✅ "שבוע הבא" → Next week (Monday)
- ✅ "חודש הבא" → Next month
- ✅ "יום ראשון" → Next Sunday
- ✅ "שבת" → Next Saturday

### Test Date Formats (Should Still Work):
- ✅ "16/10" → Oct 16
- ✅ "16/10/2025" → Oct 16, 2025
- ✅ "16.10" → Oct 16
- ✅ "16.10.2025" → Oct 16, 2025

### Test Time Extraction (Should Still Work):
- ✅ "מחר 14:00" → Tomorrow at 2 PM
- ✅ "היום בשעה 18:00" → Today at 6 PM
- ✅ "שבת 10 בבוקר" → Next Saturday at 10 AM
- ✅ "מחר 3 אחרי הצהריים" → Tomorrow at 3 PM

---

## Implementation Details

### Changes Made:

#### 1. `hebrewDateParser.ts` (Lines 142-182)
```typescript
// FIX #1: Support "עוד X ימים" (in X days) pattern
const relativeDaysMatch = dateInput.match(/^עוד\s+(\d+)\s+ימים?$/);
if (relativeDaysMatch) {
  const daysToAdd = parseInt(relativeDaysMatch[1], 10);
  if (daysToAdd >= 0 && daysToAdd <= 365) {
    let date = now.plus({ days: daysToAdd });
    if (extractedTime) {
      date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
    }
    return { success: true, date: date.toJSDate() };
  }
}

// FIX #2: Support "יום X הקרוב/הבא" patterns
const nextDayMatch = dateInput.match(/^(?:יום\s+)?([א-ת]+)\s+(הקרוב|הבא)$/);
if (nextDayMatch) {
  const dayName = nextDayMatch[1];
  const hebrewDays: Record<string, number> = {
    'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3,
    'חמישי': 4, 'שישי': 5, 'שבת': 6,
  };
  if (hebrewDays.hasOwnProperty(dayName)) {
    const targetDay = hebrewDays[dayName];
    let date = getNextWeekday(now, targetDay);
    if (extractedTime) {
      date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
    }
    return { success: true, date: date.toJSDate() };
  }
}
```

#### 2. `ParticipantPhase.ts` (Line 83)
```typescript
// FIX: Stop at location prepositions (ב, ל, מ)
const withPattern = /עם\s+([א-ת\s,ו-]+?)(?:\s+(?:ל?היום|מחר|ב?שעה|ל?שעה|ב-?\d|בשבוע|בחודש|ב[א-ת]|ל[א-ת]|מ[א-ת])|$)/i;
```

### New Regex Additions:
- `ב[א-ת]` - Matches "ב" + any Hebrew letter (e.g., "בקופת", "ברמת")
- `ל[א-ת]` - Matches "ל" + any Hebrew letter (e.g., "למשרד", "לבית")
- `מ[א-ת]` - Matches "מ" + any Hebrew letter (e.g., "מהעבודה")

---

## Manual QA Checklist

### Date Parser Tests:
- [ ] "מה יש לי עוד 10 ימים?"
- [ ] "עוד 5 ימים"
- [ ] "עוד 1 יום"
- [ ] "שבת הקרוב"
- [ ] "ראשון הבא"
- [ ] "יום רביעי הקרוב"

### Participant Tests:
- [ ] "פגישה עם יוסי בקופת חולים כללית"
- [ ] "פגישה עם דני בבית חולים הדסה"
- [ ] "פגישה עם מיכל ברמת גן"
- [ ] "פגישה עם רון למשרד"

### Regression Tests:
- [ ] "מה יש לי היום?"
- [ ] "מה יש לי מחר?"
- [ ] "מה יש לי שבוע הבא?"
- [ ] "פגישה מחר 14:00 עם דוד"

---

## Sign-Off

### Developer:
- [x] Code changes implemented
- [x] Local build successful
- [x] No TypeScript errors

### QA:
- [ ] All test cases passed
- [ ] Regression tests passed
- [ ] Production verification complete

### Deployment:
- [ ] Changes committed to git
- [ ] Pushed to main branch
- [ ] Deployed to production
- [ ] Production smoke test passed
