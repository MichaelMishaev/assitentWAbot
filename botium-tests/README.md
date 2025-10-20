# WhatsApp Bot Testing with Botium (FREE)

## 📦 What We're Using (All Free!)

- **Botium Core** - Open source conversational testing framework
- **Jest** - Unit & integration tests
- **Playwright** - Dashboard UI testing
- **Custom Scripts** - Bug-specific regression tests

**Total Cost: $0** 🎉

---

## 🧪 Test Categories

### 1. NLP Classification Tests
**Tests bugs:** #1, #2, #8, #16

Files:
- `bug08-reminder-detection.convo.txt` - Reminder intent recognition
- `bug16-list-all-events.convo.txt` - Meta-phrase handling
- `hebrew-name-participants.convo.txt` - Participant extraction

**Run:**
```bash
npm run test:conversations
```

---

### 2. Date/Time Parsing Tests
**Tests bugs:** #3, #9, #13

Files:
- `bug03-multiline-parsing.convo.txt` - Multi-line time extraction
- `bug09-date-without-year.convo.txt` - Smart year detection
- `bug13-time-recognition.convo.txt` - Same-line time parsing

**Run:**
```bash
npm run test:bugs
```

---

### 3. Entity Extraction Tests
**Tests bugs:** #13, #14, #15

Files:
- `bug13-time-recognition.convo.txt` - Time entity extraction
- `bug15-reminder-notes.convo.txt` - Notes field extraction
- `search-hebrew-tokenization.convo.txt` - Hebrew tokenization

**Run:**
```bash
npm run test:nlp
```

---

### 4. Search & Filtering Tests
**Tests bugs:** #14, #16

Files:
- `bug14-search-tokenization.convo.txt` - Hebrew word splitting
- `search-hebrew-tokenization.convo.txt` - Partial name matching

**Run:**
```bash
npm run test:simulator
```

---

### 5. Context Management Tests
**Tests bugs:** #2

Files:
- `bug02-context-loss-reminder-time.convo.txt` - State preservation

---

## 🚀 Quick Start

### Run All Tests
```bash
# All unit tests
npm test

# Bug-specific tests
npm run test:bugs

# Conversation flow tests (Botium)
npm run test:conversations

# Hebrew-specific tests
npm run test:hebrew-qa

# High priority tests only
npm run test:hebrew-qa:high

# UI tests (Playwright)
npm run test:playwright
```

---

## 📝 Botium Conversation Format

```
Bug #X - Description

#me
User input text in Hebrew

#bot
Expected response (can use regex)
BUTTON text to match in button
!FAIL text that should NOT appear

#me
Follow-up message

#bot
Expected response
```

**Pattern Matching:**
- Plain text - Exact match
- `.*` - Wildcard (regex)
- `BUTTON text` - Checks for button/option
- `!text` - Negative assertion (should NOT contain)

---

## 🔍 How to Test Each Bug Category

### NLP Classification Issues
**Symptoms:** Bot doesn't recognize intent (e.g., "תזכורת" not detected)

**Test with:**
```bash
npm run test:conversations
```

**What to check:**
- Intent confidence scores
- Correct intent classification
- Keyword detection

---

### Date/Time Parsing Issues
**Symptoms:** Wrong dates, missing times, past dates

**Test with:**
```bash
npm run test:bugs
```

**What to check:**
- Year inference (20.10 → 2025 or 2026?)
- Time extraction from same line
- Multi-line format parsing

---

### Hebrew Text Issues
**Symptoms:** Names split incorrectly, search fails, tokenization bugs

**Test with:**
```bash
npm run test:hebrew-qa
```

**What to check:**
- Names with ו (vav) not splitting
- Partial name search works
- Hebrew word boundaries

---

### Search & Filtering Issues
**Symptoms:** Can't find events, "list all" treated as title

**Test with:**
```bash
npm run test:simulator
```

**What to check:**
- Fuzzy matching threshold
- Hebrew tokenization
- Meta-phrase detection

---

## 🐛 Adding a New Test for a Bug

1. **Create conversation file:**
```bash
touch botium-tests/convo/bug17-description.convo.txt
```

2. **Write test scenario:**
```
Bug #17 - Short description

#me
User input that triggers the bug

#bot
Expected correct behavior (not the bug!)
```

3. **Run the test:**
```bash
npm run test:conversations
```

4. **If it fails → bug exists**
5. **Fix the bug**
6. **Re-run → should pass**

---

## 📊 Test Report Example

After running tests:
```
✅ PASS: bug13-time-recognition.convo.txt
✅ PASS: bug14-search-tokenization.convo.txt
❌ FAIL: bug16-list-all-events.convo.txt
  Expected: Event list
  Got: "לא נמצאו אירועים עבור 'כל האירועים שלי'"
```

---

## 🎯 Coverage by Bug Category

| Bug Category | Test Count | Coverage |
|--------------|------------|----------|
| NLP Classification | 4 tests | 🟢 High |
| Date/Time Parsing | 3 tests | 🟢 High |
| Entity Extraction | 3 tests | 🟢 High |
| Search/Filtering | 2 tests | 🟡 Medium |
| Context Management | 1 test | 🟡 Medium |
| UI/Dashboard | 0 tests | 🔴 Low (use Playwright) |

---

## 💡 Tips

1. **Write tests BEFORE fixing bugs** - Regression prevention
2. **One test per bug** - Easy to identify failures
3. **Use real user messages** - From bugs.md examples
4. **Test edge cases** - Hebrew names, multi-line, past dates
5. **Run tests in CI/CD** - Catch bugs before deployment

---

## 🔗 Related Files

- `src/testing/test-bug-fixes.ts` - Custom bug tests
- `src/testing/MessageSimulator.ts` - Message flow simulation
- `botium.json` - Botium configuration
- `jest.config.js` - Jest configuration
- `playwright.config.ts` - Playwright configuration

---

## 📚 Documentation

- [Botium Core Docs](https://botium-docs.readthedocs.io/)
- [Jest Docs](https://jestjs.io/)
- [Playwright Docs](https://playwright.dev/)

---

**Remember: All these tools are FREE and open source! 🎉**
