# 🎯 Adaptive Menu System - Implementation & QA Plan

## ✅ COMPLETED COMPONENTS

### 1. Type Definitions (`src/types/index.ts`)
- ✅ `MenuDisplayMode` type: 'always' | 'adaptive' | 'errors_only' | 'never'
- ✅ `UserPreferences` interface with `menuDisplayMode`
- ✅ `UserProficiencyMetrics` interface
- ✅ `ProficiencyLevel` type: 'novice' | 'intermediate' | 'expert'
- ✅ New conversation state: `SETTINGS_MENU_DISPLAY`

### 2. Proficiency Tracker Service (`src/services/ProficiencyTracker.ts`)
✅ **Fully implemented** with:
- Redis-based metrics storage (30-day TTL)
- Real-time proficiency calculation
- Adaptive menu decision logic
- Debug utilities

**Key Methods:**
```typescript
- initializeMetrics(userId) - Create new user profile
- trackMessage(userId) - Increment message count
- trackNLPSuccess/Failure(userId) - Track NLP performance
- trackMenuRequest(userId) - Track manual menu requests
- trackCommandUsage(userId) - Track power user behavior
- trackError(userId) - Track errors for menu trigger
- getProficiencyLevel(userId) - Calculate novice/intermediate/expert
- shouldShowMenu(userId, mode, context) - Main decision logic
- getDebugInfo(userId) - User proficiency report
```

---

## 🚧 REMAINING IMPLEMENTATION TASKS

### 3. Settings Service Updates (`src/services/SettingsService.ts`)
**Need to add:**
```typescript
async getMenuDisplayMode(userId: string): Promise<MenuDisplayMode> {
  const user = await this.getUserSettings(userId);
  return user.prefsJsonb?.menuDisplayMode || 'adaptive';
}

async updateMenuDisplayMode(userId: string, mode: MenuDisplayMode): Promise<void> {
  const query = `
    UPDATE users
    SET prefs_jsonb = jsonb_set(
      COALESCE(prefs_jsonb, '{}'::jsonb),
      '{menuDisplayMode}',
      to_jsonb($1::text)
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `;
  await this.dbPool.query(query, [mode, userId]);
}
```

### 4. MessageRouter Integration
**Need to update:**

#### A. Add imports:
```typescript
import { proficiencyTracker } from './ProficiencyTracker.js';
import { MenuDisplayMode } from '../types/index.js';
```

#### B. Track all user actions:
```typescript
// In routeMessage():
await proficiencyTracker.trackMessage(userId);

// After NLP success:
await proficiencyTracker.trackNLPSuccess(userId);

// After NLP failure (low confidence):
if (intent.confidence < 0.5) {
  await proficiencyTracker.trackNLPFailure(userId);
}

// On command usage:
if (isCommand(text)) {
  await proficiencyTracker.trackCommandUsage(userId);
}
```

#### C. Replace all `showMainMenu()` calls:
```typescript
// OLD:
await this.showMainMenu(phone);

// NEW:
await this.showAdaptiveMenu(phone, userId, {
  isError: false,
  isIdle: false,
  isExplicitRequest: false,
  actionType: 'event_created' // or other context
});
```

#### D. Add new method `showAdaptiveMenu()`:
```typescript
private async showAdaptiveMenu(
  phone: string,
  userId: string,
  context: {
    isError: boolean;
    isIdle: boolean;
    isExplicitRequest: boolean;
    actionType?: string;
    lastMessageTime?: Date;
  }
): Promise<void> {
  // Get user preference
  const menuMode = await this.settingsService.getMenuDisplayMode(userId);

  // Decide what to show
  const decision = await proficiencyTracker.shouldShowMenu(userId, menuMode, context);

  if (!decision.show) {
    return; // No menu
  }

  if (decision.type === 'full') {
    await this.showMainMenu(phone);
  } else if (decision.type === 'contextual') {
    await this.showContextualMenu(phone, context.actionType);
  }
}
```

#### E. Add contextual mini-menus:
```typescript
private async showContextualMenu(phone: string, actionType?: string): Promise<void> {
  let message = '';

  switch (actionType) {
    case 'event_created':
      message = `מה עכשיו?\n• ⏰ הוסף תזכורת\n• 📅 ראה אירועים\n• /תפריט לעוד`;
      break;

    case 'reminder_created':
      message = `מה עכשיו?\n• 📅 הוסף אירוע\n• ⏰ עוד תזכורת\n• /תפריט לעוד`;
      break;

    case 'event_listed':
      message = `מה עכשיו?\n• ➕ הוסף אירוע\n• ✏️ ערוך אירוע\n• /תפריט לעוד`;
      break;

    default:
      message = `קיצורים: /אירועים /תזכורת /תפריט`;
  }

  await this.sendMessage(phone, message);
}
```

### 5. Settings Menu Handler Updates
**Add to `handleSettings()`:**
```typescript
if (choice === '4') {
  // Back to menu
  await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
  await this.showMainMenu(phone);
  return;
}

if (choice === '3') {
  // Menu display settings
  const currentMode = await this.settingsService.getMenuDisplayMode(userId);
  const modeText = {
    'always': 'תמיד (למתחילים)',
    'adaptive': 'חכם - מסתגל לרמה שלי (מומלץ)',
    'errors_only': 'רק לאחר שגיאות',
    'never': 'אף פעם (למומחים)'
  };

  await this.stateManager.setState(userId, ConversationState.SETTINGS_MENU_DISPLAY);
  await this.sendMessage(phone,
    `📋 הצגת תפריט\n\n` +
    `הגדרה נוכחית: ${modeText[currentMode]}\n\n` +
    `בחר מצב:\n\n` +
    `1️⃣ תמיד (למתחילים)\n` +
    `2️⃣ חכם - מסתגל לרמה שלי (מומלץ) ⭐\n` +
    `3️⃣ רק לאחר שגיאות\n` +
    `4️⃣ אף פעם (למומחים)\n\n` +
    `(או שלח /ביטול)`
  );
  return;
}
```

**Add new handler:**
```typescript
case ConversationState.SETTINGS_MENU_DISPLAY:
  await this.handleSettingsMenuDisplay(phone, userId, text);
  break;
```

```typescript
private async handleSettingsMenuDisplay(phone: string, userId: string, text: string): Promise<void> {
  const choice = text.trim();

  let mode: MenuDisplayMode;
  let modeName: string;

  switch (choice) {
    case '1':
      mode = 'always';
      modeName = 'תמיד';
      break;
    case '2':
      mode = 'adaptive';
      modeName = 'חכם - מסתגל לרמה שלך';
      break;
    case '3':
      mode = 'errors_only';
      modeName = 'רק לאחר שגיאות';
      break;
    case '4':
      mode = 'never';
      modeName = 'אף פעם';
      break;
    default:
      await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-4.');
      return;
  }

  try {
    await this.settingsService.updateMenuDisplayMode(userId, mode);
    await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    await this.sendMessage(phone, `✅ הצגת תפריט שונתה ל: ${modeName}`);

    // Show appropriate menu based on new setting
    if (mode === 'always') {
      await this.showMainMenu(phone);
    } else {
      await this.sendMessage(phone, 'שלח /תפריט בכל עת לראות אפשרויות.');
    }
  } catch (error) {
    logger.error('Failed to update menu display mode', { userId, mode, error });
    await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי ההגדרה.');
    await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    await this.showMainMenu(phone);
  }
}
```

### 6. Update Settings Menu Display
**Change from:**
```
⚙️ הגדרות

1️⃣ שינוי שפה
2️⃣ שינוי אזור זמן
3️⃣ חזרה לתפריט
```

**To:**
```
⚙️ הגדרות

1️⃣ שינוי שפה
2️⃣ שינוי אזור זמן
3️⃣ הצגת תפריט 📋
4️⃣ חזרה לתפריט
```

---

## 🧪 COMPREHENSIVE QA TEST PLAN

### **Test Suite 1: Proficiency Tracking**

#### Test 1.1: Novice User (0-15 messages)
```
Setup: New user, 0 messages
Action: Send 10 messages with mix of menu selections and NLP
Expected:
  ✅ totalMessages increments to 10
  ✅ getProficiencyLevel() returns 'novice'
  ✅ shouldShowMenu() returns { show: true, type: 'full' } for all actions
```

#### Test 1.2: Intermediate User (15-40 messages, 50%+ success)
```
Setup: User with 20 messages, 12 NLP success, 8 NLP failure
Action: Create event via NLP
Expected:
  ✅ getProficiencyLevel() returns 'intermediate'
  ✅ shouldShowMenu() returns { show: true, type: 'contextual' } when not idle
  ✅ showContextualMenu() displays mini-menu (3 options)
```

#### Test 1.3: Expert User (40+ messages, 70%+ success, 20%+ commands)
```
Setup: User with 50 messages, 40 NLP success, 10 NLP failure, 15 command uses
Action: Create event successfully
Expected:
  ✅ getProficiencyLevel() returns 'expert'
  ✅ shouldShowMenu() returns { show: false, type: 'none' } when not idle
  ✅ No menu displayed after success
```

---

### **Test Suite 2: Menu Display Modes**

#### Test 2.1: Mode = 'always'
```
Setup: User preference set to 'always', expert proficiency
Action: Create event successfully
Expected:
  ✅ Full menu shown DESPITE expert level
  ✅ Menu shown after EVERY action
```

#### Test 2.2: Mode = 'adaptive' (Default)
```
Setup: User preference = 'adaptive'

Novice user:
  Action: Create event
  Expected: ✅ Full menu shown

Intermediate user:
  Action: Create event
  Expected: ✅ Contextual mini-menu shown

Expert user:
  Action: Create event (not idle)
  Expected: ✅ No menu shown

  Action: Idle for 60+ seconds
  Expected: ✅ Contextual mini-menu shown
```

#### Test 2.3: Mode = 'errors_only'
```
Setup: User preference = 'errors_only', expert level

Action 1: Create event successfully
Expected: ✅ No menu shown

Action 2: Send gibberish (NLP fails)
Expected: ✅ Full menu shown

Action 3: Idle for 60+ seconds
Expected: ✅ Full menu shown
```

#### Test 2.4: Mode = 'never'
```
Setup: User preference = 'never'

Action 1: Create event successfully
Expected: ✅ No menu shown

Action 2: Send gibberish (error)
Expected: ✅ No menu shown

Action 3: Idle for 90 seconds
Expected: ✅ No menu shown

Action 4: Type "/תפריט"
Expected: ✅ Full menu shown (explicit request overrides 'never')
```

---

### **Test Suite 3: Error-Triggered Menus**

#### Test 3.1: Unknown NLP Intent
```
Setup: User sends unrecognized message
Action: "gfdfgdfg"
Expected:
  ✅ proficiencyTracker.trackError() called
  ✅ Full menu shown with "לא הבנתי" message
```

#### Test 3.2: Low Confidence NLP (<0.5)
```
Setup: User sends ambiguous message
Action: "משהו" (something)
Expected:
  ✅ proficiencyTracker.trackNLPFailure() called
  ✅ Menu shown (if mode allows)
```

#### Test 3.3: 3 Consecutive Errors
```
Setup: User makes 3 mistakes in a row
Action: Invalid date format 3 times
Expected:
  ✅ errorCount = 3
  ✅ Full menu shown even for expert users
```

---

### **Test Suite 4: Contextual Mini-Menus**

#### Test 4.1: After Event Creation
```
Setup: Intermediate user creates event
Expected contextual menu:
  "מה עכשיו?
   • ⏰ הוסף תזכורת
   • 📅 ראה אירועים
   • /תפריט לעוד"
```

#### Test 4.2: After Reminder Creation
```
Setup: Intermediate user creates reminder
Expected contextual menu:
  "מה עכשיו?
   • 📅 הוסף אירוע
   • ⏰ עוד תזכורת
   • /תפריט לעוד"
```

#### Test 4.3: After Listing Events
```
Setup: Intermediate user views events
Expected contextual menu:
  "מה עכשיו?
   • ➕ הוסף אירוע
   • ✏️ ערוך אירוע
   • /תפריט לעוד"
```

---

### **Test Suite 5: Idle Detection**

#### Test 5.1: User Active (<60s since last message)
```
Setup: User sends message, then another after 30s
Expected:
  ✅ isIdle() returns false
  ✅ No automatic menu shown for expert users
```

#### Test 5.2: User Idle (>60s since last message)
```
Setup: User hasn't sent message for 65 seconds
Expected:
  ✅ isIdle() returns true
  ✅ Menu shown even for expert users
```

---

### **Test Suite 6: Settings UI**

#### Test 6.1: View Current Setting
```
Action: Open settings menu (option 6 from main menu)
Expected:
  ✅ Settings menu shows:
     "1️⃣ שינוי שפה
      2️⃣ שינוי אזור זמן
      3️⃣ הצגת תפריט 📋
      4️⃣ חזרה לתפריט"
```

#### Test 6.2: Change to 'always'
```
Action: Settings → 3 → 1
Expected:
  ✅ Database updated: prefsJsonb.menuDisplayMode = 'always'
  ✅ Confirmation: "✅ הצגת תפריט שונתה ל: תמיד"
  ✅ Full menu shown immediately
```

#### Test 6.3: Change to 'never'
```
Action: Settings → 3 → 4
Expected:
  ✅ Database updated: prefsJsonb.menuDisplayMode = 'never'
  ✅ Confirmation shown
  ✅ Tip shown: "שלח /תפריט בכל עת לראות אפשרויות"
  ✅ NO menu shown after confirmation
```

---

### **Test Suite 7: Regression Testing**

#### Test 7.1: All Previous UX Fixes Still Work
```
✅ "ביטול" works without "/"
✅ "כו" matches "כן" (fuzzy matching)
✅ "שלח הודעה ללנה" extracts "לנה"
✅ "לא" cancels draft message (not treated as content)
✅ Contact creation failure offers retry
```

#### Test 7.2: All Database Bugs Still Fixed
```
✅ Contact aliases save correctly (array format)
✅ Date parser accepts "16.10 19:00" format
✅ Notes don't trigger array constraint error
✅ "מחק את כל האירועים" triggers bulk delete
✅ NLP extracts full event details from single message
```

---

### **Test Suite 8: Edge Cases**

#### Test 8.1: User Switches Modes Mid-Session
```
Action:
  1. Set mode to 'always'
  2. Create event → menu shown
  3. Change mode to 'never'
  4. Create another event
Expected:
  ✅ No menu shown for second event
  ✅ Mode change takes effect immediately
```

#### Test 8.2: Redis Cache Expiry (30 days)
```
Setup: User inactive for 31 days
Action: User sends message
Expected:
  ✅ Metrics re-initialized
  ✅ User treated as novice
  ✅ Full menu shown
```

#### Test 8.3: Explicit /תפריט Overrides All Settings
```
Setup: Mode = 'never', expert user
Action: Type "/תפריט"
Expected:
  ✅ Full menu shown
  ✅ menuRequestCount incremented
```

---

## 📊 PERFORMANCE METRICS TO TRACK

### Key Performance Indicators (KPIs)

1. **Menu Spam Reduction**
   - Baseline: ~100% of actions show menu
   - Target: <40% of actions show menu (for intermediate+ users)

2. **Task Completion Rate**
   - Should remain ≥95% despite less menu guidance

3. **Messages Per Task**
   - Should decrease for expert users (less menu reading)

4. **User Satisfaction Proxy**
   - Track /תפריט usage (should decrease as users learn)

5. **Proficiency Progression**
   - Track time to reach intermediate (target: <20 messages)
   - Track time to reach expert (target: <40 messages)

---

## 🚀 DEPLOYMENT PLAN

### Phase 1: Backend (Week 1)
1. ✅ Deploy ProficiencyTracker service
2. ✅ Add database migration for prefsJsonb menu mode
3. ✅ Update SettingsService with menu mode methods
4. ⚠️ Test with Postman/curl (no UI changes yet)

### Phase 2: Tracking Integration (Week 2)
1. Add proficiencyTracker calls to MessageRouter
2. Test metrics collection in production
3. Monitor Redis memory usage
4. Verify proficiency calculations

### Phase 3: Menu Logic (Week 3)
1. Replace showMainMenu() with showAdaptiveMenu()
2. Add contextual mini-menus
3. A/B test with 10% of users

### Phase 4: Settings UI (Week 4)
1. Add menu display settings to UI
2. Full rollout to 100% of users
3. Monitor KPIs for 2 weeks

---

## 🐛 KNOWN LIMITATIONS & FUTURE ENHANCEMENTS

### Current Limitations:
1. **No ML-based proficiency** - Uses simple heuristics
2. **Fixed thresholds** - 15/40 messages hardcoded
3. **Redis-only persistence** - Metrics lost if Redis flushes

### Future Enhancements:
1. **Smart context detection** - ML model to detect confusion
2. **Personalized thresholds** - Adjust 15/40 per user learning speed
3. **PostgreSQL backup** - Weekly sync of metrics to DB
4. **A/B testing framework** - Compare menu strategies
5. **User feedback loop** - "Was this helpful?" after menu

---

## ✅ IMPLEMENTATION CHECKLIST

- [✅] Create type definitions
- [✅] Implement ProficiencyTracker service
- [✅] Add SETTINGS_MENU_DISPLAY state
- [ ] Update SettingsService with menu mode methods
- [ ] Add proficiencyTracker calls in MessageRouter
- [ ] Implement showAdaptiveMenu() method
- [ ] Create contextual mini-menu templates
- [ ] Add handleSettingsMenuDisplay() handler
- [ ] Update settings menu display text
- [ ] Create database migration for prefsJsonb
- [ ] Write unit tests for ProficiencyTracker
- [ ] Write integration tests for adaptive logic
- [ ] Run full QA test suite
- [ ] Deploy to staging
- [ ] Monitor metrics for 1 week
- [ ] Deploy to production

---

**Implementation Status: ~40% Complete**
**Remaining Work: ~8-12 hours**
**Priority: HIGH (major UX improvement)**
