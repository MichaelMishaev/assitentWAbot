/**
 * Check what's actually in Redis
 */

import { redis } from './src/config/redis.js';

async function checkRedisMessages() {
  try {
    console.log('🔍 Checking Redis messages...\n');

    // Get all messages
    const messages = await redis.lrange('user_messages', 0, -1);

    console.log(`📊 Total messages in Redis: ${messages.length}\n`);

    if (messages.length === 0) {
      console.log('📭 Redis is empty');
      process.exit(0);
    }

    // Parse messages
    const parsed = messages
      .map(msg => {
        try {
          return JSON.parse(msg);
        } catch {
          return null;
        }
      })
      .filter(msg => msg !== null);

    // Show first 10 messages
    console.log('📝 First 10 messages:');
    console.log('='.repeat(80));
    parsed.slice(0, 10).forEach((msg, i) => {
      const timestamp = new Date(msg.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      console.log(`\n${i + 1}. [${timestamp}]`);
      console.log(`   Direction: ${msg.direction}`);
      console.log(`   User: ${msg.phone || msg.userId}`);
      console.log(`   Text: "${msg.messageText?.substring(0, 100)}"`);
      if (msg.intent) {
        console.log(`   Intent: ${msg.intent.intent} (${(msg.intent.confidence * 100).toFixed(0)}%)`);
      }
    });

    // Show date range
    const timestamps = parsed.map(msg => new Date(msg.timestamp));
    const oldest = new Date(Math.min(...timestamps.map(d => d.getTime())));
    const newest = new Date(Math.max(...timestamps.map(d => d.getTime())));

    console.log(`\n\n📅 Date range:`);
    console.log(`   Oldest: ${oldest.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);
    console.log(`   Newest: ${newest.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);

    // Show unique users
    const uniqueUsers = new Set(parsed.map(msg => msg.phone || msg.userId));
    console.log(`\n👥 Unique users: ${uniqueUsers.size}`);

    // Show message distribution
    const incoming = parsed.filter(msg => msg.direction === 'incoming').length;
    const outgoing = parsed.filter(msg => msg.direction === 'outgoing').length;
    console.log(`\n📊 Message distribution:`);
    console.log(`   Incoming (users): ${incoming}`);
    console.log(`   Outgoing (bot): ${outgoing}`);

    // Check for #AI-MISS
    const aiMisses = parsed.filter(msg => msg.messageText?.startsWith('#AI-MISS')).length;
    const bugs = parsed.filter(msg => msg.messageText?.startsWith('#') && msg.status === 'pending').length;

    console.log(`\n🔍 Special messages:`);
    console.log(`   #AI-MISS (NLP failures): ${aiMisses}`);
    console.log(`   # Pending bugs: ${bugs}`);

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkRedisMessages();
