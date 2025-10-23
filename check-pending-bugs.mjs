#!/usr/bin/env node
/**
 * Check Pending Bugs in Redis
 * Lists all bugs that are still pending (not marked as fixed)
 */

import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

const messages = await redis.lrange('user_messages', 0, -1);
let pendingBugs = [];

console.log('\n📋 Checking for pending bugs in Redis...\n');

for (let i = 0; i < messages.length; i++) {
  try {
    const msg = JSON.parse(messages[i]);

    // Only process bug reports (starting with #) that are pending
    if (msg.messageText && msg.messageText.startsWith('#') && msg.status !== 'fixed') {
      pendingBugs.push({
        index: i,
        text: msg.messageText.substring(0, 80),
        status: msg.status || 'pending'
      });
    }
  } catch (e) {
    // Skip malformed JSON
  }
}

console.log('═'.repeat(80));
console.log(`\n📊 Pending Bugs Summary:\n`);

if (pendingBugs.length === 0) {
  console.log('✅ No pending bugs found! All reported bugs have been fixed.\n');
} else {
  pendingBugs.forEach((bug, idx) => {
    console.log(`${idx + 1}. [${bug.index}] ${bug.text}${bug.text.length >= 80 ? '...' : ''}`);
    console.log(`   Status: ${bug.status}\n`);
  });

  console.log(`Total pending bugs: ${pendingBugs.length}\n`);
}

console.log('═'.repeat(80));
console.log('\n');

await redis.disconnect();
