#!/usr/bin/env tsx
/**
 * Mark Bugs #28, #3, #2 as fixed in Redis
 * Commit: 1050524 (2025-11-06)
 */

import { Redis } from 'ioredis';

const redis = new Redis({
  host: '167.71.145.9',
  port: 6379,
});

async function markBugsFixed() {
  try {
    console.log('🔍 Searching for Bugs #28, #3, #2 messages in Redis...\n');

    // Get all user messages
    const messages = await redis.lrange('user_messages', 0, -1);
    console.log(`📊 Total messages in Redis: ${messages.length}\n`);

    // Bug identifiers
    const bugPatterns = [
      // Bug #28: Entity extraction missing "for [person]" / "ל[name]" patterns
      '#didnt write about what lesson (origin was: lesson for Edvard)',
      '#didnt find lesson for deni',

      // Bug #3 and #2: User will report these, but might not be in Redis yet
      // We'll mark them if found
    ];

    let fixedCount = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = JSON.parse(messages[i]);

      // Check if this message matches any of our bugs
      if (bugPatterns.some(pattern => msg.messageText?.includes(pattern))) {
        if (msg.status !== 'fixed') {
          // Update the message with fixed status
          msg.status = 'fixed';
          msg.fixedAt = new Date().toISOString();
          msg.fixedBy = 'Bugs #28, #3, #2 - Entity extraction, menu truncation, context confusion';
          msg.commitHash = '1050524';

          // Update in Redis
          await redis.lset('user_messages', i, JSON.stringify(msg));

          console.log(`✅ Marked as fixed: ${msg.messageText}`);
          console.log(`   Date: ${msg.timestamp}`);
          console.log(`   Fixed at: ${msg.fixedAt}`);
          console.log(`   Commit: ${msg.commitHash}\n`);

          fixedCount++;
        } else {
          console.log(`⏭️  Already fixed: ${msg.messageText}\n`);
        }
      }
    }

    console.log(`\n🎉 Summary:`);
    console.log(`   Total messages checked: ${messages.length}`);
    console.log(`   Bug messages fixed: ${fixedCount}`);

    redis.disconnect();
  } catch (error) {
    console.error('❌ Error marking bugs as fixed:', error);
    redis.disconnect();
    process.exit(1);
  }
}

markBugsFixed();
