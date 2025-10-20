# 💰 Testing Costs & How to Reduce Them

## ⚠️ Important: Tests Use Real AI APIs!

**When you run Botium or integration tests, your bot makes REAL API calls to:**

- ✅ **OpenAI (GPT-4.1-mini)** - $0.40 input / $1.60 output per 1M tokens
- ✅ **Google Gemini (2.5-flash-lite)** - $0.10 input / $0.40 output per 1M tokens

**Your bot uses "Ensemble AI" = Both models vote on every message!**

---

## 💸 Cost Breakdown Per Test Run

### Full Botium Test Suite (20 messages)

```
┌─────────────────────────────────────────────┐
│ Test Type: Botium Conversation Tests       │
├─────────────────────────────────────────────┤
│ Messages:       20                          │
│ AI Models:      2 (GPT + Gemini ensemble)  │
│ Total API calls: 40                         │
├─────────────────────────────────────────────┤
│ Input tokens:   ~10,000 tokens             │
│ Output tokens:  ~2,000 tokens              │
├─────────────────────────────────────────────┤
│ GPT cost:       $0.008                     │
│ Gemini cost:    $0.002                     │
│ TOTAL:          ~$0.01 per run             │
└─────────────────────────────────────────────┘
```

### Jest Unit Tests (With AI mocking)
```
Cost: $0 (uses mocks, no API calls)
```

### Integration Tests (Real NLP service)
```
~5-10 messages = $0.005-$0.01 per run
```

---

## 📊 Cost Scenarios

| Scenario | API Calls | Cost |
|----------|-----------|------|
| **Single Botium test** | 40 | $0.01 |
| **Run tests 10 times** | 400 | $0.10 |
| **Run tests 100 times** | 4,000 | $1.00 |
| **Run tests 1,000 times** | 40,000 | $10.00 |
| **CI/CD (daily × 30 days)** | 1,200 | $0.30/month |
| **Heavy development (100×/day)** | 4,000/day | $1/day = $30/month |

---

## 🎯 How to Reduce Testing Costs

### Strategy 1: Use Mock NLP Service (FREE)

**Created for you:**
- `src/testing/MockNLPService.ts` - Mock NLP that returns pre-defined responses
- `tests/mock-nlp.test.ts` - Example tests using mocks

**How to use:**

**OLD (costs money):**
```typescript
const nlp = new NLPService(); // Real AI
const intent = await nlp.parseIntent('תזכיר לי');
// ↑ Makes API call to GPT + Gemini = $0.0002
```

**NEW (FREE):**
```typescript
const nlp = new MockNLPService(); // Mock AI
const intent = await nlp.parseIntent('תזכיר לי');
// ↑ No API call = $0
```

**Benefits:**
- ✅ **FREE** - $0 cost
- ✅ **Fast** - Instant (no network delay)
- ✅ **Deterministic** - Same input = same output (better for tests!)
- ✅ **Offline** - Works without internet

**Drawbacks:**
- ❌ Not testing real AI behavior
- ❌ Need to update mocks when AI logic changes

---

### Strategy 2: Test Locally Before CI/CD

**Don't run full test suite on every git push!**

```bash
# During development - use mocks (FREE)
npm test -- mock-nlp.test.ts

# Before committing - run real tests once
npm run test:conversations

# CI/CD - only run on main branch merges
# (not on every PR commit)
```

---

### Strategy 3: Use Environment Variable to Toggle Mocks

**Create a test configuration:**

```typescript
// tests/config.ts
export const USE_REAL_AI = process.env.TEST_USE_REAL_AI === 'true';

// tests/helpers.ts
import { USE_REAL_AI } from './config';
import { NLPService } from '../src/services/NLPService';
import { MockNLPService } from '../src/testing/MockNLPService';

export function getNLPService() {
  return USE_REAL_AI ? new NLPService() : new MockNLPService();
}
```

**Usage:**

```bash
# Development - use mocks (FREE)
npm test

# Pre-deployment - use real AI
TEST_USE_REAL_AI=true npm test
```

---

### Strategy 4: Cache AI Responses

**Save AI responses for repeated tests:**

```typescript
// tests/ai-cache.ts
const responseCache = new Map<string, NLPIntent>();

async function cachedParseIntent(nlp: NLPService, message: string) {
  const cacheKey = message;

  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey)!; // FREE (cached)
  }

  const result = await nlp.parseIntent(message); // Costs money
  responseCache.set(cacheKey, result); // Save for next time

  return result;
}
```

**First run:** Makes API call ($0.0002)
**Subsequent runs:** Uses cache ($0)

---

### Strategy 5: Reduce Ensemble AI for Testing

**Your bot uses 2 AI models (GPT + Gemini).**

**For testing, you can use just 1:**

```typescript
// In test environment only
if (process.env.NODE_ENV === 'test') {
  // Use only GPT (skip Gemini)
  // Reduces cost by 20%
}
```

**Edit:** `src/domain/phases/phase1-intent/EnsembleClassifier.ts`

---

## 🎯 Recommended Testing Strategy

### Development Phase:
```bash
# Use mocks for rapid iteration (FREE)
npm test -- mock-nlp.test.ts
```

### Before Commit:
```bash
# Run real AI tests once to verify
TEST_USE_REAL_AI=true npm test
# Cost: ~$0.01
```

### CI/CD Pipeline:
```bash
# Only run on main branch (not every PR)
if [[ $BRANCH == "main" ]]; then
  npm run test:conversations
fi
# Cost: ~$0.01 per deployment
```

### Pre-Production:
```bash
# Full test suite with real AI
./scripts/run-all-tests.sh
# Cost: ~$0.02
```

---

## 💡 Cost Optimization Summary

| Test Type | Real AI Cost | Mock Cost | Recommendation |
|-----------|-------------|-----------|----------------|
| **Unit Tests** | $0.005 | $0 | ✅ Use mocks |
| **Integration Tests** | $0.01 | $0 | ⚠️ Use mocks for dev, real for CI |
| **Botium Conversations** | $0.01 | N/A* | ⚠️ Use sparingly |
| **Playwright UI** | $0 | $0 | ✅ Always run (no AI) |

*Botium tests real WhatsApp flow, can't mock AI easily

---

## 📈 Monthly Cost Estimate

**Typical development workflow:**

```
Daily development:
  - 50 mock test runs = $0
  - 2 real AI test runs = $0.02/day

Monthly:
  - Development: $0.02 × 30 = $0.60
  - CI/CD (10 deploys): $0.10
  - Pre-prod testing: $0.02 × 5 = $0.10

Total: ~$0.80/month for testing
```

**Heavy development:**
```
Daily:
  - 200 test runs (mostly mocks) = $0.10/day

Monthly: ~$3/month
```

---

## 🚀 Quick Start

**1. Install mock NLP service:**
```bash
# Already created in:
src/testing/MockNLPService.ts
tests/mock-nlp.test.ts
```

**2. Run FREE tests:**
```bash
npm test -- mock-nlp.test.ts
```

**3. Run REAL tests (costs money):**
```bash
npm run test:conversations
```

**4. Check your OpenAI usage:**
```
https://platform.openai.com/usage
```

**5. Check your Gemini usage:**
```
https://ai.google.dev/
```

---

## ⚠️ Warning Signs

**If you see high costs:**

1. Check if tests are running in CI/CD on every commit
2. Check if you're accidentally running tests in production
3. Verify you're using mocks for unit tests
4. Check for infinite test loops

**Monitor your usage:**
- OpenAI: https://platform.openai.com/usage
- Gemini: https://makersuite.google.com/app/billing

---

## 🎉 Summary

**Yes, Botium tests use REAL AI APIs and cost money.**

**But you can reduce costs to near-$0 with:**
- ✅ Mock NLP service for development
- ✅ Caching AI responses
- ✅ Smart CI/CD configuration
- ✅ Only running real AI tests before deployment

**Created files for you:**
- `src/testing/MockNLPService.ts` - FREE mock AI
- `tests/mock-nlp.test.ts` - Example FREE tests
- `TESTING-COSTS.md` - This guide

**Start testing for FREE:**
```bash
npm test -- mock-nlp.test.ts
```
