# 🎯 Long Conversation QA Testing Guide

## What This Tests

Your bot will go through **67 message exchanges** across 5 long conversation scenarios:

1. **Event Lifecycle (10 turns)** - Create → Search → Update → Comment → Reminder → Delete
2. **Context Retention (15 turns)** - Tests if bot remembers context across many messages
3. **Multi-Topic Switching (12 turns)** - Rapid topic changes between events, reminders, tasks
4. **Edge Cases (10 turns)** - Ambiguous inputs, corrections, error handling
5. **Stress Test (20 turns)** - Many operations in sequence without degradation

**Total: 67 turns testing logical conversation flow**

---

## 🚀 How to Run

### Option 1: Run Locally (Safe - No Production Impact)

```bash
# Run all long conversation tests locally
npm run test:conversations -- long-conversation
```

This will test against your **local development** bot.

---

### Option 2: Run on Production (When You Say!)

```bash
# ⚠️  THIS SENDS REAL MESSAGES TO PRODUCTION!
./scripts/run-production-qa.sh --production +972XXXXXXXXX
```

**Requirements:**
- ✅ Production bot must be running
- ✅ Phone number must be registered with the bot
- ✅ You must type "YES" to confirm

**What happens:**
1. Sends 67 real WhatsApp messages to production
2. Tests full conversation flows
3. Validates responses
4. Reports pass/fail

---

## 📊 Test Scenarios Explained

### Scenario 1: Event Lifecycle (10 turns)

```
Turn 1:  Create event with Danny
Turn 2:  Confirm event creation
Turn 3:  Search for the event
Turn 4:  Update location
Turn 5:  Add comment
Turn 6:  View comments
Turn 7:  Add reminder before event
Turn 8:  Check upcoming events
Turn 9:  Update time
Turn 10: Delete event
```

**Tests:**
- ✅ Event creation flow
- ✅ Search accuracy
- ✅ Update operations
- ✅ Comment system
- ✅ Reminder integration
- ✅ Deletion

---

### Scenario 2: Context Retention (15 turns)

```
Turn 1-5:   Build event step-by-step (title → date → time → location)
Turn 6:     Verify event created with all details
Turn 7:     Create different event (context switch)
Turn 8:     Search for first event again
Turn 9:     Create reminder for second event
Turn 10:    List all events
Turn 11-12: Update first event and verify
Turn 13:    Add comment to second event
Turn 14:    List reminders
Turn 15:    Delete second event
```

**Tests:**
- ✅ Multi-step input flow
- ✅ Context preservation across turns
- ✅ Switching between different entities
- ✅ Memory of previous interactions

---

### Scenario 3: Multi-Topic Switching (12 turns)

```
Rapid switching between:
- Events (client meeting)
- Reminders (buy gift)
- Tasks (quarterly report)
```

**Tests:**
- ✅ Topic switch handling
- ✅ No confusion between entities
- ✅ Accurate responses after switches
- ✅ Maintaining state per entity type

---

### Scenario 4: Edge Cases (10 turns)

```
- Ambiguous dates ("Tuesday" - which one?)
- Non-existent searches
- Typos in names (fuzzy matching)
- Non-specific updates
- Past dates (should warn/reject)
- Ambiguous deletes
```

**Tests:**
- ✅ Clarification requests
- ✅ Error handling
- ✅ Fuzzy name matching
- ✅ Date validation
- ✅ Graceful failures

---

### Scenario 5: Stress Test (20 turns)

```
Create 4 events + 2 reminders
Then:
- List all
- Search specific
- Update multiple
- Add comments
- Delete some
- Verify state
```

**Tests:**
- ✅ Performance with multiple items
- ✅ No degradation over 20 turns
- ✅ Accurate state management
- ✅ Correct filtering and search

---

## 🎯 Success Criteria

**Each scenario must:**
- ✅ Complete all turns without errors
- ✅ Respond correctly to each message
- ✅ Maintain context throughout
- ✅ Handle edge cases gracefully
- ✅ End with correct final state

**Overall test passes if:**
- ✅ 5/5 scenarios pass (100%)
- ⚠️  4/5 scenarios pass (80% - acceptable)
- ❌ <4/5 scenarios pass (FAIL - needs fixes)

---

## 🔍 What Gets Tested

### Bot Capabilities:
- ✅ NLP classification accuracy over 67 turns
- ✅ Context/state management
- ✅ Memory retention
- ✅ Error handling
- ✅ Response consistency
- ✅ Topic switching
- ✅ Multi-step workflows
- ✅ Edge case handling

### Real-World Scenarios:
- ✅ User changes their mind
- ✅ User provides incomplete info
- ✅ User makes typos
- ✅ User switches topics
- ✅ User goes back to previous topic
- ✅ User asks ambiguous questions

---

## 📈 Expected Results

### Good Bot Performance:
```
Scenario 1: ✅ PASS (10/10 turns)
Scenario 2: ✅ PASS (15/15 turns)
Scenario 3: ✅ PASS (12/12 turns)
Scenario 4: ✅ PASS (10/10 turns - with graceful errors)
Scenario 5: ✅ PASS (20/20 turns)

Overall: 67/67 turns passed (100%)
```

### Acceptable Performance:
```
Scenario 1: ✅ PASS
Scenario 2: ✅ PASS
Scenario 3: ⚠️  PASS (1-2 minor issues)
Scenario 4: ✅ PASS
Scenario 5: ✅ PASS

Overall: 62-65/67 turns passed (92-97%)
```

### Poor Performance (Needs Fixes):
```
Multiple scenario failures
Context loss between turns
Incorrect responses
Failed edge cases

Overall: <58/67 turns passed (<85%)
```

---

## 💰 Cost to Run

**Production QA Test (67 messages):**
- OpenAI GPT calls: 67 × $0.0002 = **$0.013**
- Gemini calls: 67 × $0.0001 = **$0.007**
- **Total: ~$0.02 per full run**

**Recommendation:** Run once before major deployments

---

## 🚨 Production Testing Checklist

**Before running on production:**

- [ ] Backed up production database
- [ ] Bot is running and responding
- [ ] Test phone number is registered
- [ ] Know how to stop tests if needed
- [ ] Monitoring/logs are accessible
- [ ] Have rollback plan ready

**During testing:**

- [ ] Watch bot responses in real-time
- [ ] Check logs for errors
- [ ] Monitor server CPU/memory
- [ ] Note any unexpected behaviors

**After testing:**

- [ ] Review test results
- [ ] Check database state
- [ ] Clean up test data if needed
- [ ] Document any issues found
- [ ] Update bugs.md if failures

---

## 🛠️ Files Created

**Test Scenarios:**
- `botium-tests/convo/long-conversation-01-event-lifecycle.convo.txt`
- `botium-tests/convo/long-conversation-02-context-retention.convo.txt`
- `botium-tests/convo/long-conversation-03-multi-topic.convo.txt`
- `botium-tests/convo/long-conversation-04-edge-cases.convo.txt`
- `botium-tests/convo/long-conversation-05-stress-test.convo.txt`

**Test Runner:**
- `scripts/run-production-qa.sh` - Production test runner

**Documentation:**
- `LONG-CONVERSATION-QA.md` - This guide

---

## 🎮 Commands Summary

```bash
# Test locally (safe)
npm run test:conversations -- long-conversation

# Test single scenario locally
npm run test:conversations -- long-conversation-01-event-lifecycle.convo.txt

# Test on production (⚠️  CAREFUL!)
./scripts/run-production-qa.sh --production +972XXXXXXXXX

# View test files
ls -la botium-tests/convo/long-conversation*.convo.txt
```

---

## 💡 Tips

1. **Run locally first** - Iron out issues before production
2. **One scenario at a time** - Debug individual scenarios
3. **Monitor logs** - Watch bot behavior in real-time
4. **Clean test data** - Remove test events/reminders after
5. **Save results** - Screenshot or save test output
6. **Test off-hours** - Less impact on production users

---

## 🎯 When to Run Production QA

**Run full production QA when:**
- ✅ Major NLP changes deployed
- ✅ State management updated
- ✅ Context handling modified
- ✅ Before important demos
- ✅ After bug fixes (regression test)
- ✅ Monthly health check

**DON'T run on production when:**
- ❌ Bot is unstable
- ❌ During peak usage hours
- ❌ Without backup/rollback plan
- ❌ First time (test locally first!)

---

## ✅ You're Ready!

**When you say "run on production", I'll tell you to execute:**

```bash
./scripts/run-production-qa.sh --production +972XXXXXXXXX
```

This will test your bot with **67 logical conversation turns** and show exactly how it performs!

Want to run now, or test locally first?
