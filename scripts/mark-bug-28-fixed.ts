#!/usr/bin/env tsx
/**
 * Mark Bug #28 as fixed in Redis
 * Bug: Entity extraction missing "for [person]" / "ל[name]" patterns
 */

import { Redis } from 'ioredis';

const redis = new Redis({
  host: '167.71.145.9',
  port: 6379,
});

async function markBugFixed() {
  try {
    console.log('🔍 Searching for Bug #28 messages in Redis...\n');

    // Get all user messages
    const messages = await redis.lrange('user_messages', 0, -1);
    console.log(`📊 Total messages in Redis: ${messages.length}\n`);

    // Bug #28 identifiers
    const bug28Patterns = [
      '#didnt write about what lesson (origin was: lesson for Edvard)',
      '#didnt find lesson for deni',
    ];

    let fixedCount = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = JSON.parse(messages[i]);

      // Check if this message matches Bug #28
      if (bug28Patterns.some(pattern => msg.messageText?.includes(pattern))) {
        if (msg.status !== 'fixed') {
          // Update the message with fixed status
          msg.status = 'fixed';
          msg.fixedAt = new Date().toISOString();
          msg.fixedBy = 'Bug #28 Fix - Entity extraction for ל[name] patterns';
          msg.commitHash = 'PENDING';

          // Update in Redis
          await redis.lset('user_messages', i, JSON.stringify(msg));

          console.log(`✅ Marked as fixed: ${msg.messageText}`);
          console.log(`   Date: ${msg.timestamp}`);
          console.log(`   Fixed at: ${msg.fixedAt}\n`);

          fixedCount++;
        } else {
          console.log(`⏭️  Already fixed: ${msg.messageText}\n`);
        }
      }
    }

    console.log(`\n🎉 Summary:`);
    console.log(`   Total messages checked: ${messages.length}`);
    console.log(`   Bug #28 messages fixed: ${fixedCount}`);

    redis.disconnect();
  } catch (error) {
    console.error('❌ Error marking bugs as fixed:', error);
    redis.disconnect();
    process.exit(1);
  }
}

markBugFixed();
