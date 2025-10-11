# 🏗️ WhatsApp Assistant Bot v2.0 - Complete Rewrite Plan

**Started:** 2025-10-12
**Safe Rollback Point:** Commit `3bb8609`
**Strategy:** TDD (Tests First) with 90%+ coverage
**Timeline:** Implement phase-by-phase, running QA after each

---

## 📊 **Current State Snapshot**

### Existing Features (Working)
- ✅ Event creation/deletion with NLP
- ✅ Reminder system with BullMQ
- ✅ User authentication (PIN-based)
- ✅ Dashboard with secure tokens
- ✅ NLP with OpenAI GPT-4o-mini / Gemini
- ✅ Hebrew date parsing (basic)
- ✅ Multi-user support
- ✅ WhatsApp integration (Baileys)
- ✅ PostgreSQL + Redis
- ✅ GitHub Actions CI/CD

### Current Architecture Issues
- ❌ Monolithic NLPService (1000+ lines)
- ❌ No plugin system (hard to extend)
- ❌ No Hebrew calendar integration
- ❌ No cost tracking
- ❌ Single AI model (no ensemble)
- ❌ No voice message support
- ❌ Limited multi-event detection
- ❌ No user profiles/patterns
- ❌ No structured comments

---

## 🎯 **v2.0 Goals**

### New Architecture
1. **Modular Monolith** with plugin system
2. **10-Phase Pipeline** for message processing
3. **Hexagonal Architecture** (ports & adapters)
4. **Repository Pattern** for data access
5. **90%+ test coverage** (TDD approach)

### New Features (Priority Order)
1. ⭐ **Hebrew Calendar Integration** (holidays, Shabbat)
2. 💰 **Cost Tracking** + WhatsApp alerts ($10 threshold)
3. 🤖 **Ensemble AI** (3 models voting: GPT-4o-mini, Gemini, Claude Haiku)
4. 👤 **User Profiles & Smart Defaults**
5. 🔄 **Update/Delete Improvements** (fuzzy matching)
6. 📊 **Multi-Event Detection** (split & process)
7. 🔁 **Recurrence Patterns** (RRULE support)
8. 💬 **Structured Comment System**
9. 👥 **Multi-Participant Events**
10. 🎤 **Voice Message Support** (normalization)

---

## 📂 **New Project Structure**

```
src/
├── infrastructure/          # Layer 1: External world
│   ├── whatsapp/
│   ├── database/
│   │   └── repositories/   # NEW: Repository pattern
│   └── external/           # NEW: External API clients
│       ├── gemini/
│       ├── openai/
│       ├── anthropic/      # Claude
│       ├── hebcal/         # Hebrew calendar API
│       └── voice/          # Voice transcription
│
├── adapters/                # Layer 2: Interface to core
│   └── routers/
│
├── domain/                  # Layer 3: CORE (main work here!)
│   ├── orchestrator/       # NEW: Pipeline coordinator
│   ├── phases/             # NEW: All 10 phases
│   │   ├── phase0-preprocess/
│   │   ├── phase1-intent/
│   │   ├── phase2-multi-event/
│   │   ├── phase3-extraction/
│   │   ├── phase4-hebrew-calendar/  ⭐ CRITICAL
│   │   ├── phase5-profile/
│   │   ├── phase6-completeness/
│   │   ├── phase7-validation/
│   │   ├── phase8-confidence/
│   │   ├── phase9-event-management/
│   │   └── phase10-response/
│   ├── entities/
│   └── services/
│
├── plugins/                 # NEW: Plugin system
│   ├── IPlugin.ts
│   ├── PluginManager.ts
│   └── registry.ts
│
└── shared/                  # Cross-cutting
    ├── logger.ts
    ├── errors/
    └── utils/
```

---

## 🧪 **Testing Strategy**

### Test Pyramid
```
         /\
        /E2E\ (10% - 46 QA conversations)
       /──────\
      /  INT   \ (30% - Integration tests)
     /──────────\
    / UNIT (60%) \ (Unit tests for each phase/plugin)
   /──────────────\
```

### Coverage Goals
- **Unit Tests**: 90%+ coverage
- **Integration Tests**: Critical paths covered
- **E2E Tests**: All 46 QA conversations passing

### Testing Tools
- Jest (unit + integration)
- Playwright (E2E if needed)
- Custom QA runner (Hebrew conversations)

---

## 🔄 **Implementation Phases**

### **Phase 0: Foundation** (Current - Week 1)
- [x] Secure API keys
- [x] Create backup system
- [x] Install dependencies
- [x] Commit safe point
- [ ] Write tests for existing functionality
- [ ] Create architecture skeleton

### **Phase 1: Hebrew Calendar** (Week 1-2) ⭐ CRITICAL
**Priority: #1**

**Test First:**
- [ ] Test: Event on Yom Kippur → Block warning
- [ ] Test: Event on Shabbat → Warning
- [ ] Test: Event on Friday evening → Shabbat warning
- [ ] Test: No location → Default Jerusalem times
- [ ] Test: Different Israeli cities → Different Shabbat times

**Implementation:**
- [ ] Hebcal client (plugin)
- [ ] Holiday checker
- [ ] Shabbat calculator (location-aware)
- [ ] Integration with Phase 7 (validation)

**QA:** Run all date-related conversations

---

### **Phase 2: Cost Tracking** (Week 2) 💰
**Priority: #2**

**Test First:**
- [ ] Test: Track API costs per request
- [ ] Test: Accumulate costs
- [ ] Test: Send WhatsApp alert at $10 threshold
- [ ] Test: Cost breakdown by model

**Implementation:**
- [ ] Cost tracker service
- [ ] WhatsApp notification (to +972544345287)
- [ ] Cost dashboard endpoint
- [ ] Cost logging

**QA:** Monitor costs during QA runs

---

### **Phase 3: Ensemble AI** (Week 2-3) 🤖
**Priority: #3**

**Test First:**
- [ ] Test: 3 models vote on classification
- [ ] Test: 3/3 agreement → 95% confidence
- [ ] Test: 2/3 agreement → 85% confidence
- [ ] Test: No agreement → Ask user
- [ ] Test: Cost tracking integrated

**Implementation:**
- [ ] Ensemble classifier
- [ ] Voting mechanism
- [ ] Confidence aggregation
- [ ] Parallel API calls (Promise.all)

**QA:** Run all ambiguous conversations

---

### **Phase 4: User Profiles** (Week 3) 👤
**Priority: #4**

**Test First:**
- [ ] Test: Store default location
- [ ] Test: Store preferred times
- [ ] Test: Learn patterns (always blood test at 8 AM)
- [ ] Test: Apply smart defaults

**Implementation:**
- [ ] User profile schema (DB migration)
- [ ] Pattern learner (AI-powered)
- [ ] Defaults applier
- [ ] Profile management endpoints

**QA:** Create user, test pattern learning

---

### **Phase 5: Update/Delete Improvements** (Week 3-4) 🔄
**Priority: #5**

**Test First:**
- [ ] Test: Fuzzy match event titles
- [ ] Test: Update by partial title
- [ ] Test: Delete by partial title
- [ ] Test: Multiple matches → Ask user

**Implementation:**
- [ ] Fuzzy matcher (Levenshtein distance)
- [ ] Smart search
- [ ] Clarification flow
- [ ] Bulk operations

**QA:** Run all update/delete conversations

---

### **Phase 6: Multi-Event Detection** (Week 4) 📊
**Priority: #6**

**Test First:**
- [ ] Test: "Meeting Monday and Tuesday" → 2 events
- [ ] Test: "Meeting Monday 8-10" → 1 event (duration)
- [ ] Test: Split and process separately

**Implementation:**
- [ ] Multi-event detector
- [ ] Event splitter
- [ ] Conjunction parser ("ו", "גם", "ועוד")

**QA:** Run multi-event conversations

---

### **Phase 7: Recurrence Patterns** (Week 4-5) 🔁
**Priority: #7**

**Test First:**
- [ ] Test: "Every day at 8" → Daily recurrence
- [ ] Test: "Every Sunday" → Weekly recurrence
- [ ] Test: Exclude Shabbat
- [ ] Test: RRULE generation

**Implementation:**
- [ ] Recurrence parser
- [ ] RRULE generator
- [ ] Recurrence instance generator
- [ ] Exclude holidays/Shabbat

**QA:** Run all recurrence conversations

---

### **Phase 8: Comment System** (Week 5) 💬
**Priority: #8**

**Test First:**
- [ ] Test: Add comment to event
- [ ] Test: Comment with priority
- [ ] Test: Comment with reminder
- [ ] Test: View/update/delete comments

**Implementation:**
- [ ] Comment schema (DB migration)
- [ ] Comment CRUD operations
- [ ] Comment formatting
- [ ] Reminder from comment

**QA:** Test comment workflows

---

### **Phase 9: Multi-Participant** (Week 5-6) 👥
**Priority: #9**

**Test First:**
- [ ] Test: "Meeting for me and Mom" → 2 participants
- [ ] Test: Single event or separate?
- [ ] Test: Participant roles

**Implementation:**
- [ ] Participant parser
- [ ] Participant schema (DB migration)
- [ ] Clarification flow (together or separate)

**QA:** Test participant workflows

---

### **Phase 10: Voice Support** (Week 6) 🎤
**Priority: #10**

**Test First:**
- [ ] Test: Voice transcription errors fixed
- [ ] Test: "בדיקה ת דם" → "בדיקת דם"
- [ ] Test: Hebrew number words → Digits
- [ ] Test: Low confidence → Ask user

**Implementation:**
- [ ] Voice normalizer (plugin)
- [ ] Transcription error fixer
- [ ] Hebrew number converter
- [ ] Confidence checker

**QA:** Test voice message simulations

---

## 📝 **Database Migrations**

### Migration 1: User Profiles
```sql
ALTER TABLE users ADD COLUMN default_location TEXT;
ALTER TABLE users ADD COLUMN patterns_jsonb JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN preferred_time_of_day TEXT;
```

### Migration 2: Event Participants
```sql
CREATE TABLE event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  contact_id UUID REFERENCES contacts(id),
  role TEXT CHECK (role IN ('primary', 'companion')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migration 3: Structured Comments
```sql
-- Already have EventComment[] in notes field (JSONB)
-- No migration needed, just validate structure
```

### Migration 4: Cost Tracking
```sql
CREATE TABLE ai_cost_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  cost_usd NUMERIC(10, 6) NOT NULL,
  tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_log_user ON ai_cost_log(user_id);
CREATE INDEX idx_cost_log_created ON ai_cost_log(created_at);
```

---

## 🎯 **Success Criteria**

### Code Quality
- ✅ 90%+ test coverage
- ✅ No TypeScript errors
- ✅ ESLint passing
- ✅ All tests passing

### Feature Completion
- ✅ All 10 phases implemented
- ✅ All 46 QA conversations passing
- ✅ Hebrew calendar warnings working
- ✅ Cost tracking active
- ✅ Ensemble AI operational

### Performance
- ✅ Response time < 2s (95th percentile)
- ✅ API costs < $50/month (target)
- ✅ No memory leaks
- ✅ Handle 100+ concurrent users

---

## 🚨 **Rollback Plan**

If anything goes wrong:

```bash
# Restore code
git reset --hard 3bb8609

# Restore database (if needed)
npm run restore:db

# Restart bot
pm2 restart ultrathink
```

---

## 📊 **Progress Tracking**

Track daily progress in this document:

| Date | Phase | Tests Written | Tests Passing | Coverage | Notes |
|------|-------|--------------|---------------|----------|-------|
| 2025-10-12 | Phase 0 | - | - | - | Safe point committed |
| - | Phase 1 | - | - | - | Starting Hebrew calendar |
| - | - | - | - | - | - |

---

**Last Updated:** 2025-10-12
**Next Steps:** Write tests for existing functionality, then start Phase 1 (Hebrew Calendar)
