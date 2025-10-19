#!/usr/bin/env tsx

/**
 * Test script for # comment bug reporting system
 * Verifies:
 * 1. isDevComment() detection
 * 2. Redis logging of # messages
 * 3. Pending bug retrieval
 */

import { isDevComment } from './src/utils/devCommentLogger.js';
import { redisMessageLogger } from './src/services/RedisMessageLogger.js';
import { redis } from './src/config/redis.js';

async function testBugSystem() {
  console.log('🧪 Testing Bug Reporting System\n');
  console.log('═'.repeat(70));

  // Test 1: Detection
  console.log('\n📝 Test 1: # Comment Detection');
  const testCases = [
    { text: '#bug - show only future events', expected: true },
    { text: '# test comment', expected: true },
    { text: '#do not show past events', expected: true },
    { text: 'regular message', expected: false },
    { text: 'message with # in middle', expected: false },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = isDevComment(test.text);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`   ${status} "${test.text}" → ${result}`);
    result === test.expected ? passed++ : failed++;
  }

  console.log(`\n   Results: ${passed} passed, ${failed} failed`);

  // Test 2: Redis Logging
  console.log('\n\n📊 Test 2: Redis Message Logging');

  try {
    // Log a test # message
    await redisMessageLogger.logIncomingMessage({
      messageId: `test-${Date.now()}`,
      userId: 'test-user',
      phone: '972544345287',
      messageText: '#TEST - Claude Code test message',
      conversationState: 'MAIN_MENU'
    });

    console.log('   ✅ Message logged to Redis');

    // Check if it was logged
    const allMessages = await redisMessageLogger.getAllMessages(10);
    const testMessage = allMessages.find(m => m.messageText === '#TEST - Claude Code test message');

    if (testMessage) {
      console.log(`   ✅ Message found in Redis with status: ${testMessage.status}`);
    } else {
      console.log('   ❌ Message not found in Redis');
    }

  } catch (error: any) {
    console.log(`   ❌ Error logging: ${error.message}`);
  }

  // Test 3: Pending Bugs Retrieval
  console.log('\n\n🔍 Test 3: Pending Bugs Retrieval');

  try {
    const pendingBugs = await redisMessageLogger.getPendingBugs();
    console.log(`   📋 Found ${pendingBugs.length} pending bugs:`);

    if (pendingBugs.length === 0) {
      console.log('   ℹ️  No pending bugs (this is expected if none were reported)');
    } else {
      pendingBugs.forEach((bug, i) => {
        console.log(`\n   Bug #${i + 1}:`);
        console.log(`      Text: ${bug.messageText}`);
        console.log(`      Status: ${bug.status}`);
        console.log(`      Time: ${bug.timestamp}`);
      });
    }
  } catch (error: any) {
    console.log(`   ❌ Error retrieving bugs: ${error.message}`);
  }

  // Test 4: Bug History
  console.log('\n\n📜 Test 4: Full Bug History (all # messages)');

  try {
    const bugHistory = await redisMessageLogger.getBugHistory();
    console.log(`   📋 Total # messages: ${bugHistory.length}`);

    if (bugHistory.length > 0) {
      console.log('\n   Recent # messages:');
      bugHistory.slice(0, 5).forEach((bug, i) => {
        console.log(`      ${i + 1}. ${bug.messageText.substring(0, 50)}...`);
        console.log(`         Status: ${bug.status || 'none'}, Time: ${bug.timestamp}`);
      });
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 5: Redis Key Existence
  console.log('\n\n🔑 Test 5: Redis Key Check');

  try {
    const exists = await redis.exists('user_messages');
    const count = await redis.llen('user_messages');
    console.log(`   Key "user_messages" exists: ${exists === 1 ? '✅ Yes' : '❌ No'}`);
    console.log(`   Message count: ${count}`);

    const pendingExists = await redis.exists('bugs:pending');
    const pendingCount = await redis.llen('bugs:pending');
    console.log(`   Key "bugs:pending" exists: ${pendingExists === 1 ? '✅ Yes' : '❌ No'}`);
    console.log(`   Pending bug count: ${pendingCount}`);
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('\n✅ Test completed!\n');

  // Cleanup
  await redis.quit();
  process.exit(0);
}

testBugSystem().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
