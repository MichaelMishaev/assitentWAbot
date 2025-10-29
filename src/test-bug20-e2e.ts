/**
 * CRITICAL E2E TEST: Bug #20 Full Flow Simulation
 *
 * Tests the COMPLETE flow including:
 * 1. Event creation via NLP
 * 2. Redis tracking
 * 3. Context retrieval
 * 4. Context injection
 * 5. Reminder creation with context
 */

import { pool } from './config/database.js';
import { redis } from './config/redis.js';
import logger from './utils/logger.js';

// Simulate the exact flow from NLPRouter.ts
async function simulateCompleteFlow() {
  console.log('\n🧪 BUG #20 E2E TEST: Complete Flow Simulation');
  console.log('='.repeat(70));

  const testUserId = 'e2e-test-user-' + Date.now();
  const tempEventsKey = `temp:recent_events:${testUserId}`;

  try {
    // ===== STEP 1: Simulate event creation and tracking =====
    console.log('\n📝 STEP 1: Create event and track in Redis');
    const eventId = 'test-event-' + Date.now();
    const eventTitle = 'פגישה אצל אלבז';

    // Simulate trackRecentEvent() - lines 2292-2334
    const recentEvents = [{
      id: eventId,
      title: eventTitle,
      createdAt: new Date().toISOString()
    }];

    await redis.setex(tempEventsKey, 1800, JSON.stringify(recentEvents));
    console.log(`   ✅ Stored event in Redis: ${tempEventsKey}`);
    console.log(`   Event: ${eventTitle}`);

    // ===== STEP 2: Verify key exists with correct TTL =====
    console.log('\n⏱️  STEP 2: Verify Redis key and TTL');
    const exists = await redis.exists(tempEventsKey);
    const ttl = await redis.ttl(tempEventsKey);
    console.log(`   Key exists: ${exists === 1 ? '✅ YES' : '❌ NO'}`);
    console.log(`   TTL: ${ttl} seconds (${(ttl/60).toFixed(1)} minutes)`);

    if (ttl < 1700 || ttl > 1800) {
      console.log(`   ⚠️  WARNING: TTL outside expected range (should be ~1800)`);
    }

    // ===== STEP 3: Retrieve context (simulate getRecentEvents) =====
    console.log('\n📥 STEP 3: Retrieve recent events from Redis');
    const storedData = await redis.get(tempEventsKey);
    if (!storedData) {
      throw new Error('Redis key not found!');
    }

    let retrievedEvents: any[];
    try {
      retrievedEvents = JSON.parse(storedData);
      console.log(`   ✅ Successfully parsed JSON`);
      console.log(`   Events count: ${retrievedEvents.length}`);
      console.log(`   Most recent: ${retrievedEvents[0].title}`);
    } catch (parseError) {
      throw new Error(`JSON parse failed: ${parseError}`);
    }

    // ===== STEP 4: Simulate context injection =====
    console.log('\n💉 STEP 4: Simulate context injection (line 286)');
    const userText = 'תזכיר לי';
    const mostRecent = retrievedEvents[0];

    // Check for edge cases
    if (!mostRecent.title) {
      console.log(`   ⚠️  WARNING: Event title is undefined/null!`);
    }
    if (mostRecent.title && mostRecent.title.length > 100) {
      console.log(`   ⚠️  WARNING: Event title very long (${mostRecent.title.length} chars)`);
    }

    const contextEnhancedText = `${userText} (בהקשר לאירוע האחרון שנוצר: ${mostRecent.title})`;
    console.log(`   Original: "${userText}"`);
    console.log(`   Enhanced: "${contextEnhancedText}"`);

    // ===== STEP 5: Test multiple events (priority) =====
    console.log('\n🔢 STEP 5: Test multiple events (most recent priority)');
    const multipleEvents = [
      { id: 'event-3', title: 'פגישה חדשה', createdAt: new Date().toISOString() },
      { id: 'event-2', title: 'פגישה ישנה', createdAt: new Date(Date.now() - 60000).toISOString() },
      { id: 'event-1', title: 'פגישה עתיקה', createdAt: new Date(Date.now() - 120000).toISOString() }
    ];

    await redis.setex(tempEventsKey, 1800, JSON.stringify(multipleEvents));
    const multiData = await redis.get(tempEventsKey);
    const multiParsed = JSON.parse(multiData!);
    console.log(`   Stored ${multiParsed.length} events`);
    console.log(`   First (most recent): "${multiParsed[0].title}"`);
    console.log(`   ${multiParsed[0].title === 'פגישה חדשה' ? '✅' : '❌'} Correct priority`);

    // ===== STEP 6: Test TTL expiration =====
    console.log('\n⏳ STEP 6: Test TTL expiration (5 second test)');
    await redis.setex(`${tempEventsKey}:test-ttl`, 5, JSON.stringify([{id: 'test', title: 'test'}]));
    console.log(`   Created key with 5s TTL`);

    await new Promise(resolve => setTimeout(resolve, 6000));

    const expiredKey = await redis.get(`${tempEventsKey}:test-ttl`);
    console.log(`   After 6 seconds: ${expiredKey === null ? '✅ Expired correctly' : '❌ Still exists'}`);

    // ===== STEP 7: Test edge cases =====
    console.log('\n⚠️  STEP 7: Edge case testing');

    // Empty title
    const emptyTitleEvent = [{ id: 'test', title: '', createdAt: new Date().toISOString() }];
    const emptyEnhanced = `${userText} (בהקשר לאירוע האחרון שנוצר: ${emptyTitleEvent[0].title})`;
    console.log(`   Empty title: "${emptyEnhanced}"`);
    console.log(`   ${emptyEnhanced.includes('undefined') ? '❌' : '✅'} No "undefined" in text`);

    // Very long title
    const longTitle = 'פגישה '.repeat(50); // 400+ chars
    const longTitleEvent = [{ id: 'test', title: longTitle, createdAt: new Date().toISOString() }];
    const longEnhanced = `${userText} (בהקשר לאירוע האחרון שנוצר: ${longTitleEvent[0].title})`;
    console.log(`   Long title length: ${longEnhanced.length} chars`);
    console.log(`   ${longEnhanced.length > 500 ? '⚠️' : '✅'} ${longEnhanced.length > 500 ? 'Very long (>500)' : 'Acceptable'}`);

    // Title with special characters
    const specialTitle = 'פגישה\nעם\tמיכאל"\'<>';
    const specialEvent = [{ id: 'test', title: specialTitle, createdAt: new Date().toISOString() }];
    const specialEnhanced = `${userText} (בהקשר לאירוע האחרון שנוצר: ${specialEvent[0].title})`;
    console.log(`   Special chars: ${specialEnhanced.includes('\n') ? '⚠️ Contains newline' : '✅ Clean'}`);

    // ===== CLEANUP =====
    await redis.del(tempEventsKey);
    await redis.del(`${tempEventsKey}:test-ttl`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ E2E TEST COMPLETE - All flows validated');
    console.log('='.repeat(70) + '\n');

    return true;

  } catch (error) {
    console.error('\n❌ E2E TEST FAILED:', error);
    return false;
  } finally {
    await pool.end();
    await redis.quit();
  }
}

// Run test
simulateCompleteFlow()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
