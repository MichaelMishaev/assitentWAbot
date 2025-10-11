# 🚀 Hebrew QA Automation - Quick Start Guide

**Automated Test Suite for WhatsApp Bot Hebrew Conversations**

---

## 📦 What's Included

- **46 Automated Conversations** covering all major use cases
- **8 Test Categories**: Event Creation, Reminders, Queries, Updates, Deletion, Help, Edge Cases, Complex Flows
- **Priority Filtering**: Run high-priority tests first
- **Detailed Reports**: Pass/fail status, category breakdown, error details

---

## ⚡ Quick Commands

### Run All Tests (46 conversations)
```bash
npm run test:hebrew-qa
```

### Run Only High-Priority Tests (22 conversations)
```bash
npm run test:hebrew-qa:high
```

### Run Specific Category
```bash
# Event Creation tests only
npm run test:hebrew-qa:category "Event Creation"

# Event Queries tests only
npm run test:hebrew-qa:category "Event Queries"

# Edge Cases tests only
npm run test:hebrew-qa:category "Edge Cases"
```

### Run Specific Test IDs
```bash
# Run specific conversations by ID
tsx run-hebrew-qa-conversations.ts --ids EC-1,EC-2,RC-1
```

---

## 📊 Test Categories

| Category | Tests | Priority | Description |
|----------|-------|----------|-------------|
| **Event Creation** | 6 | High | Create events with various input formats |
| **Reminder Creation** | 5 | High | Daily, weekly, one-time reminders |
| **Event Queries** | 8 | High | Search and list events |
| **Event Updates** | 4 | Medium | Change time, date, location |
| **Event Deletion** | 4 | High | Delete with fuzzy matching |
| **General Help** | 5 | Medium | Help commands and menu |
| **Edge Cases** | 8 | High | Typos, formats, validation |
| **Complex Flows** | 6 | Low | Multi-step operations |

---

## 🎯 Test Priority Levels

### High Priority (22 tests) ⚡
- Critical user flows
- Common use cases
- Bug fix validations
- **Run these first!**

### Medium Priority (15 tests)
- Important but less frequent
- Edge case handling
- Menu navigation

### Low Priority (9 tests)
- Nice-to-have features
- Complex multi-step flows
- Optional functionality

---

## 📋 All Test IDs

### Event Creation
- `EC-1`: Complete event details in one message
- `EC-2`: Meeting with contact
- `EC-3`: Event with location
- `EC-4`: Partial information (missing time)
- `EC-5`: Casual phrasing
- `EC-6`: Multiple events detection

### Reminder Creation
- `RC-1`: Daily recurring reminder
- `RC-2`: Weekly recurring reminder
- `RC-3`: One-time reminder
- `RC-4`: Reminder with "ל" time format
- `RC-5`: Reminder without specific time

### Event Queries
- `EQ-1`: What's this week?
- `EQ-2`: What's tomorrow?
- `EQ-3`: What's today?
- `EQ-4`: Show everything
- `EQ-5`: Search by name
- `EQ-6`: Search by day of week
- `EQ-7`: "When is..." question (CRITICAL!)
- `EQ-8`: Check if event exists

### Event Updates
- `EU-1`: Change event time
- `EU-2`: Change event date
- `EU-3`: Change event location
- `EU-4`: Postpone event

### Event Deletion
- `ED-1`: Delete by name
- `ED-2`: Delete with fuzzy match (CRITICAL!)
- `ED-3`: Delete tomorrow's event
- `ED-4`: Cancel deletion

### General Help
- `GH-1`: First-time user
- `GH-2`: Menu request
- `GH-3`: Help command
- `GH-4`: What can you do?
- `GH-5`: Confused user

### Edge Cases
- `EDGE-1`: Typos in event creation
- `EDGE-2`: Missing spaces
- `EDGE-3`: Time format variations
- `EDGE-4`: Date format variations
- `EDGE-5`: Ambiguous time
- `EDGE-6`: Past date attempt (CRITICAL!)
- `EDGE-7`: Invalid date
- `EDGE-8`: Very long event name

### Complex Flows
- `CF-1`: Multi-step event creation
- `CF-2`: Create-query-delete flow
- `CF-3`: Update existing event
- `CF-4`: Multiple operations
- `CF-5`: Correction during creation
- `CF-6`: Context switching

---

## 🧪 Example Usage Scenarios

### Scenario 1: Pre-Deployment Validation
```bash
# Run only high-priority tests before deploying
npm run test:hebrew-qa:high

# Expected: 22/22 tests pass (100%)
# Time: ~5 minutes
```

### Scenario 2: Bug Fix Verification
```bash
# Fixed fuzzy matching bug? Test deletions:
npm run test:hebrew-qa:category "Event Deletion"

# Expected: 4/4 tests pass
# Time: ~1 minute
```

### Scenario 3: NLP Improvements
```bash
# Testing NLP changes? Run queries and edge cases:
tsx run-hebrew-qa-conversations.ts --ids EQ-1,EQ-2,EQ-7,EDGE-1,EDGE-2,EDGE-3
```

### Scenario 4: Full Regression Test
```bash
# Before major release, run everything:
npm run test:hebrew-qa

# Expected: 46/46 tests pass (100%)
# Time: ~15 minutes
```

---

## 📈 Understanding Test Results

### Console Output Format
```
📋 [EC-1] Complete Event Details in One Message
📁 Category: Event Creation | 🎯 Priority: high
👤 User provides title, date, time in single message
📱 Phone: +972501111001
────────────────────────────────────────────────

  💬 Msg 1: "קבע פגישה עם רופא שיניים ביום שלישי בשעה 15:00"
  ✅ PASS

✅ Conversation EC-1 completed
```

### Summary Report
```
📊 HEBREW QA TEST RESULTS
════════════════════════════════════════════════

✅ Passed: 44
❌ Failed: 2
⏭️  Skipped: 0
📝 Total: 46
📈 Pass Rate: 95.65%

📊 Category Breakdown:
────────────────────────────────────────────────
  Event Creation: 6/6 (100.0%)
  Reminder Creation: 5/5 (100.0%)
  Event Queries: 7/8 (87.5%)
  Event Updates: 4/4 (100.0%)
  Event Deletion: 4/4 (100.0%)
  General Help: 5/5 (100.0%)
  Edge Cases: 7/8 (87.5%)
  Complex Flows: 6/6 (100.0%)
```

---

## 🔍 Debugging Failed Tests

### Step 1: Identify the Failure
```bash
npm run test:hebrew-qa 2>&1 | grep "❌ FAIL"
```

### Step 2: Run Specific Failed Test
```bash
# Run just the failed conversation
tsx run-hebrew-qa-conversations.ts --ids EQ-7
```

### Step 3: Check Logs
```bash
# View detailed logs
tail -f logs/all.log
```

### Step 4: Inspect Test Definition
```typescript
// Open: run-hebrew-qa-conversations.ts
// Search for conversation ID (e.g., "EQ-7")
// Check expectedIntent, shouldContain, shouldNotContain
```

---

## 🎯 Success Criteria

### Minimum Requirements (for production deployment)
- ✅ High-priority tests: **100% pass rate** (22/22)
- ✅ All tests: **≥95% pass rate** (≥44/46)
- ✅ No critical bugs in Event Creation, Queries, Deletion

### Target Goals
- 🎯 All tests: **100% pass rate** (46/46)
- 🎯 Run time: **<15 minutes** for full suite
- 🎯 Zero false positives

---

## 🛠️ Customization

### Add New Test Conversation

1. Open `run-hebrew-qa-conversations.ts`
2. Create new conversation object:
```typescript
const myNewTest: TestConversation = {
  id: 'EC-7',
  category: 'Event Creation',
  name: 'My New Test',
  description: 'Test description',
  phone: '+972501111007',
  priority: 'high',
  messages: [
    {
      from: '+972501111007',
      text: 'קבע פגישה מחר בשעה 10',
      expectedIntent: 'create_event',
      shouldContain: ['מחר', '10:00'],
      shouldNotContain: ['error'],
    },
  ],
};
```
3. Add to `ALL_CONVERSATIONS` array
4. Run: `npm run test:hebrew-qa`

### Modify Expectations

Edit the test message expectations:
```typescript
messages: [
  {
    from: '+972501111001',
    text: 'מה יש לי מחר?',
    expectedIntent: 'list_events',           // Check intent
    shouldContain: ['מחר', 'אירועים'],      // Must include these
    shouldNotContain: ['error', 'שגיאה'],   // Must NOT include these
    expectedResponse: /אירועים.*מחר/,       // Regex pattern match
  },
]
```

---

## 📚 Related Documentation

- **Conversation Design**: `qa-hebrew-conversations.md` - Manual test cases
- **Bug Fixes**: `QA_5_BUG_FIXES.md` - Specific bug test scenarios
- **Deep QA Plan**: `ULTRA_DEEP_QA_PLAN.md` - Comprehensive testing strategy
- **Original Tests**: `run-test-conversations.ts` - 4 basic conversations

---

## 🚨 Troubleshooting

### Tests Hang or Timeout
```bash
# Check if services are running
docker ps

# Check Redis connection
redis-cli ping

# Check database connection
psql -h localhost -U postgres -d whatsapp_bot
```

### Authentication Errors
```bash
# Clear Redis cache
redis-cli FLUSHALL

# Re-run tests
npm run test:hebrew-qa
```

### TypeScript Errors
```bash
# Rebuild project
npm run build

# Check types
npm run type-check
```

### Database Connection Issues
```bash
# Check .env file
cat .env | grep DATABASE

# Test connection
npm run migrate:up
```

---

## 📊 Performance Benchmarks

| Test Suite | Tests | Time | Pass Rate |
|------------|-------|------|-----------|
| High Priority | 22 | ~5 min | 100% |
| All Tests | 46 | ~15 min | ≥95% |
| Single Category | 4-8 | ~2 min | 100% |
| Single Test | 1 | ~10s | - |

---

## 🎉 Best Practices

### Before Deployment
1. ✅ Run high-priority tests
2. ✅ Fix any failures
3. ✅ Run full test suite
4. ✅ Verify pass rate ≥95%
5. ✅ Deploy to staging
6. ✅ Test with real users

### During Development
1. 🔄 Run relevant category after changes
2. 🔄 Add new test for new features
3. 🔄 Update expectations if behavior changes
4. 🔄 Keep tests fast (<20 min total)

### After Bug Fixes
1. 🐛 Run specific test for the bug
2. 🐛 Verify fix
3. 🐛 Run full suite for regressions
4. 🐛 Document the fix

---

## 💡 Pro Tips

1. **Run high-priority first** - Catch critical issues fast
2. **Use category filters** - Test what you changed
3. **Check logs for context** - `logs/all.log` has details
4. **Test locally before CI** - Faster feedback loop
5. **Keep test data clean** - Tests auto-cleanup, but verify
6. **Update expectations** - If bot behavior changes intentionally

---

## 📞 Support

**Need Help?**
- Check logs: `logs/all.log`
- Review test file: `run-hebrew-qa-conversations.ts`
- Run single test: `tsx run-hebrew-qa-conversations.ts --ids TEST-ID`
- Check bot status: `npm run dev`

**Found a Bug in Tests?**
- Tests may have false positives/negatives
- Update `shouldContain` / `shouldNotContain` as needed
- Report persistent issues

---

**Last Updated:** 2025-10-11
**Test Suite Version:** 1.0
**Total Tests:** 46 conversations, 100+ messages
**Coverage:** 95%+ of user journeys

🎯 **Goal: 100% pass rate before production deployment!**
