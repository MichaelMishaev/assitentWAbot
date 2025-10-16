# Bug Fix: Participant Extraction Not Reflected in Event Title

**Date**: 2025-10-15
**Issue**: User asks "קבע פגישה עם איתי להיום לשעה 20:30" but bot creates just "פגישה" without participant "איתי"

## Root Cause Analysis

The bug had TWO distinct issues:

### Issue #1: Participants Not Included in Adapter
**Location**: `src/routing/NLPRouter.ts:258-266`

The V2 Pipeline correctly detected participants in Phase 9 (ParticipantPhase) and stored them in `context.entities.participants`, but the adapter that converts V2 entities to the old format was NOT copying participants to the `adaptedResult.event` object.

**Before**:
```typescript
event: {
  title: entities.title,
  date: entities.date,
  dateText: entities.dateText,
  location: entities.location,
  contactName: entities.contactName,
  notes: entities.notes,
  deleteAll: entities.deleteAll,
  // ❌ Missing: participants field!
},
```

**After**:
```typescript
event: {
  title: entities.title,
  date: entities.date,
  dateText: entities.dateText,
  location: entities.location,
  contactName: entities.contactName,
  notes: entities.notes,
  deleteAll: entities.deleteAll,
  participants: entities.participants, // ✅ FIX: Include participants from Phase 9
},
```

### Issue #2: Participants Not Formatted Into Event Title
**Location**: `src/routing/NLPRouter.ts:472-491`

Even if participants were detected, they were never appended to the event title when creating the event in the database.

**Before**:
```typescript
const newEvent = await this.eventService.createEvent({
  userId,
  title: event.title, // ❌ Raw title without participants
  startTsUtc: eventDate,
  location: event.location || undefined,
  rrule: event.recurrence || undefined
});
```

**After**:
```typescript
// ✅ FIX: Format participants and append to title (e.g., "פגישה" -> "פגישה עם איתי")
let eventTitle = event.title;
if (event.participants && event.participants.length > 0) {
  const participantNames = event.participants.map((p: any) => p.name).join(' ו');
  eventTitle = `${event.title} עם ${participantNames}`;
  logger.info('Appended participants to event title', {
    originalTitle: event.title,
    participants: event.participants.map((p: any) => p.name),
    finalTitle: eventTitle
  });
}

const newEvent = await this.eventService.createEvent({
  userId,
  title: eventTitle, // ✅ Title with participants
  startTsUtc: eventDate,
  location: event.location || undefined,
  rrule: event.recurrence || undefined
});
```

### Issue #3: Clarification State Not Using Participant-Enhanced Title
**Location**: `src/routing/NLPRouter.ts:445-459`

When the bot asks for time clarification, it was also not showing participants in the title.

**Fix Applied**:
```typescript
// ✅ FIX: Format participants for clarification state too
let eventTitleForState = event.title;
if (event.participants && event.participants.length > 0) {
  const participantNames = event.participants.map((p: any) => p.name).join(' ו');
  eventTitleForState = `${event.title} עם ${participantNames}`;
}

await this.sendMessage(phone, `📌 ${eventTitleForState}\n📅 ${dt.toFormat('dd/MM/yyyy')}\n\n⏰ באיזו שעה?...`);
await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_TIME, {
  title: eventTitleForState, // ✅ Use participant-enhanced title
  date: eventDate.toISOString(),
  location: event.location,
  notes: event.contactName ? `עם ${event.contactName}` : undefined,
  fromNLP: true
});
```

## How Participant Detection Works

The V2 Pipeline has 10 phases. Phase 9 (ParticipantPhase) detects participants using regex patterns:

**Pattern 1**: "עם X" - Single participant
```typescript
const withPattern = /עם\s+([א-ת\s,ו-]+?)(?:\s+(?:ל?היום|מחר|ב?שעה|ל?שעה|ב-?\d|בשבוע|בחודש)|$)/i;
```

Example: "פגישה עם איתי להיום" → detects "איתי"

**Pattern 2**: "עם X ו-Y" - Multiple participants
```typescript
const names = namesText.split(/\s*[ו,]\s*/).map(name => name.trim());
```

Example: "פגישה עם דוד ומשה" → detects ["דוד", "משה"]

**Pattern 3**: Group names
```typescript
const groupPattern = /עם\s+(המשפחה|הצוות|החברים|הקבוצה)/i;
```

Example: "אירוע עם המשפחה" → detects "המשפחה"

## Expected Behavior After Fix

### Test Case 1: Single Participant
**Input**: "קבע פגישה עם איתי להיום לשעה 20:30"

**Expected Output**:
- ✅ Phase 9 detects participant: `{name: "איתי", role: "primary"}`
- ✅ Adapter includes participants in event object
- ✅ Event created with title: "פגישה עם איתי"
- ✅ Confirmation message shows: "15/10/2025 - פגישה עם איתי ✅ 20:30"

### Test Case 2: Multiple Participants
**Input**: "קבע פגישה עם דוד ומשה מחר ב-14:00"

**Expected Output**:
- ✅ Phase 9 detects participants: `[{name: "דוד", role: "primary"}, {name: "משה", role: "companion"}]`
- ✅ Event created with title: "פגישה עם דוד ומשה"

### Test Case 3: No Participants
**Input**: "קבע פגישה להיום לשעה 20:30"

**Expected Output**:
- ✅ Phase 9 returns empty participants array
- ✅ Event created with title: "פגישה"

## Files Modified

1. **src/routing/NLPRouter.ts**
   - Line 266: Added `participants: entities.participants` to adapter
   - Lines 473-483: Added participant formatting logic before event creation
   - Lines 445-450: Added participant formatting for clarification state

## Related Components

- **Phase 9**: `src/domain/phases/phase9-participants/ParticipantPhase.ts` - Detects participants
- **Phase Context**: `src/domain/orchestrator/PhaseContext.ts` - Defines `ExtractedEntities.participants`
- **Event Service**: `src/services/EventService.ts` - Creates events with title
- **Participant Regex**: `src/domain/phases/phase9-participants/ParticipantPhase.ts:82` - Regex with date keyword stoppers

## Testing Recommendations

1. Test with single participant: "קבע פגישה עם איתי"
2. Test with multiple participants: "קבע פגישה עם דוד ומשה"
3. Test with group: "קבע אירוע עם המשפחה"
4. Test without participants: "קבע פגישה"
5. Test edge case: "קבע פגישה עם איתי ומשה ודוד" (3+ participants)

## Previous Related Fixes

This bug is related to a previous fix in ParticipantPhase (line 82) where we added date/time keyword stoppers to prevent false matches:

```typescript
const withPattern = /עם\s+([א-ת\s,ו-]+?)(?:\s+(?:ל?היום|מחר|ב?שעה|ל?שעה|ב-?\d|בשבוע|בחודש)|$)/i;
```

Without these stoppers, "עם איתי להיום" would capture "איתי להיום" instead of just "איתי".

## Impact

**Before Fix**: Participants were detected but not shown in event titles, making it confusing for users.

**After Fix**: Events show full context with participants (e.g., "פגישה עם איתי" instead of just "פגישה").

**Regression Risk**: Low - Only adds formatting to existing detection logic.
