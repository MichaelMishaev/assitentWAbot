/**
 * Test script for Redis-based bug reporting system
 *
 * This script demonstrates how Claude Code will:
 * 1. Simulate a user sending a # bug report
 * 2. Search for pending bugs
 * 3. Mark bugs as fixed after resolving them
 */

import { redisMessageLogger } from './src/services/RedisMessageLogger.js';
import bugReportHelper from './src/utils/bugReportHelper.js';
import { redis } from './src/config/redis.js';

async function testBugReporting() {
  console.log('🧪 Testing Redis-based Bug Reporting System\n');

  // Step 1: Simulate user sending a bug report
  console.log('1️⃣ Simulating user bug report...');
  await redisMessageLogger.logIncomingMessage({
    messageId: 'test-msg-' + Date.now(),
    userId: 'test-user-123',
    phone: '972544345287',
    messageText: '#when I ask what I have this month, show only future events',
    conversationState: 'MAIN_MENU'
  });
  console.log('✅ Bug report logged to Redis\n');

  // Step 2: Simulate another bug report
  console.log('2️⃣ Adding another bug report...');
  await redisMessageLogger.logIncomingMessage({
    messageId: 'test-msg-' + (Date.now() + 1),
    userId: 'test-user-123',
    phone: '972544345287',
    messageText: '#reminders not showing past due items',
    conversationState: 'MAIN_MENU'
  });
  console.log('✅ Second bug logged\n');

  // Step 3: Claude Code searches for pending bugs
  console.log('3️⃣ Claude Code searching for pending bugs...');
  const output = await bugReportHelper.displayPendingBugs();
  console.log(output);

  // Step 4: Get pending bugs programmatically
  const bugs = await bugReportHelper.getPendingBugs();
  console.log(`📊 Found ${bugs.length} pending bugs\n`);

  // Step 5: Fix the first bug
  if (bugs.length > 0) {
    console.log('4️⃣ Fixing first bug...');
    const bugToFix = bugs[0].text;
    const success = await bugReportHelper.markBugAsFixed(bugToFix, 'abc123-commit-hash');

    if (success) {
      console.log(`✅ Bug marked as fixed: "${bugToFix.substring(0, 50)}..."\n`);
    } else {
      console.log('❌ Failed to mark bug as fixed\n');
    }
  }

  // Step 6: Check pending bugs again (should be one less)
  console.log('5️⃣ Checking pending bugs after fix...');
  const remainingBugs = await bugReportHelper.getPendingBugs();
  console.log(`📊 Remaining bugs: ${remainingBugs.length}\n`);

  // Step 7: Get bug history
  console.log('6️⃣ Bug history:');
  const history = await bugReportHelper.getBugHistory();
  console.log(`   Total: ${history.total}`);
  console.log(`   Pending: ${history.pending.length}`);
  console.log(`   Fixed: ${history.fixed.length}`);

  if (history.fixed.length > 0) {
    console.log('\n   Fixed bugs:');
    history.fixed.forEach((bug, i) => {
      console.log(`   ${i + 1}. ${bug.text}`);
      console.log(`      Fixed at: ${bug.fixedAt}`);
      console.log(`      Commit: ${bug.commitHash}\n`);
    });
  }

  console.log('\n✅ Test completed successfully!');
  console.log('\n📝 Next steps:');
  console.log('   1. Send "#bug message" in WhatsApp');
  console.log('   2. Ask Claude Code to "find all # bugs"');
  console.log('   3. Claude Code will only see pending bugs (not fixed ones)');

  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await redis.del('user_messages');
  await redis.del('bugs:pending');
  await redis.del('bugs:fixed');
  console.log('✅ Cleanup complete');

  process.exit(0);
}

// Run test
testBugReporting().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
