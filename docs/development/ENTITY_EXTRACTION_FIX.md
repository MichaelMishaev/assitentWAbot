# Entity Extraction Bug Fix - Date Format & Time Parsing

## Issue Report
**Date:** 2025-10-13
**Reporter:** User (WhatsApp)
**Severity:** HIGH - Production bug preventing event creation

## Problem
User sent the message:
```
קבע מינישה ל 18.10 לשעה 14, פגישה עם מוטי. לא לשכוח להביא מזומנים
```

Bot responded with error:
```
לא זיהיתי את כל הפרטים. אנא נסה שוב או השתמש בתפריט לייצר אירוע.
```

The ensemble AI (3 models) correctly identified the intent as `create_event`, but **entity extraction failed** to extract the date and time.

## Root Causes

### 1. Date Format Not Supported
**File:** `src/domain/phases/phase3-entity-extraction/EntityExtractor.ts:200`

The regex pattern only supported slashes `/` and dashes `-` as date separators:
```typescript
const absoluteDatePattern = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;
```

User wrote "18.10" with a **dot (.)**, which was not recognized.

### 2. Time Without Minutes Not Supported
**File:** `src/domain/phases/phase3-entity-extraction/EntityExtractor.ts:123`

The time pattern required either:
- A colon with minutes: "לשעה 14:30"
- Very specific prefixes: "בשעה", "ב-", "ל"

User wrote "לשעה 14" (hour without minutes), which partially matched but created confusion with the date "ל 18.10".

### 3. Extraction Order Bug
Time patterns were checked **before** date patterns, causing "ל 18" to be interpreted as a time instead of part of the date "ל 18.10".

### 4. Hebrew Regex Word Boundary Issue
**File:** `src/domain/phases/phase3-entity-extraction/EntityExtractor.ts:335`

Contact extraction used `\b` word boundary, which **doesn't work with Hebrew characters** in JavaScript regex:
```typescript
/\bעם\s+([א-ת]+)/gi  // ❌ FAILS
```

Additionally, the Hebrew character class `[א-ת]` doesn't properly match all Hebrew letters in JavaScript.

## Fixes Applied

### Fix 1: Support Dot Notation for Dates
```typescript
// BEFORE
const absoluteDatePattern = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;

// AFTER
const absoluteDatePattern = /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/;
//                                        ^^^                        ^^^ Added dot support
```

### Fix 2: Better Time Pattern Matching
```typescript
// BEFORE
const timePatterns = [
  /(?:בשעה|ב-|ל|לשעה|ב)\s*(\d{1,2}):(\d{2})/gi,
  /(?:בשעה|ב-|ל)\s*(\d{1,2})\s*(?:בבוקר|בערב|אחרי הצהריים)?/gi,
];

// AFTER
const timePatterns = [
  /(?:בשעה|ב-|לשעה)\s*(\d{1,2}):(\d{2})/gi,  // With colon
  /(?:בשעה|לשעה)\s*(\d{1,2})\s*(?:בבוקר|בערב|אחרי הצהריים)?/gi,  // Without colon
];
```

### Fix 3: Extract Dates Before Times
```typescript
// BEFORE
private extractDateTime(text: string, entities: ExtractedEntities, timezone: string): void {
  // Time patterns checked first
  const timePatterns = [...];
  // Date patterns checked second
  const absoluteDatePattern = [...];
}

// AFTER
private extractDateTime(text: string, entities: ExtractedEntities, timezone: string): void {
  // ✅ DATES FIRST - to avoid confusion with times
  const absoluteDatePattern = /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/;
  // ... extract date ...

  // ✅ TIMES SECOND - after date is extracted
  const timePatterns = [...];
}
```

### Fix 4: Use Unicode Ranges for Hebrew
```typescript
// BEFORE
/\bעם\s+([א-ת]+)/gi  // ❌ Word boundary + character class don't work with Hebrew

// AFTER
/עם\s+([\u05D0-\u05EA]+)/gi  // ✅ Unicode range U+05D0-U+05EA (א-ת)
```

### Fix 5: Update AI Model Prompts
Updated prompts in both `NLPService.ts` (GPT) and `GeminiNLPService.ts` (Gemini) to explicitly mention dot notation support:

```typescript
EXPLICIT DATES (CRITICAL - Support all separator types):
- "05/01/2025", "1.5.25", "18.10", "18/10", "18-10" → explicit date (dots, slashes, dashes all valid)
- IMPORTANT: "18.10" means October 18th (DD.MM format)

TIME OF DAY (CRITICAL - Extract ALL time formats, including WITHOUT colons):
- "לשעה 14" (NO colon) → EXACTLY 14:00 with 00 minutes (user didn't specify minutes)
```

## Test Results

**Original Message:**
```
קבע מינישה ל 18.10 לשעה 14, פגישה עם מוטי. לא לשכוח להביא מזומנים
```

**Extracted Entities:**
```javascript
{
  title: "מינישה פגישה . לא לשכוח להביא מזומנים",
  date: 2025-10-18T14:00:00.000Z,  // ✅ October 18, 2025 at 14:00
  dateText: "לשעה 14",
  time: "14:00",                     // ✅ 2 PM
  contactNames: ["מוטי"],            // ✅ Contact extracted
  confidence: {
    title: 0.90,
    date: 0.98,                      // ✅ High confidence
    time: 0.95,                      // ✅ High confidence
    location: 0
  }
}
```

✅ **All required entities extracted successfully!**

## Files Modified

1. `src/domain/phases/phase3-entity-extraction/EntityExtractor.ts`
   - Fixed date pattern to support dots
   - Fixed time pattern to support hours without minutes
   - Reordered extraction (dates before times)
   - Fixed contact extraction to use Unicode ranges
   - Fixed title cleaning regex

2. `src/services/NLPService.ts`
   - Updated GPT-4o-mini prompt with explicit date/time format examples

3. `src/services/GeminiNLPService.ts`
   - Updated Gemini 2.0 Flash prompt with explicit date/time format examples

## Deployment

**Status:** ✅ Fixed and ready for deployment

**How to Deploy:**
```bash
# Build and restart
npm run build
pm2 restart all

# Or deploy to Railway/DigitalOcean
git add .
git commit -m "Fix: Support dot notation in dates and time without minutes"
git push origin main
```

## Prevention

To prevent similar issues in the future:

1. **Add Integration Tests** - Test with real user messages (especially edge cases)
2. **Regex Test Suite** - Test all regex patterns with various Hebrew formats
3. **Logging** - Add debug logging for entity extraction failures
4. **Fallback Prompts** - Improve AI model prompts with more examples

## Related Issues

- User feedback: "#i asked to add a comment in prompt, I do not see it. Bug" → Separate issue, already fixed
- Hebrew calendar matching bug → Recently fixed (commit c92d950)

## Notes

- The word "מינישה" (minisha) is non-standard Hebrew, likely a typo or nickname
- The system still successfully extracted all critical data (date, time, contact) despite the unusual word
- The ensemble AI system (3 models) correctly identified the intent, showing the architecture is working well

---

**Generated:** 2025-10-13
**Fixed by:** Claude Code
**Impact:** HIGH - Unblocks event creation for users using dot notation dates
