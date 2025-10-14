# 🧠 Resource Usage Analysis & Optimization

**Date:** October 14, 2025
**Status:** ⚠️ OPTIMIZATION REQUIRED
**Current Redis Memory:** 941 KB (baseline, 0 keys)

---

## 🔍 **Current State Analysis**

### **Redis Configuration Issues:**
```
✅ used_memory: 941 KB (baseline)
❌ maxmemory: 0 (UNLIMITED - DANGEROUS!)
❌ maxmemory_policy: noeviction (will crash if full!)
⚠️ keys: 0 (bot hasn't processed messages yet)
```

**CRITICAL ISSUES IDENTIFIED:**
1. ❌ **No memory limit** - Redis can grow unbounded
2. ❌ **No eviction policy** - Will crash on OOM
3. ⚠️ **TTLs may be too long** - 48h for message dedup is excessive

---

## 📊 **Projected Memory Usage**

### **Scenario 1: Normal Operation (100 messages/day)**

**Layer 1: Message ID Deduplication**
```
Keys: 100 msg/day × 48h TTL = 4,800 keys
Size per key:
  - Key: "msg:processed:3EB0FA6C2B4E8A6D9F1E" (~40 bytes)
  - Value: '{"processedAt":1728936000,"metadata":"processed"}' (~60 bytes)
  - Redis overhead: ~100 bytes (hash table, expiry tracking)
  - Total: ~200 bytes per key

Memory: 4,800 keys × 200 bytes = 960 KB
```

**Layer 2: Content Caching**
```
Keys: 30 unique queries/day × 24h TTL = 30 keys (high reuse)
Size per key:
  - Key: "nlp:intent:a3f5b2c8d1e4..." (~30 bytes)
  - Value: Full EnsembleResult JSON (~2 KB)
  - Redis overhead: ~100 bytes
  - Total: ~2.1 KB per key

Memory: 30 keys × 2.1 KB = 63 KB
```

**Layer 3: Rate Limit Counters**
```
Keys:
  - Daily: 1 global + 10 users = 11 keys
  - Hourly: 1 global = 1 key
  - User: 10 users = 10 keys
  - Alerts: ~5 keys
  - Total: ~27 keys

Size per key: ~50 bytes (small integers)

Memory: 27 keys × 50 bytes = 1.35 KB
```

**Total Normal Usage: 960 + 63 + 1.35 ≈ 1.02 MB**

---

### **Scenario 2: Crash Loop (1,000 messages/hour for 24h)**

**Layer 1: Message Deduplication**
```
Keys: 24,000 messages × 48h TTL = 24,000 keys (but capped by TTL)
Memory: 24,000 × 200 bytes = 4.8 MB
```

**Layer 2: Content Cache**
```
Keys: ~200 unique queries × 24h = 200 keys
Memory: 200 × 2.1 KB = 420 KB
```

**Layer 3: Rate Limits**
```
Same as normal (~30 keys, 1.35 KB)
```

**Total Crash Loop: 4.8 + 0.42 + 0.0014 ≈ 5.22 MB**

---

### **Scenario 3: Worst Case (10,000 messages/day, 48h TTL)**

**Layer 1:**
```
Keys: 10,000 msg/day × 2 days = 20,000 keys
Memory: 20,000 × 200 bytes = 4 MB
```

**Layer 2:**
```
Keys: ~500 unique queries
Memory: 500 × 2.1 KB = 1.05 MB
```

**Layer 3:**
```
Keys: ~100 users × counters
Memory: 300 × 50 bytes = 15 KB
```

**Total Worst Case: 4 + 1.05 + 0.015 ≈ 5.06 MB**

---

## ⚠️ **Issues with Current Implementation**

### **1. Memory - Excessive TTLs**

**Issue:** 48-hour TTL for message deduplication is overkill

**Analysis:**
- Most bot restarts happen within minutes/hours
- Crash loops typically last 1-4 hours max
- 48h coverage means storing 2 days of all messages
- WhatsApp message IDs are already unique (no need for long-term storage)

**Impact:**
- 2x memory usage vs 24h TTL
- 4x memory usage vs 12h TTL

**Recommendation:** Reduce to **12-hour TTL**
- Still covers crash loops (typically <4h)
- Still covers multiple restarts per day
- Reduces memory usage by 75%

---

### **2. Redis Configuration - No Limits**

**Issue:** `maxmemory: 0` means unlimited growth

**Risk:**
- Redis can consume all system RAM
- System crashes if OOM
- No protection against memory leaks

**Impact:**
- If bug causes infinite key creation → system crash
- No early warning before disaster
- Hard to diagnose issues

**Recommendation:** Set **maxmemory: 50MB**
- 10x safety margin vs worst case (5 MB)
- Prevents runaway memory growth
- Enables eviction policies

---

### **3. Eviction Policy - noeviction is Dangerous**

**Issue:** `maxmemory_policy: noeviction` means Redis crashes when full

**Risk:**
- When maxmemory reached → Redis stops accepting writes
- Bot can't store dedup keys → duplicate processing
- Could trigger crash loop from errors

**Impact:**
- Service disruption
- API cost spikes (no dedup protection)
- Requires manual intervention

**Recommendation:** Set **maxmemory_policy: allkeys-lru**
- Automatically evicts least recently used keys
- Graceful degradation (some dedup lost, but service continues)
- Self-healing under memory pressure

---

### **4. Metadata Storage - Wasteful**

**Issue:** Storing full JSON in dedup keys

```typescript
// Current (60 bytes):
'{"processedAt":1728936000,"metadata":"processed"}'

// Optimized (1 byte):
'1'
```

**Impact:**
- 60x memory waste
- Slower serialization/deserialization
- No actual use of metadata in code

**Recommendation:** Store minimal value (`'1'` or timestamp only)

---

### **5. No Monitoring - Blind to Issues**

**Issue:** No tracking of Redis memory or key count

**Risk:**
- Can't detect memory leaks
- No warning before hitting limits
- Can't measure effectiveness

**Impact:**
- Late detection of problems
- Hard to debug issues
- No optimization feedback

**Recommendation:** Add monitoring middleware

---

## ✅ **Optimized Solution**

### **Optimization 1: Reduce TTLs**

**Before:**
- Message dedup: 48 hours
- Content cache: 24 hours

**After:**
- Message dedup: **12 hours** (still covers crash loops)
- Content cache: **4 hours** (balances cost vs freshness)

**Memory Savings:**
- Dedup: 4.8 MB → 1.2 MB (75% reduction)
- Cache: 63 KB → 10 KB (84% reduction)
- **Total: 5.2 MB → 1.5 MB (71% reduction)**

---

### **Optimization 2: Compress Metadata**

**Before:**
```typescript
const value = JSON.stringify({
  processedAt: Date.now(),
  metadata: metadata || 'processed'
});
```

**After:**
```typescript
const value = Date.now().toString(); // Just timestamp
```

**Memory Savings:**
- Per key: 60 bytes → 13 bytes (78% reduction)
- Total: Negligible (already small), but cleaner

---

### **Optimization 3: Redis Configuration**

```bash
# Set memory limit (50 MB = 10x safety margin)
redis-cli CONFIG SET maxmemory 52428800

# Set eviction policy (LRU for graceful degradation)
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Persist to config file
redis-cli CONFIG REWRITE
```

---

### **Optimization 4: Add Monitoring**

```typescript
// Track Redis memory usage every 10 minutes
setInterval(async () => {
  const info = await redis.info('memory');
  const usedMemory = parseInt(info.match(/used_memory:(\d+)/)[1]);
  const maxMemory = parseInt(info.match(/maxmemory:(\d+)/)[1]);

  const usagePct = (usedMemory / maxMemory) * 100;

  if (usagePct > 80) {
    logger.warn('⚠️ Redis memory high', { usagePct, usedMemory, maxMemory });
  }

  if (usagePct > 90) {
    logger.error('🚨 Redis memory critical!', { usagePct });
    await sendAdminAlert(`Redis memory at ${usagePct}%!`);
  }
}, 600000); // 10 minutes
```

---

### **Optimization 5: Key Count Monitoring**

```typescript
// Track key counts by pattern
const dedupCount = await redis.eval(`
  return #redis.call('KEYS', 'msg:processed:*')
`, 0);

const cacheCount = await redis.eval(`
  return #redis.call('KEYS', 'nlp:intent:*')
`, 0);

logger.info('📊 Redis key stats', {
  dedup: dedupCount,
  cache: cacheCount,
  total: dedupCount + cacheCount
});
```

---

## 📊 **Final Resource Profile**

### **After Optimizations:**

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| **Normal Memory** | 1.02 MB | 350 KB | 66% |
| **Crash Loop Memory** | 5.22 MB | 1.5 MB | 71% |
| **Worst Case Memory** | 5.06 MB | 1.8 MB | 64% |
| **Message Dedup TTL** | 48h | 12h | 75% |
| **Content Cache TTL** | 24h | 4h | 83% |
| **Metadata Size** | 60 bytes | 13 bytes | 78% |
| **Redis Max Memory** | Unlimited | 50 MB | Bounded |
| **Eviction Policy** | noeviction | allkeys-lru | Resilient |

---

## 🎯 **Optimal Configuration**

### **Redis Settings:**
```ini
# /etc/redis/redis.conf (or via CONFIG SET)

# Memory limit: 50 MB (10x safety margin)
maxmemory 52428800

# Eviction: LRU (graceful degradation)
maxmemory-policy allkeys-lru

# Persistence: RDB snapshots (balance safety vs performance)
save 900 1      # Save after 15 min if 1 key changed
save 300 10     # Save after 5 min if 10 keys changed
save 60 10000   # Save after 1 min if 10k keys changed

# AOF disabled (RDB sufficient for caching use case)
appendonly no
```

### **Application Settings:**
```typescript
// Layer 1: Message Deduplication
const MESSAGE_DEDUP_TTL = 43200; // 12 hours (down from 48h)

// Layer 2: Content Caching
const CONTENT_CACHE_TTL = 14400; // 4 hours (down from 24h)

// Layer 4: Startup Grace Period
const STARTUP_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes (unchanged)
```

---

## 🧪 **Testing Resource Usage**

### **Test 1: Memory Usage Under Load**
```bash
# Before test: Check baseline
redis-cli INFO memory | grep used_memory_human

# Simulate 1000 messages
for i in {1..1000}; do
  redis-cli SETEX "msg:processed:TEST_$i" 43200 "$(date +%s)"
done

# After test: Check memory
redis-cli INFO memory | grep used_memory_human
# Expected: ~200 KB increase (1000 × 200 bytes)

# Check key count
redis-cli DBSIZE
# Expected: 1000 keys

# Cleanup
redis-cli FLUSHDB
```

### **Test 2: TTL Expiry**
```bash
# Set key with 10 second TTL
redis-cli SETEX "test:ttl" 10 "value"

# Check TTL
redis-cli TTL "test:ttl"
# → 10 (seconds)

# Wait 11 seconds
sleep 11

# Check if expired
redis-cli EXISTS "test:ttl"
# → 0 (key expired automatically)
```

### **Test 3: Eviction Policy**
```bash
# Set maxmemory to 1 MB for testing
redis-cli CONFIG SET maxmemory 1048576
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Fill Redis beyond limit
for i in {1..10000}; do
  redis-cli SET "test:$i" "$(head -c 200 /dev/urandom | base64)"
done

# Check if eviction worked (should be < 1 MB)
redis-cli INFO memory | grep used_memory_human
# Expected: ~1 MB (evicted old keys)

# Cleanup
redis-cli FLUSHDB
redis-cli CONFIG SET maxmemory 52428800 # Restore 50 MB
```

### **Test 4: Monitoring Alerts**
```typescript
// Simulate high memory usage
const testKeys = 100000;
for (let i = 0; i < testKeys; i++) {
  await redis.setex(`test:load:${i}`, 3600, 'x'.repeat(1000));
}

// Should trigger warning at 80% and alert at 90%
// Check logs for: "⚠️ Redis memory high" or "🚨 Redis memory critical!"
```

---

## 📈 **Monitoring Dashboard**

### **Key Metrics:**
```typescript
interface RedisMetrics {
  usedMemory: number;      // Bytes
  maxMemory: number;       // Bytes
  usagePercent: number;    // 0-100
  keyCount: number;        // Total keys
  dedupKeys: number;       // msg:processed:* count
  cacheKeys: number;       // nlp:intent:* count
  evictedKeys: number;     // Keys evicted by LRU
  hitRate: number;         // Cache hit %
}
```

### **Alert Thresholds:**
```typescript
const THRESHOLDS = {
  memoryWarning: 80,    // 80% → log warning
  memoryCritical: 90,   // 90% → admin alert
  keyCountHigh: 50000,  // 50k keys → investigate
  hitRateLow: 30,       // <30% cache hit → optimize
};
```

---

## 🚀 **Deployment Plan**

### **Phase 1: Configuration (Immediate)**
```bash
# Set Redis limits
redis-cli CONFIG SET maxmemory 52428800
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG REWRITE

# Verify
redis-cli CONFIG GET maxmemory
redis-cli CONFIG GET maxmemory-policy
```

### **Phase 2: Code Optimization (Next)**
1. Update TTLs in code (12h dedup, 4h cache)
2. Simplify metadata storage (timestamp only)
3. Add monitoring middleware
4. Deploy to production

### **Phase 3: Monitoring (Ongoing)**
1. Track memory usage daily
2. Monitor key counts
3. Measure cache hit rates
4. Adjust TTLs if needed

---

## ✅ **Final Recommendations**

### **DO:**
- ✅ Set `maxmemory: 50MB` (safety limit)
- ✅ Set `maxmemory-policy: allkeys-lru` (graceful degradation)
- ✅ Reduce message dedup TTL to 12 hours (75% memory savings)
- ✅ Reduce content cache TTL to 4 hours (balance cost vs freshness)
- ✅ Store minimal metadata (timestamp only, not full JSON)
- ✅ Add memory monitoring (alert at 80%/90%)
- ✅ Monitor key counts (alert if >50k keys)

### **DON'T:**
- ❌ Leave maxmemory unlimited (dangerous!)
- ❌ Use noeviction policy (causes crashes)
- ❌ Use TTLs >12 hours (unnecessary for our use case)
- ❌ Store verbose metadata (wastes memory)
- ❌ Ignore monitoring (blind to issues)

---

## 📝 **Summary**

**Current Issues:**
1. ❌ No memory limit (can crash system)
2. ❌ No eviction policy (crashes when full)
3. ⚠️ TTLs too long (wastes memory)
4. ⚠️ Verbose metadata (inefficient)
5. ❌ No monitoring (blind operation)

**Optimized Solution:**
1. ✅ 50 MB memory limit (10x safety margin)
2. ✅ LRU eviction (graceful degradation)
3. ✅ 12h/4h TTLs (71% memory savings)
4. ✅ Minimal metadata (78% smaller)
5. ✅ Monitoring + alerts (proactive)

**Results:**
- **Memory:** 5.2 MB → 1.5 MB (71% reduction)
- **Safety:** Unbounded → Bounded (50 MB max)
- **Resilience:** Crash-prone → Self-healing (LRU eviction)
- **Visibility:** Blind → Monitored (alerts at 80%/90%)

**Cost Impact:** **NONE** - Optimizations are free!
- Still 97-99% cost reduction vs crash loop
- Better resource efficiency
- More reliable operation

---

**Status:** ⚠️ Optimization Required
**Priority:** HIGH (prevent future issues)
**Effort:** LOW (config + small code changes)
**Impact:** HIGH (71% memory savings + safety)

---

**Next Steps:**
1. Apply Redis configuration (5 minutes)
2. Update code with optimized TTLs (10 minutes)
3. Add monitoring middleware (15 minutes)
4. Test under load (30 minutes)
5. Deploy to production
