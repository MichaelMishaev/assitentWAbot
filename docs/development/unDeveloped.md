# =ß Undeveloped Features & Missing Implementation

**Last Updated:** 2025-10-12
**Purpose:** Track features that were planned/discussed but not yet implemented
**Status:** Comprehensive analysis based on conversation history and codebase review

---

## =  Overview

This document tracks **21 undeveloped features** identified from:
- V2 Pipeline architecture plans
- Production conversation testing requests
- Documentation and code TODOs
- Infrastructure improvements mentioned but not implemented
- Testing gaps
- AI/ML enhancements

---

## =4 CRITICAL - Core Features Missing

### 1. Phase 3: Entity Extraction (V2 Pipeline)
**Status:** L NOT IMPLEMENTED
**Location:** `src/domain/orchestrator/PhaseInitializer.ts:80`

**Description:**
Should extract structured entities from user text:
- Dates and times (relative and absolute)
- Event titles
- Locations
- Contact names
- Durations
- Priorities

**Impact:** HIGH - Currently relying on AI models to extract entities in unstructured format

**Effort:** ~2-3 days

**Dependencies:**
- Hebrew NLP library or custom parser
- Integration with existing date parser
- Contact name recognition

**Example:**
```typescript
Input: "‰“ŸÈ‘ ‚› ”‡Ÿ ﬁ◊Ë —È‚‘ 15:00 —ﬁÈË”"
Expected Output: {
  title: "‰“ŸÈ‘ ‚› ”‡Ÿ",
  date: "2025-10-13",
  time: "15:00",
  location: "—ﬁÈË”",
  contact: "”‡Ÿ"
}
```

---

### 2. Phase 10: Validation & Enrichment
**Status:** L NOT IMPLEMENTED
**Location:** `src/domain/orchestrator/PhaseInitializer.ts:118`

**Description:**
Final validation phase that should:
- Validate all extracted data (dates not in past, times valid, etc.)
- Enrich with additional context (weather, travel time, related events)
- Apply business rules (working hours, conflicts, etc.)
- Calculate confidence scores for each field

**Impact:** HIGH - No final validation layer before creating events

**Effort:** ~1-2 days

**Example:**
```typescript
// Validation checks:
- startTime < endTime
- date not in past (except for logs)
- location exists (if specific venue)
- contact exists in user's contacts
- no double-booking (or warn)

// Enrichment:
- Add travel time if location is far
- Add weather info for outdoor events
- Suggest related events ("You also have...")
```

---

### 3. Comprehensive Production Testing
**Status:** † PARTIALLY DONE
**User Request:** "run prods converstions again to see that smart enough"

**Description:**
User explicitly requested to run comprehensive production conversations after fixes, but we only did:
-  RRule fix verification
-  Duplicate API cost verification
- L **46 QA conversations NOT executed systematically**
- L **No metrics collected on accuracy improvements**

**What's Missing:**
1. Run all 46 Hebrew QA conversations (`docs/qa-hebrew-conversations.md`)
2. Measure intent classification accuracy (target: 95%+)
3. Measure entity extraction accuracy (target: 90%+)
4. Verify all edge cases (typos, formats, ambiguity)
5. Test complex flows (multi-step, corrections, context switching)

**Impact:** HIGH - Can't verify if bot is actually "smart enough" after fixes

**Effort:** ~4-6 hours

**How to Execute:**
```bash
# Run automated QA conversations
npm run test:qa-conversations

# Or manually test each category:
# 1. Event Creation (6 conversations)
# 2. Reminder Creation (5 conversations)
# 3. Event Queries (8 conversations)
# 4. Event Updates (4 conversations)
# 5. Event Deletion (4 conversations)
# 6. General Help (5 conversations)
# 7. Edge Cases (8 conversations)
# 8. Complex Flows (6 conversations)
```

---

### 4. WhatsApp Session Stability
**Status:** L KNOWN ISSUE - NOT FIXED
**Location:** `src/providers/BaileysProvider.ts`

**Description:**
Sessions corrupt frequently, requiring manual QR code rescanning. Production logs show:
```json
{"message":"† Authentication failed (401/403) - Attempt 3/5"}
```

**Root Causes:**
1. Baileys library instability with multi-device protocol
2. Session files (`auth_info_baileys/`) getting corrupted
3. No automatic session recovery
4. No health check for session validity

**Impact:** HIGH - Bot becomes unavailable until manual intervention

**Effort:** ~2-3 days

**Potential Solutions:**
1. **Automatic Session Recovery:**
   - Detect session corruption
   - Automatically generate new QR code
   - Send QR to admin via email/webhook
   - Retry connection with exponential backoff

2. **Session Health Monitoring:**
   - Periodic session validation (every 5 minutes)
   - Preemptive QR generation before session expires
   - Alert admin before session dies

3. **Alternative Approach:**
   - Use WhatsApp Business API (official, more stable)
   - Cost: ~$0.005 per message (vs free with Baileys)
   - Benefit: Much more stable, no QR codes needed

**Files to Modify:**
- `src/providers/BaileysProvider.ts` - Add session health checks
- `src/api/health.ts` - Add session status to health endpoint
- New: `src/services/SessionRecovery.ts` - Automatic recovery logic

---

## =· IMPORTANT - Testing & Quality

### 5. Test Coverage Improvement
**Status:** 40% coverage, target 90%+
**Current:** 392 tests exist but low coverage

**What's Missing:**
-  Hebrew date parser tests (exist)
-  Hebrew calendar phase tests (exist)
- L Plugin system tests (missing)
- L Pipeline orchestrator tests (missing)
- L Cost tracker tests (missing)
- L Ensemble classifier tests (missing)
- L Phase 4-9 tests (missing)
- L MessageRouter tests (minimal)
- L StateRouter tests (minimal)

**Impact:** MEDIUM - Low confidence when making changes

**Effort:** ~1 week

**Target Coverage:**
- Unit Tests: 90%+
- Integration Tests: 80%+
- E2E Tests: All 46 QA conversations passing

---

### 6. Integration Tests
**Status:** Only 2 integration test files exist

**What's Missing:**
- Database integration tests (CRUD operations)
- Redis integration tests (caching, sessions)
- External API integration tests (Hebcal, AI models)
- End-to-end pipeline tests (message í response)
- Multi-user concurrency tests

**Impact:** MEDIUM - Can't test system interactions

**Effort:** ~3-4 days

---

### 7. Load Testing
**Status:** L NOT IMPLEMENTED
**Mentioned In:** `docs/REWRITE_V2_PLAN.md`

**Description:**
No load testing has been performed. Current system handles ~10 concurrent users, but:
- L No stress testing
- L No capacity planning
- L No bottleneck identification
- L No scalability metrics

**What to Test:**
- 100 concurrent users
- 1,000 messages/minute
- Database query performance under load
- Redis cache hit rate
- AI API rate limits
- Memory usage over time

**Impact:** MEDIUM - Unknown system limits

**Effort:** ~2 days

**Tools:**
- k6 (load testing)
- Artillery (HTTP load testing)
- Custom WhatsApp message simulator

---

### 8. Performance Metrics Collection
**Status:** L NOT MEASURED

**What's Missing:**
- Response time tracking (p50, p95, p99)
- Memory usage monitoring
- Database query performance
- Redis operation latency
- AI API latency breakdown
- Message processing throughput

**Impact:** MEDIUM - Can't optimize what we don't measure

**Effort:** ~1-2 days

**Implementation:**
- Add `prom-client` (Prometheus metrics)
- Track key metrics in PipelineOrchestrator
- Export metrics to Prometheus/Grafana
- Set up alerting for anomalies

---

## =‚ NICE-TO-HAVE - Features

### 9. Database Migration Automation
**Status:** † MANUAL PROCESS
**Migrations Exist:** 8 migration files in `/migrations`

**What's Missing:**
- L No migration runner script
- L No migration rollback support
- L No migration status tracking
- L Manual SQL execution required

**Current Process:**
```bash
# Manual (error-prone):
ssh root@167.71.145.9
cd /root/wAssitenceBot
psql -d whatsapp_bot -f migrations/1739000000000_add-cost-tracking.sql
```

**Desired Process:**
```bash
# Automated:
npm run migrate:up
npm run migrate:status
npm run migrate:rollback
```

**Impact:** LOW - But improves developer experience

**Effort:** ~1 day

**Tools:**
- `node-pg-migrate` or `db-migrate`
- Track migrations in DB table
- Automatic up/down migrations

---

### 10. Voice Transcription API Integration
**Status:** † NORMALIZER EXISTS, NO TRANSCRIPTION
**Location:** `src/domain/phases/phase10-voice/VoiceNormalizerPhase.ts`

**What's Implemented:**
-  VoiceNormalizerPhase (cleans up transcribed text)
-  Hebrew number conversion
-  Transcription error fixes

**What's Missing:**
- L Actual voice-to-text API integration
- L Audio file handling
- L Voice message detection
- L Transcription quality assessment

**Impact:** LOW - Voice messages currently don't work at all

**Effort:** ~2-3 days

**Options:**
1. **OpenAI Whisper API** - $0.006/minute, excellent Hebrew support
2. **Google Speech-to-Text** - $0.016/minute, good Hebrew support
3. **AssemblyAI** - $0.00025/second, good accuracy

**Implementation:**
```typescript
// Detect voice message
if (message.content.type === 'audio') {
  // Download audio file
  const audioBuffer = await downloadAudio(message.content.url);

  // Transcribe with Whisper
  const transcription = await openai.audio.transcriptions.create({
    file: audioBuffer,
    model: "whisper-1",
    language: "he"
  });

  // Pass to VoiceNormalizerPhase
  const normalizedText = await voiceNormalizer.execute(transcription.text);
}
```

---

### 11. Security Audit
**Status:** L NOT PERFORMED
**Mentioned In:** `docs/REWRITE_V2_PLAN.md`

**What to Audit:**
1. **Authentication:**
   - PIN-based security (is 6-digit enough?)
   - Session token security (TTL, storage)
   - Phone number verification

2. **Authorization:**
   - User data isolation (can users access others' data?)
   - Admin-only endpoints protection
   - SQL injection prevention

3. **Data Protection:**
   - PII handling (phone numbers, names)
   - API key security (stored in .env)
   - Database encryption at rest
   - TLS in transit

4. **Input Validation:**
   - SQL injection testing
   - XSS testing (dashboard)
   - Command injection (Bash commands)

5. **Rate Limiting:**
   - Prevent brute force on PIN
   - Prevent API abuse
   - Prevent DDoS attacks

**Impact:** MEDIUM - Production system handling user data

**Effort:** ~2-3 days

**Tools:**
- OWASP ZAP (security scanner)
- SQLMap (SQL injection testing)
- Burp Suite (penetration testing)

---

### 12. Event Templates
**Status:** L NOT IMPLEMENTED

**Description:**
Users should be able to save and reuse event templates for common scenarios:
- "—”ŸÁÍ ”›" í Always at 8 AM, location: Maccabi
- "‰“ŸÈÍ ‘’ËŸ›" í Always at school, 1 hour duration
- "ÈŸ‚’Ë Ÿ’“‘" í Every Monday 7 PM

**Impact:** LOW - Nice quality-of-life feature

**Effort:** ~2-3 days

**Implementation:**
```typescript
// User creates template
User: "Èﬁ’Ë Í—‡ŸÍ - —”ŸÁÍ ”› —-ﬁ€—Ÿ —È‚‘ 8 ——’ÁË"
Bot: " Í—‡ŸÍ ‡ÈﬁË‘!"

// User uses template
User: "Á—‚ —”ŸÁÍ ”› —Ÿ’› Ë–È’ﬂ"
Bot: [Applies template: location=ﬁ€—Ÿ, time=08:00]
Bot: "=À —”ŸÁÍ ”› —Ÿ’› Ë–È’ﬂ 13/10 —È‚‘ 08:00 —ﬁ€—Ÿ. ‡€’ﬂ?"
```

---

### 13. Export/Import Functionality
**Status:** L NOT IMPLEMENTED

**What's Missing:**
- L Export events to iCal (.ics)
- L Export to Google Calendar
- L Export to CSV
- L Import from other calendars
- L Backup/restore user data

**Impact:** LOW - But useful for data portability

**Effort:** ~2 days

**Use Cases:**
1. User wants to see events in Google Calendar
2. User wants backup before deleting old events
3. User switching from another calendar app

---

## =5 ENHANCEMENTS - AI/ML

### 14. Model Fine-tuning
**Status:** Using off-the-shelf models

**Description:**
Currently using GPT-4o-mini, Gemini Flash, Claude Haiku without any fine-tuning.

**What Could Be Better:**
- L No custom training on user's specific language patterns
- L No fine-tuning for Hebrew event creation
- L No domain-specific vocabulary (medical appointments, etc.)

**Impact:** LOW - Current models work well

**Effort:** ~1 week + ongoing maintenance

**Approach:**
1. Collect 1,000+ labeled conversations
2. Fine-tune GPT-4o-mini on OpenAI
3. Test accuracy improvement (expect 2-5% gain)
4. Cost/benefit analysis (is it worth it?)

---

### 15. Intent Confidence Threshold Tuning
**Status:** † FIXED THRESHOLDS

**Current Thresholds:**
- 3/3 models agree í 95% confidence
- 2/3 models agree í 85% confidence
- No agreement í 60% confidence (ask user)

**What's Missing:**
- L No A/B testing of different thresholds
- L No per-intent threshold optimization
- L No user-specific threshold adjustment

**Impact:** LOW - Current thresholds work reasonably well

**Effort:** ~2-3 days

**Experiment:**
- Try different thresholds (90%/80%/70%)
- Measure false positive rate
- Measure user frustration (how often they correct bot)
- Find optimal balance

---

### 16. A/B Testing Framework
**Status:** L NOT IMPLEMENTED

**Description:**
No framework to test:
- Ensemble (3 models) vs single model performance
- Different AI model combinations
- Different prompt strategies
- Feature variations (with/without Hebrew calendar warnings)

**Impact:** LOW - Nice for optimization

**Effort:** ~2-3 days

**Implementation:**
```typescript
// Randomly assign users to groups
const userGroup = hashUserId(userId) % 2;

if (userGroup === 0) {
  // Group A: Ensemble AI
  result = await ensembleClassifier.execute();
} else {
  // Group B: Single model
  result = await singleModelClassifier.execute();
}

// Track metrics per group
trackMetrics(userGroup, result);
```

---

### 17. User Feedback Loop
**Status:** L NOT IMPLEMENTED

**Description:**
No mechanism to collect user feedback on bot accuracy:
- L No "Was this correct?" button
- L No correction tracking
- L No feedback to improve models

**Impact:** LOW - But valuable for continuous improvement

**Effort:** ~2-3 days

**Implementation:**
```
Bot: " ŸÊËÍŸ –ŸË’‚: ‰“ŸÈ‘ ‚› ”‡Ÿ —Ÿ’› È‹ŸÈŸ 15:00"
Bot: "‘–› ‘—‡ÍŸ ‡€’ﬂ? =M €ﬂ / =N ‹–"

User: =N
Bot: "ﬁ‘ ‘ŸŸÍ‘ ‘€’’‡‘ È‹⁄?" [Collect correction]

í Store correction for future model training
```

---

## =„ INFRASTRUCTURE

### 18. Monitoring & Alerting
**Status:** † MINIMAL

**What Exists:**
-  Health check endpoint (`/health`)
-  Cost tracking with WhatsApp alerts

**What's Missing:**
- L No uptime monitoring (Pingdom, UptimeRobot)
- L No error rate alerting
- L No performance degradation detection
- L No disk space monitoring
- L No memory leak detection

**Impact:** MEDIUM - Reactive instead of proactive

**Effort:** ~1 day

**Tools:**
- UptimeRobot (free uptime monitoring)
- Sentry (error tracking)
- Prometheus + Grafana (metrics)
- PM2 monitoring (built-in)

---

### 19. Backup Strategy
**Status:** L NOT AUTOMATED

**What's Missing:**
- L No automated PostgreSQL backups
- L No backup retention policy
- L No backup testing/restoration practice
- L No disaster recovery plan

**Impact:** HIGH - Risk of data loss

**Effort:** ~1 day

**Implementation:**
```bash
# Automated daily backups
#!/bin/bash
# cron: 0 2 * * * (every day at 2 AM)

BACKUP_DIR=/root/backups
DATE=$(date +%Y-%m-%d)

# Backup PostgreSQL
pg_dump whatsapp_bot > $BACKUP_DIR/db_$DATE.sql

# Backup Redis (if needed)
redis-cli SAVE
cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis_$DATE.rdb

# Upload to cloud storage (optional)
# aws s3 cp $BACKUP_DIR/ s3://whatsapp-bot-backups/ --recursive

# Delete backups older than 30 days
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
```

---

### 20. Deployment Automation
**Status:** † MOSTLY AUTOMATED

**What's Automated:**
-  GitHub Actions CI/CD
-  Automatic deployment on push to main
-  Health check after deployment

**What's Manual:**
- † Database migrations (manual SQL execution)
- † Environment variable updates
- † PM2 restart with --update-env
- † QR code scanning after session corruption

**Impact:** LOW - Current automation is good enough

**Effort:** ~1-2 days

**Improvements:**
- Auto-run migrations during deployment
- Auto-reload .env without PM2 restart
- Zero-downtime deployment (blue/green)

---

### 21. API Documentation
**Status:** L NOT DOCUMENTED

**What's Missing:**
- L No OpenAPI/Swagger docs
- L No internal API documentation
- L No endpoint examples
- L No webhook documentation

**Current Endpoints:**
- `GET /health` - Health check
- `GET /d/:token` - Dashboard (15min TTL)

**Impact:** LOW - Internal APIs, no external consumers

**Effort:** ~1 day

---

## =» Summary Statistics

| Category | Total Features | Critical | Important | Nice-to-Have |
|----------|----------------|----------|-----------|--------------|
| **Core Features** | 4 | 4 | 0 | 0 |
| **Testing & Quality** | 4 | 0 | 4 | 0 |
| **Features** | 5 | 0 | 0 | 5 |
| **AI/ML** | 4 | 0 | 0 | 4 |
| **Infrastructure** | 4 | 1 | 2 | 1 |
| **TOTAL** | **21** | **5** | **6** | **10** |

---

## <Ø Recommended Priority Order

### Phase 1: Critical Fixes (1-2 weeks)
1. P **Phase 3: Entity Extraction** - Core pipeline gap
2. P **Phase 10: Validation & Enrichment** - Data quality
3. P **Comprehensive Production Testing** - Verify "smart enough"
4. P **WhatsApp Session Stability** - Reliability issue

### Phase 2: Quality Improvements (1 week)
5. Test coverage improvement (40% í 90%)
6. Integration tests
7. Performance metrics collection

### Phase 3: Infrastructure (1 week)
8. Automated backups † HIGH PRIORITY
9. Monitoring & alerting
10. Database migration automation

### Phase 4: Features (2-3 weeks)
11. Voice transcription integration
12. Event templates
13. Export/import functionality

### Phase 5: Optimization (ongoing)
14. Security audit
15. Load testing
16. Model fine-tuning
17. A/B testing framework

---

## =› Notes

**From Conversation Context:**
- User said "ultrathink" multiple times í Expects thorough, comprehensive analysis
- User asked to "run prods converstions again to see that smart enough" í Explicitly wanted testing
- User focused on cost optimization í Removed duplicate API calls, cost tracking is important
- User cares about documentation cleanup í This list helps track what's left to do

**Design Philosophy:**
- "Done is better than perfect" - Ship working features, iterate later
- Focus on user value first, optimization second
- Measure before optimizing (hence performance metrics)
- Test coverage is important for confidence in changes

---

**Created:** 2025-10-12
**Based On:** Comprehensive analysis of:
- Conversation history (9+ messages)
- Codebase review (50+ files)
- Documentation review (9 essential docs)
- Production logs analysis
- User requests and feedback

**Next Steps:**
1. Review this list with user 
2. Prioritize features based on user needs
3. Create implementation tickets
4. Estimate effort and timeline
5. Start with Phase 1 (Critical Fixes)
