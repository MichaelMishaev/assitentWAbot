# 🚀 Production Deployment Checklist - V2 with Ensemble AI

## 📋 Pre-Deployment Checklist

### 1. Environment Variables Configuration

Add these **3 AI API keys** to production `.env`:

```bash
# OpenAI API (GPT-4o-mini - $0.15/$0.60 per 1M tokens)
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE

# Gemini API (Gemini 2.0 Flash - $0.075/$0.30 per 1M tokens) - CHEAPEST!
GEMINI_API_KEY=YOUR_GEMINI_KEY_HERE

# Anthropic Claude API (Claude 3 Haiku - $0.25/$1.25 per 1M tokens)
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
```

**Where to get API keys:**
- OpenAI: https://platform.openai.com/api-keys
- Gemini: https://aistudio.google.com/apikey
- Anthropic: https://console.anthropic.com/settings/keys

### 2. Database Migrations

**Run 2 new migrations on production database:**

```bash
ssh root@167.71.145.9 "cd wAssitenceBot && npm run migrate:up"
```

**New migrations:**
1. `1739100000000_add-user-profiles.sql` - User profiles & pattern learning
2. `1739200000000_add-event-participants.sql` - Multi-participant events

**Verify migrations:**
```bash
ssh root@167.71.145.9 "cd wAssitenceBot && psql \$DATABASE_URL -c \"SELECT * FROM pgmigrations ORDER BY id DESC LIMIT 5\""
```

### 3. Deploy V2 Code

**Full deployment command:**
```bash
ssh root@167.71.145.9 "cd wAssitenceBot && git pull origin main && npm install && npm run build && pm2 restart ultrathink --update-env && pm2 logs ultrathink --lines 50 --nostream"
```

### 4. Verify Ensemble AI Initialization

**Check logs for successful startup:**
```bash
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --nostream | grep -i 'ensemble\|claude\|gemini'"
```

**Expected log output:**
```
[INFO] Initializing V2 Pipeline (10 phases + plugins)...
[INFO] HebcalClient initialized with location: Jerusalem
[INFO] ClaudeClient initialized with model: claude-3-haiku-20240307
[INFO] V2 Pipeline initialized successfully (10 phases)
[INFO] Ensemble classification complete { intent: 'create_event', confidence: 0.95, agreement: '3/3' }
```

---

## 🧪 Production Testing (5 Critical Tests)

Run these 5 tests immediately after deployment:

### Test 1: Simple Event Creation (Ensemble 3/3 Agreement)
```
WhatsApp: קבע פגישה מחר בשעה 3
Expected: ✅ Event created with 95% confidence (3/3 models agreed)
```

### Test 2: Fuzzy Matching (Typo Tolerance)
```
WhatsApp: מחק פגושה עם דוד
Expected: ✅ Finds "פגישה עם דוד" despite typo (similarity: 0.85)
```

### Test 3: Multi-Event Detection
```
WhatsApp: קבע פגישה עם דוד מחר ב-10 ועם שרה בשבוע הבא ב-3
Expected: ✅ Creates 2 separate events
```

### Test 4: Hebrew Calendar Warning
```
WhatsApp: קבע פגישה ביום שבת הבא
Expected: ⚠️ Warning: "התאריך הוא בשבת"
```

### Test 5: Voice Message (Hebrew Number Conversion)
```
WhatsApp: [Voice] "קבע פגישה מחר בשעה שלוש"
Expected: ✅ Converts "שלוש" → "3"
```

---

## 💰 Cost Tracking Verification

### 1. Check Cost Tracker Initialization

```bash
ssh root@167.71.145.9 "cd wAssitenceBot && psql \$DATABASE_URL -c 'SELECT COUNT(*) FROM ai_cost_log'"
```

### 2. Verify Alert Phone Number

Cost alerts will be sent to: **+972544345287**

Change this in `src/shared/services/CostTracker.ts:278` if needed.

### 3. Expected Costs (First Day)

```
100 messages/day with Ensemble:
- GPT-4o-mini: ~50,000 tokens × $0.15/1M = $0.0075
- Gemini Flash: ~50,000 tokens × $0.075/1M = $0.00375
- Claude Haiku: ~50,000 tokens × $0.25/1M = $0.0125
TOTAL: ~$0.024/day = $0.72/month

First alert triggers at: $10 (after ~13,800 messages)
```

---

## 🔧 Troubleshooting

### Issue 1: Claude API Key Not Found

**Error in logs:**
```
[ERROR] ClaudeClient initialization failed: ANTHROPIC_API_KEY not set
```

**Fix:**
```bash
# Add key to .env
ssh root@167.71.145.9 "cd wAssitenceBot && echo 'ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY' >> .env"

# Restart with updated env
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 restart ultrathink --update-env"
```

### Issue 2: Gemini API Key Not Found

**Error in logs:**
```
[ERROR] Gemini classification failed
```

**Fix:**
```bash
# Add key to .env
ssh root@167.71.145.9 "cd wAssitenceBot && echo 'GEMINI_API_KEY=YOUR_KEY' >> .env"

# Restart
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 restart ultrathink --update-env"
```

### Issue 3: Migration Failed

**Error:**
```
[ERROR] Migration 1739100000000_add-user-profiles.sql failed
```

**Fix:**
```bash
# Check existing migrations
ssh root@167.71.145.9 "cd wAssitenceBot && psql \$DATABASE_URL -c 'SELECT * FROM pgmigrations'"

# Manually run failed migration
ssh root@167.71.145.9 "cd wAssitenceBot && psql \$DATABASE_URL < migrations/1739100000000_add-user-profiles.sql"
```

### Issue 4: Ensemble Confidence Too Low

**Symptom:** Bot always asks for clarification

**Check logs:**
```bash
ssh root@167.71.145.9 "cd wAssitenceBot && pm2 logs ultrathink --nostream | grep 'agreement'"
```

**Expected:** Most messages should be `3/3` or `2/3` agreement

**If seeing `0/3` or `1/3`:**
- One or more models are failing
- Check API keys are correct
- Check API rate limits

---

## 📊 Success Metrics (Week 1)

**KPIs to monitor:**

1. **Ensemble Agreement Rate**
   - Target: >80% of messages have 2/3 or 3/3 agreement
   - Check: `grep "agreement" logs/combined.log | grep "3/3" | wc -l`

2. **Cost Per Message**
   - Target: <$0.0005 per message
   - Check: `SELECT AVG(cost_usd) FROM ai_cost_log WHERE created_at > NOW() - INTERVAL '7 days'`

3. **Intent Classification Accuracy**
   - Target: >90% user satisfaction
   - Measure: % of successful event/reminder creation

4. **Fuzzy Matching Hit Rate**
   - Target: >70% typo corrections successful
   - Check logs for: `[INFO] Fuzzy match found`

5. **Multi-Event Detection**
   - Target: >50% of multi-event messages detected
   - Check logs for: `[INFO] Multi-event detected`

---

## 🎯 Week 1 Action Items

### Day 1 (Deployment Day)
- [x] Add 3 API keys to production `.env`
- [x] Run database migrations
- [x] Deploy V2 code
- [ ] Run 5 critical tests
- [ ] Verify all 10 phases initialized
- [ ] Check first cost log entries

### Day 2
- [ ] Monitor ensemble agreement rates
- [ ] Check for any error patterns
- [ ] Verify cost tracking alerts work
- [ ] Test fuzzy matching with real users

### Day 3-7
- [ ] Monitor daily cost (should be <$1/day for 100 users)
- [ ] Check pattern learning (user profiles)
- [ ] Verify multi-event detection accuracy
- [ ] Review Hebrew calendar warnings

---

## 🔒 Security Verification

### 1. Check API Keys Are Not Logged

```bash
ssh root@167.71.145.9 "cd wAssitenceBot && grep -i 'sk-proj\|sk-ant-api' logs/combined.log"
# Should return: NOTHING (no keys in logs)
```

### 2. Verify Cost Alerts Work

```bash
# Manually trigger alert (for testing)
ssh root@167.71.145.9 "cd wAssitenceBot && psql \$DATABASE_URL -c \"INSERT INTO ai_cost_log (user_id, model, operation, cost_usd, created_at) VALUES ('test', 'gpt-4o-mini', 'test', 10.00, NOW())\""

# Check WhatsApp for cost alert message
```

### 3. Confirm No Expensive Models Used

```bash
ssh root@167.71.145.9 "cd wAssitenceBot && grep -r 'gpt-4-turbo\|claude-3-opus\|gemini-pro' src/"
# Should return: NOTHING
```

---

## 📞 Emergency Rollback

**If V2 has critical issues, rollback to previous version:**

```bash
# Rollback code
ssh root@167.71.145.9 "cd wAssitenceBot && git reset --hard HEAD~3 && npm run build && pm2 restart ultrathink --update-env"

# Rollback migrations (DANGEROUS - data loss possible)
ssh root@167.71.145.9 "cd wAssitenceBot && npm run migrate:down"
```

**Better approach:** Disable V2 pipeline in code:
```typescript
// src/index.ts
// Comment out pipeline initialization temporarily
// await initializePipeline();
```

---

## ✅ Deployment Complete Checklist

- [ ] OPENAI_API_KEY added to production `.env`
- [ ] GEMINI_API_KEY added to production `.env`
- [ ] ANTHROPIC_API_KEY added to production `.env`
- [ ] 2 new migrations applied successfully
- [ ] V2 code deployed (all 10 phases)
- [ ] Bot restarted with `--update-env` flag
- [ ] Logs show successful initialization
- [ ] 5 critical tests passed
- [ ] Cost tracking working (entries in `ai_cost_log`)
- [ ] No API keys visible in logs
- [ ] Ensemble agreement rate >80%

---

## 🎉 Success Indicators

**You'll know V2 is working when:**

1. **Logs show ensemble voting:**
   ```
   [INFO] Ensemble classification complete { agreement: '3/3', confidence: 0.95 }
   ```

2. **Fuzzy matching catches typos:**
   ```
   [INFO] Fuzzy match found: "פגושה" → "פגישה" (similarity: 0.85)
   ```

3. **Multi-events detected:**
   ```
   [INFO] Multi-event detected: 2 events split from single message
   ```

4. **Hebrew calendar warnings:**
   ```
   [INFO] Hebrew calendar warning: התאריך הוא בשבת
   ```

5. **Cost tracking alerts:**
   ```
   💰 AI Cost Alert - Total monthly cost: $10.23
   ```

---

**Last Updated:** 2025-10-12
**V2 Version:** 2.0.0
**Status:** Ready for Production Deployment 🚀
