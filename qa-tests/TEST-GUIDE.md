# 🧪 Complete FREE Testing Guide for WhatsApp Bot

## 💰 Cost Breakdown

| Tool | Status | Cost | What It Tests |
|------|--------|------|---------------|
| **Botium Core** | ✅ Installed | **$0/forever** | Conversation flows, NLP intents |
| **Jest** | ✅ Installed | **$0/forever** | Unit tests, integration tests |
| **Playwright** | ✅ Installed | **$0/forever** | Dashboard UI, calendar |
| **Custom Scripts** | ✅ Ready | **$0/forever** | Bug-specific regression tests |

**Total Monthly Cost: $0** 🎉

---

## 🎯 What Each Tool Tests (Mapped to Your Bugs)

### 1. Botium Core - Conversational Flow Testing
**Tests these bugs:**
- ✅ Bug #2 - Context loss between messages
- ✅ Bug #3 - Multi-line message parsing
- ✅ Bug #8 - Reminder detection
- ✅ Bug #13 - Time recognition
- ✅ Bug #14 - Search with Hebrew tokenization
- ✅ Bug #15 - Notes extraction
- ✅ Bug #16 - "כל האירועים" meta-phrases

**How to run:**
```bash
# All conversation tests
npm run test:conversations

# Or run specific test
npm run test:conversations -- bug13-time-recognition
```

**Files created for you:**
- `botium-tests/convo/bug02-context-loss-reminder-time.convo.txt`
- `botium-tests/convo/bug03-multiline-parsing.convo.txt`
- `botium-tests/convo/bug08-reminder-detection.convo.txt`
- `botium-tests/convo/bug09-date-without-year.convo.txt`
- `botium-tests/convo/bug13-time-recognition.convo.txt` (already existed)
- `botium-tests/convo/bug14-search-tokenization.convo.txt` (already existed)
- `botium-tests/convo/bug15-reminder-notes.convo.txt`
- `botium-tests/convo/bug16-list-all-events.convo.txt`
- `botium-tests/convo/hebrew-name-participants.convo.txt`
- `botium-tests/convo/search-hebrew-tokenization.convo.txt`

---

### 2. Jest - Unit & Integration Testing
**Tests these bugs:**
- ✅ Bug #9 - Date parsing without year
- ✅ Bug #13 - Entity extraction
- ✅ Bug #14 - Search fuzzy matching
- ✅ Bug #4 - Performance (postinstall)
- ✅ Bug #11 - Crash loop prevention

**How to run:**
```bash
# All unit tests
npm test

# Regression tests only
npm test -- regression-bugs.test.ts

# Watch mode (auto-rerun on changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

**File created for you:**
- `tests/regression-bugs.test.ts` - All 16 bugs as unit tests

---

### 3. Playwright - Dashboard UI Testing
**Tests these bugs:**
- ✅ Bug #10 - Calendar not showing events
- ✅ Bug #10b - iOS-style calendar display
- ✅ Bug #10c - Weekly view scrolling

**How to run:**
```bash
# Headless (CI mode)
npm run test:playwright

# Visual UI mode
npm run test:playwright:ui

# See browser (headed mode)
npm run test:playwright:headed
```

---

### 4. Custom Scripts - Bug-Specific Tests
**Tests these bugs:**
- ✅ All bugs via Message Simulator
- ✅ NLP classification accuracy
- ✅ Hebrew QA scenarios

**How to run:**
```bash
# Bug-specific tests
npm run test:bugs

# Message flow simulator
npm run test:simulator

# NLP tests
npm run test:nlp

# Hebrew QA tests
npm run test:hebrew-qa

# High priority Hebrew tests only
npm run test:hebrew-qa:high
```

---

## 🚀 Quick Start Guide

### Step 1: Install Dependencies (if not already)
```bash
npm install
```

### Step 2: Run ALL Tests at Once
```bash
./scripts/run-all-tests.sh
```

This will run:
1. Unit tests (Jest)
2. Integration tests
3. Bug regression tests
4. NLP tests
5. Hebrew QA tests
6. Conversation flow tests (Botium)
7. Message simulator tests
8. Dashboard UI tests (Playwright)

**Expected output:**
```
🧪 Running All WhatsApp Bot Tests (FREE Edition)
================================================

📦 Category 1: Unit Tests
▶ Running: Unit Tests
✅ PASS: Unit Tests

📦 Category 2: Integration Tests
▶ Running: Integration Tests
✅ PASS: Integration Tests

[... more tests ...]

================================================
📊 Test Summary
================================================
Total Tests Run:  8
Passed:           8
Failed:           0

🎉 All tests passed!
```

---

## 📖 How to Test Each Bug Category

### Testing NLP Classification Issues (Bugs #1, #2, #8, #16)

**Symptoms:**
- Bot doesn't recognize intent
- "תזכורת" not detected as reminder
- "כל האירועים" treated as event title

**Test with Botium:**
```bash
npm run test:conversations
```

**Test with Jest:**
```bash
npm test -- --testNamePattern="NLP"
```

**What gets tested:**
- Intent classification accuracy
- Confidence scores
- Keyword detection
- Meta-phrase handling

---

### Testing Date/Time Parsing Issues (Bugs #3, #9, #13)

**Symptoms:**
- Wrong dates (past instead of future)
- Missing times
- Multi-line format not parsed

**Test with Botium:**
```bash
npm run test:conversations -- bug09-date-without-year
npm run test:conversations -- bug13-time-recognition
```

**Test with Jest:**
```bash
npm test -- --testNamePattern="Date"
```

**What gets tested:**
- Year inference (20.10 → next occurrence)
- Time extraction from same line
- Multi-line format parsing
- dateText preservation

---

### Testing Hebrew Text Issues (Bugs #14, Hebrew names)

**Symptoms:**
- Names split incorrectly (יהודית → יה + דית)
- Search fails on partial names
- Tokenization bugs

**Test with Botium:**
```bash
npm run test:conversations -- hebrew-name-participants
npm run test:conversations -- search-hebrew-tokenization
```

**Test with Jest:**
```bash
npm test -- --testNamePattern="Hebrew"
```

**What gets tested:**
- ו (vav) in names not splitting
- Partial name search
- Hebrew word boundaries
- Tokenization algorithm

---

### Testing Search & Filtering (Bugs #14, #16)

**Symptoms:**
- Can't find existing events
- "כל האירועים" treated as title
- Fuzzy matching too strict

**Test with Botium:**
```bash
npm run test:conversations -- bug14-search-tokenization
npm run test:conversations -- bug16-list-all-events
```

**Test with Jest:**
```bash
npm test -- --testNamePattern="Search"
```

**What gets tested:**
- Fuzzy matching threshold (0.3 vs 0.45)
- Search limit (500 vs 100)
- Meta-phrase detection
- Hebrew tokenization

---

### Testing Context Management (Bug #2)

**Symptoms:**
- State lost between messages
- Date forgotten when asking for time
- Context not preserved

**Test with Botium:**
```bash
npm run test:conversations -- bug02-context-loss
```

**What gets tested:**
- State persistence
- Context passing between messages
- NLP → State Router communication

---

### Testing Dashboard UI (Bug #10)

**Symptoms:**
- Calendar not showing events
- iOS-style display issues
- Weekly view problems

**Test with Playwright:**
```bash
npm run test:playwright
```

**What gets tested:**
- Calendar renders events
- Past events visible
- Reminders on all dates
- Weekly view scrolling

---

## 🐛 How to Add a Test for a New Bug

### Step 1: Create Botium Conversation Test
```bash
# Create new test file
cat > botium-tests/convo/bug17-description.convo.txt << 'EOF'
Bug #17 - Short description of the bug

#me
User input that triggers the bug

#bot
Expected correct behavior (not the bug!)
BUTTON text to match
!text that should NOT appear

#me
Follow-up message

#bot
Expected response
EOF
```

### Step 2: Create Jest Unit Test
```typescript
// In tests/regression-bugs.test.ts

describe('Bug #17: Description', () => {
  test('should do correct behavior', () => {
    // Arrange
    const input = 'user input';

    // Act
    const result = functionThatWasBuggy(input);

    // Assert
    expect(result).toBe('correct output');
  });
});
```

### Step 3: Run the Tests
```bash
# Botium test
npm run test:conversations

# Jest test
npm test -- bug17
```

### Step 4: If Test Fails → Bug Still Exists
1. Fix the bug in the code
2. Re-run the test
3. Test should pass now
4. Add to regression suite

---

## 📊 Test Coverage Report

After running `npm run test:coverage`, you'll see:

```
=============================== Coverage summary ===============================
Statements   : 78.43% ( 1234/1573 )
Branches     : 65.21% ( 321/492 )
Functions    : 82.14% ( 138/168 )
Lines        : 77.89% ( 1198/1538 )
================================================================================
```

**Files with low coverage need more tests!**

---

## 🎯 Recommended Test Workflow

### For New Features:
1. Write Botium conversation test first (TDD)
2. Feature implementation
3. Add Jest unit tests for edge cases
4. Run all tests: `./scripts/run-all-tests.sh`
5. Coverage check: `npm run test:coverage`

### For Bug Fixes:
1. Create failing test that reproduces the bug
2. Fix the bug in code
3. Test should now pass
4. Add to regression suite
5. Document in bugs.md

### Before Deployment:
```bash
# Run everything
./scripts/run-all-tests.sh

# If all pass → safe to deploy
npm run build
./scripts/deploy-production.sh
```

---

## 🔍 Debugging Failed Tests

### Botium Test Fails:
```bash
# Run with verbose logging
npm run test:conversations -- --verbose

# Check what bot actually responded
# Look for: "Expected: X, Got: Y"
```

### Jest Test Fails:
```bash
# Run specific test with output
npm test -- --testNamePattern="Bug #13" --verbose

# Run in watch mode
npm run test:watch

# See full error stack
npm test -- --no-coverage
```

### Playwright Test Fails:
```bash
# Run in UI mode to see browser
npm run test:playwright:ui

# Run headed mode (see browser)
npm run test:playwright:headed

# Take screenshots on failure (auto-enabled)
```

---

## 💡 Pro Tips

1. **Write tests BEFORE fixing bugs** (TDD approach)
   - Ensures you can reproduce the bug
   - Test fails initially
   - Fix bug → test passes
   - Bug won't come back

2. **Run tests in watch mode during development**
   ```bash
   npm run test:watch
   ```

3. **Use real user messages from bugs.md**
   - Most accurate test cases
   - Captures edge cases

4. **Test Hebrew edge cases**
   - Names with ו (vav)
   - Multi-word searches
   - RTL formatting

5. **Check coverage regularly**
   ```bash
   npm run test:coverage
   ```

6. **Run ALL tests before pushing to production**
   ```bash
   ./scripts/run-all-tests.sh
   ```

---

## 📚 Documentation Links

- [Botium Core Docs](https://botium-docs.readthedocs.io/)
- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Your Bugs File](./docs/development/bugs.md)

---

## ✅ Checklist for Testing a New Bug

- [ ] Document bug in `bugs.md`
- [ ] Create Botium conversation test (`.convo.txt`)
- [ ] Create Jest unit test (`tests/regression-bugs.test.ts`)
- [ ] Run test → should FAIL (reproduces bug)
- [ ] Fix the bug in code
- [ ] Re-run test → should PASS
- [ ] Run all tests: `./scripts/run-all-tests.sh`
- [ ] Update bug status in `bugs.md` to ✅ FIXED
- [ ] Deploy to production

---

## 🎉 You're All Set!

You now have a complete **FREE** testing suite for your WhatsApp bot:

- ✅ 10+ Botium conversation tests
- ✅ 15+ Jest unit tests
- ✅ Playwright UI tests
- ✅ Custom bug regression tests
- ✅ Hebrew-specific tests
- ✅ One-command test runner

**Cost: $0/month forever** 🚀

Start testing with:
```bash
./scripts/run-all-tests.sh
```
