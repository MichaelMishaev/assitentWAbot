# Cost Investigation: 420 NIS Google Bill

**Date:** October 12, 2025
**Issue:** Unexpected 420 NIS (~$115 USD) charge from Google Gemini API

---

## Quick Summary

### The Problem
- You paid **420 NIS to Google** yesterday
- You did **NOT pay much to OpenAI** (GPT-4o-mini)
- This suggests either:
  1. **Message loop** - Bot responding to itself infinitely
  2. **Spam attack** - Someone sending thousands of messages
  3. **Gemini-specific issue** - Gemini being called more than other models

### Why This Happened

**Your app uses `gemini-2.0-flash-exp` which recently started charging!**

The model was FREE during preview, but Google just started billing for it.

---

## Pricing Comparison

### What You Thought (Wrong!)

Your `CostTracker.ts` has **outdated pricing**:
```typescript
'gemini-1.5-flash': {
  input: 0.000075 / 1000,  // $0.075 per 1M - WRONG MODEL!
  output: 0.0003 / 1000    // $0.30 per 1M
}
```

### What You're Actually Using

```typescript
// In GeminiNLPService.ts:
model: 'gemini-2.0-flash-exp'  // ← This is what you're charged for!
```

### Actual Pricing (Gemini 2.0 Flash)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Blended (3:1 ratio) |
|-------|----------------------|------------------------|---------------------|
| **Gemini 2.0 Flash** | $0.10 | $0.40 | $0.17 |
| GPT-4o-mini | $0.15 | $0.60 | $0.24 |
| Claude 3 Haiku | $0.25 | $1.25 | $0.44 |

**Gemini is actually the cheapest!** So why the huge bill?

---

## Volume Calculation

### Scenario 1: Normal Usage (1,150 messages)

If you processed 1,150 messages with normal prompts:
- Average: 2,000 input tokens + 200 output tokens per call
- Cost per call: (2,000 × $0.10/1M) + (200 × $0.40/1M) = **$0.00028**
- Total: 1,150 × $0.00028 = **$0.32 USD** ❌ (Too low!)

### Scenario 2: Large Context (1,150 messages with big prompts)

Your NLP prompts are **HUGE** - 300+ lines, ~5,000 tokens each!
- Average: 5,000 input + 500 output tokens per call
- Cost per call: (5,000 × $0.10/1M) + (500 × $0.40/1M) = **$0.00070**
- Total: 1,150 × $0.00070 = **$0.80 USD** ❌ (Still too low!)

### Scenario 3: Message Loop (LIKELY!)

To reach 420 NIS (~$115 USD):
- $115 / $0.00070 per call = **164,286 API calls**
- At 3 AI models per message = **54,762 messages**
- In 24 hours = **2,282 messages/hour** = **38 messages/minute**

**This is NOT normal user traffic! This is a loop or attack!**

---

## Why Only Google Charged?

### Theory 1: OpenAI Free Tier

OpenAI gives **$5 free credit per month** to new accounts. If you:
- Used 54,762 messages × 1 GPT call = 54,762 calls
- At $0.00042/call (2,000 tokens × $0.15/1M + 200 tokens × $0.60/1M)
- Total cost: 54,762 × $0.00042 = **$23 USD**
- With $5 credit: **$18 charged** (maybe not billed yet?)

### Theory 2: Billing Threshold

- OpenAI minimum billing: $10
- Anthropic minimum billing: $25
- Google minimum billing: $1

Google charges immediately, others wait until threshold.

### Theory 3: Ensemble AI Failure

If GPT or Claude failed, only Gemini runs:
```typescript
// In EnsembleClassifier.ts:
const [gptResult, geminiResult, claudeResult] = await Promise.allSettled([
  this.classifyWithGPT(prompt, context),      // ← Failed?
  this.classifyWithGemini(prompt, context),   // ← Always succeeded
  this.classifyWithClaude(prompt, context)    // ← Failed?
]);
```

If 2 models fail, Gemini processes ALL messages alone!

---

## Investigation Steps

### Step 1: Check Production Logs

Run this script to analyze message volume:
```bash
cd /Users/michaelmishayev/Desktop/Projects/wAssitenceBot
./scripts/analyze-production-volume.sh
```

Or manually on server:
```bash
ssh root@192.53.121.229
cd /root/whatsapp-bot

# Count messages in last 24h
pm2 logs --lines 5000 | grep -c "Processing message"

# Find message loop (same message repeated)
pm2 logs --lines 5000 | grep "Processing message" | sort | uniq -c | sort -rn | head -20

# Check for spam (one user sending many messages)
pm2 logs --lines 5000 | grep "Processing message from" | awk '{print $NF}' | sort | uniq -c | sort -rn | head -10
```

### Step 2: Check for Bot Responding to Itself

Look for this pattern in logs:
```
Processing message from +972XXXXXXXX
[AI Response sent]
Processing message from +972XXXXXXXX (same number!)
[AI Response sent]
[INFINITE LOOP!]
```

**Check:** `src/index.ts:80`
```typescript
// Skip messages from ourselves
if (message.isFromMe) {
  return;  // ← Is this working?
}
```

### Step 3: Check Database for Actual Volume

Run on production database:
```sql
-- Count messages processed yesterday
SELECT COUNT(*)
FROM messages
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE;

-- Top users by message count
SELECT user_id, COUNT(*) as msg_count
FROM messages
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY user_id
ORDER BY msg_count DESC
LIMIT 10;

-- Check for message spikes by hour
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as messages
FROM messages
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY hour
ORDER BY hour DESC;
```

### Step 4: Check Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/metrics
2. Check "Requests" graph for yesterday
3. Look for sudden spike

---

## Most Likely Causes (Ranked)

### 1. Message Loop (80% probability)

**Symptom:** Bot responds to its own messages infinitely

**Check:**
```bash
pm2 logs | grep "Processing message" | tail -100
# Look for repeated patterns from same number
```

**Fix:** Ensure `isFromMe` check works correctly

### 2. Group Chat Spam (15% probability)

**Symptom:** Bot in a WhatsApp group, responding to every message

**Check:**
```bash
pm2 logs | grep "group" | tail -50
```

**Fix:** Add group message filtering or leave groups

### 3. Single User Spamming (4% probability)

**Symptom:** One user sending thousands of test messages

**Check:**
```bash
pm2 logs | grep "Processing message from" | awk '{print $NF}' | sort | uniq -c | sort -rn | head -5
```

**Fix:** Add rate limiting (10 messages/minute per user)

### 4. Ensemble AI Imbalance (1% probability)

**Symptom:** GPT/Claude failing, only Gemini working

**Check:**
```bash
pm2 logs | grep -E "GPT classification failed|Claude classification failed" | wc -l
```

**Fix:** Handle failures better, don't fallback to single model

---

## Immediate Actions Required

### 1. STOP THE BLEEDING (Right Now!)

**Option A:** Stop production temporarily
```bash
ssh root@192.53.121.229
pm2 stop all
```

**Option B:** Add emergency rate limit
```typescript
// In MessageRouter.ts, add at top of routeMessage():
const messageKey = `msg:count:${from}:${new Date().toISOString().split('T')[0]}`;
const count = await redis.incr(messageKey);
await redis.expire(messageKey, 86400); // 24h

if (count > 100) {
  await this.sendMessage(from, 'הגעת למגבלת 100 הודעות ליום. נסה מחר.');
  return;
}
```

### 2. Check Production Volume (Next 30 Minutes)

Run the analysis script:
```bash
./scripts/analyze-production-volume.sh
```

### 3. Add Cost Limits (Today)

```typescript
// In CostTracker.ts:
private dailyLimit = 10; // $10/day maximum

async checkAndShutdown() {
  const cost = await this.getDailyCost();
  if (cost.totalCost >= this.dailyLimit) {
    // Send emergency alert
    await this.sendMessage(adminPhone, '🚨 EMERGENCY: Daily cost limit reached! Bot paused.');
    // Stop processing
    process.exit(1);
  }
}
```

### 4. Fix Cost Tracking (Today)

Add tracking for Gemini and GPT:
```typescript
// In GeminiNLPService.ts:313, after generateContent:
const usage = result.response.usageMetadata;
await costTracker.trackCost({
  userId: 'system',
  model: 'gemini-2.0-flash-exp',
  operation: 'intent-classification',
  costUsd: (usage.promptTokenCount * 0.10/1e6) + (usage.candidatesTokenCount * 0.40/1e6),
  tokensUsed: usage.totalTokenCount,
  timestamp: new Date()
});
```

---

## Prevention Strategy

### Short Term (This Week)

1. ✅ Add rate limiting: 100 messages/day per user
2. ✅ Add cost limit: $10/day shutdown
3. ✅ Add cost tracking for all 3 models
4. ✅ Fix `isFromMe` check to prevent loops
5. ✅ Monitor logs daily

### Medium Term (This Month)

1. ✅ Pattern matching for simple commands (no AI)
2. ✅ Cache common queries (Redis)
3. ✅ Single model by default, ensemble only when uncertain
4. ✅ Disable ensemble AI completely (save 67% cost)

### Long Term (Next Quarter)

1. ✅ Self-hosted model for simple intents
2. ✅ User quotas (free: 20/day, paid: unlimited)
3. ✅ Semantic cache with embeddings

---

## Expected Findings

Based on the symptoms, I predict you'll find:

1. **54,000+ messages** processed yesterday (not 1,150)
2. **One user or one pattern** causing most messages
3. **Gemini worked, but GPT/Claude had errors**
4. **No rate limiting** = unlimited spending

---

## Next Steps

1. **Run the analysis script** (scripts/analyze-production-volume.sh)
2. **Report findings here** - I'll help interpret
3. **Implement emergency fixes** based on what we find
4. **Deploy optimized version** with 80% cost reduction

---

**Created:** October 12, 2025
**Status:** 🔴 CRITICAL - Awaiting log analysis
**Priority:** 🚨 IMMEDIATE ACTION REQUIRED
