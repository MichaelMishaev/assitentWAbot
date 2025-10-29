/**
 * BUG #20 TEST: Context Awareness - "תזכיר לי" after event creation
 *
 * Simulates the exact user flow:
 * 1. User creates event "פגישה אצל אלבז מחר ב-15:00"
 * 2. User says "תזכיר לי"
 * 3. Bot should inject context and create reminder linked to event
 */

import { redis } from './config/redis.js';
import { NLPService } from './services/NLPService.js';
import { pool } from './config/database.js';
import logger from './utils/logger.js';

async function testBug20ContextAwareness() {
  console.log('\n🔍 BUG #20 TEST: Context Awareness');
  console.log('='.repeat(70));

  const nlpService = new NLPService();
  const testUserId = 'test-user-context-awareness';

  try {
    // STEP 1: Simulate event creation
    console.log('\n📌 STEP 1: User creates event');
    const eventMessage = 'פגישה אצל אלבז מחר ב-15:00';
    console.log(`   User: "${eventMessage}"`);

    const eventResult = await nlpService.parseIntent(eventMessage, [], 'Asia/Jerusalem');
    console.log(`   NLP: ${eventResult.intent} (confidence: ${eventResult.confidence})`);
    console.log(`   Event Title: ${eventResult.event?.title}`);

    if (eventResult.intent !== 'create_event') {
      console.log('   ❌ FAIL: Expected create_event intent');
      return false;
    }

    // STEP 2: Simulate tracking recent event (what NLPRouter.ts:767 does)
    console.log('\n📝 STEP 2: Track event in Redis (simulating NLPRouter.ts:767)');
    const eventId = 'test-event-123';
    const eventTitle = eventResult.event?.title || 'פגישה אצל אלבז';

    const key = `temp:recent_events:${testUserId}`;
    const recentEvents = [
      {
        id: eventId,
        title: eventTitle,
        createdAt: new Date().toISOString()
      }
    ];

    await redis.setex(key, 1800, JSON.stringify(recentEvents)); // 30 min TTL
    console.log(`   ✅ Stored in Redis: ${key}`);
    console.log(`   Event: ${eventTitle}`);

    // STEP 3: User says "תזכיר לי" WITHOUT reply-to context
    console.log('\n⏰ STEP 3: User says "תזכיר לי"');
    const reminderMessage = 'תזכיר לי';
    console.log(`   User: "${reminderMessage}"`);

    // Check that context exists in Redis
    const storedContext = await redis.get(key);
    console.log(`   Redis context exists: ${!!storedContext}`);

    // IMPORTANT: The actual context injection happens in NLPRouter.ts:275-303
    // Since we're testing NLP directly, we need to simulate the context enhancement
    // that NLPRouter would do

    // Simulate what NLPRouter.ts:286 does
    const contextEnhancedText = `${reminderMessage} (בהקשר לאירוע האחרון שנוצר: ${eventTitle})`;
    console.log(`   Enhanced text: "${contextEnhancedText}"`);

    const reminderResult = await nlpService.parseIntent(contextEnhancedText, [], 'Asia/Jerusalem');
    console.log(`   NLP: ${reminderResult.intent} (confidence: ${reminderResult.confidence})`);
    console.log(`   Reminder Title: ${reminderResult.reminder?.title}`);

    // STEP 4: Validate results
    console.log('\n✅ STEP 4: Validate Bug #20 fix');

    const tests = [
      {
        name: 'Intent is create_reminder',
        pass: reminderResult.intent === 'create_reminder',
        actual: reminderResult.intent
      },
      {
        name: 'Confidence ≥ 0.7',
        pass: reminderResult.confidence >= 0.7,
        actual: reminderResult.confidence
      },
      {
        name: 'Reminder title references event context',
        pass: reminderResult.reminder?.title?.includes('פגישה') ||
              reminderResult.reminder?.title?.includes('אלבז'),
        actual: reminderResult.reminder?.title
      }
    ];

    let allPass = true;
    tests.forEach(test => {
      const status = test.pass ? '✅' : '❌';
      console.log(`   ${status} ${test.name}`);
      if (!test.pass) {
        console.log(`      Expected: true, Got: ${test.actual}`);
        allPass = false;
      }
    });

    // STEP 5: Test without context (regression check)
    console.log('\n🔄 STEP 5: Regression check - "תזכיר לי" WITHOUT context');

    // Clear context
    await redis.del(key);
    console.log(`   Redis context cleared`);

    const noContextResult = await nlpService.parseIntent(reminderMessage, [], 'Asia/Jerusalem');
    console.log(`   NLP: ${noContextResult.intent} (confidence: ${noContextResult.confidence})`);
    console.log(`   Reminder Title: ${noContextResult.reminder?.title || '(empty)'}`);

    const shouldStillWork = noContextResult.intent === 'create_reminder' && noContextResult.confidence >= 0.95;
    console.log(`   ✅ Bug #12 still works: ${shouldStillWork ? 'YES' : 'NO'}`);

    // Cleanup
    await redis.del(key);

    console.log('\n' + '='.repeat(70));
    if (allPass && shouldStillWork) {
      console.log('🎉 BUG #20 TEST: ✅ PASSED');
      console.log('   Context awareness working correctly!');
      console.log('   No regression on Bug #12!');
    } else {
      console.log('❌ BUG #20 TEST: FAILED');
    }
    console.log('='.repeat(70) + '\n');

    return allPass && shouldStillWork;

  } catch (error) {
    console.error('❌ Error in Bug #20 test:', error);
    return false;
  } finally {
    await pool.end();
    await redis.quit();
  }
}

// Run test
testBug20ContextAwareness()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
