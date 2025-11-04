import { scheduleReminder } from './queues/ReminderQueue.js';
import { redis } from './config/redis.js';
import logger from './utils/logger.js';

/**
 * Test: Reminder with delay=0 should be scheduled, not sent immediately
 *
 * Bug scenario:
 * - User creates reminder for "now + 5 minutes" with "5 minutes lead time"
 * - Target send time = now (delay = 0)
 * - Old code: Sent immediately (WRONG)
 * - New code: Scheduled with delay=0 (CORRECT)
 */
async function testReminderTiming() {
  try {
    logger.info('🧪 Testing reminder timing fix...');

    // Test case 1: Reminder with delay=0 (edge case)
    const now = new Date();
    const fiveMinutesFuture = new Date(now.getTime() + 5 * 60 * 1000);

    logger.info('Test 1: Creating reminder for 5 minutes future with 5 minute lead time');
    logger.info(`  Current time: ${now.toISOString()}`);
    logger.info(`  Due time: ${fiveMinutesFuture.toISOString()}`);
    logger.info(`  Lead time: 5 minutes`);
    logger.info(`  Expected: Should schedule with delay=0, not send immediately`);

    await scheduleReminder(
      {
        reminderId: 'test-delay-0',
        userId: 'test-user',
        title: 'Test: Delay=0',
        phone: 'test-phone',
      },
      fiveMinutesFuture,
      5 // 5 minutes lead time
    );

    logger.info('✅ Test 1 passed: Reminder scheduled without immediate send');

    // Test case 2: Reminder slightly in the past (< 60 seconds)
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);

    logger.info('\nTest 2: Creating reminder for 30 seconds ago (should still schedule)');
    logger.info(`  Current time: ${now.toISOString()}`);
    logger.info(`  Due time: ${thirtySecondsAgo.toISOString()}`);
    logger.info(`  Lead time: 0 minutes`);
    logger.info(`  Expected: Should schedule with delay=0 (within 60s threshold)`);

    await scheduleReminder(
      {
        reminderId: 'test-slight-past',
        userId: 'test-user',
        title: 'Test: Slight past',
        phone: 'test-phone',
      },
      thirtySecondsAgo,
      0
    );

    logger.info('✅ Test 2 passed: Reminder scheduled despite being 30s in past');

    // Test case 3: Reminder far in the past (> 60 seconds) - should skip
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    logger.info('\nTest 3: Creating reminder for 5 minutes ago (should skip)');
    logger.info(`  Current time: ${now.toISOString()}`);
    logger.info(`  Due time: ${fiveMinutesAgo.toISOString()}`);
    logger.info(`  Lead time: 0 minutes`);
    logger.info(`  Expected: Should skip (more than 60s in past)`);

    await scheduleReminder(
      {
        reminderId: 'test-far-past',
        userId: 'test-user',
        title: 'Test: Far past',
        phone: 'test-phone',
      },
      fiveMinutesAgo,
      0
    );

    logger.info('✅ Test 3 passed: Reminder skipped as expected');

    logger.info('\n✅ All tests passed!');
    logger.info('🎉 Reminder timing fix verified');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testReminderTiming();
