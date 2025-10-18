/**
 * View AI classification failures logged as #AI-MISS in Redis
 * This helps identify patterns where the NLP fails to detect user intent
 *
 * Usage: npx tsx check-ai-misses.ts
 */

import { redisMessageLogger } from './src/services/RedisMessageLogger.js';
import { redis } from './src/config/redis.js';

async function checkAIMisses() {
  try {
    console.log('✅ Connected to Redis\n');

    // Get all messages from Redis
    const messages = await redis.lrange('user_messages', 0, -1);

    if (messages.length === 0) {
      console.log('📭 No messages found in Redis');
      process.exit(0);
    }

    // Filter for #AI-MISS messages
    const aiMisses = messages
      .map(msg => JSON.parse(msg))
      .filter(msg => msg.messageText && msg.messageText.startsWith('#AI-MISS'));

    if (aiMisses.length === 0) {
      console.log('✅ No AI classification failures found! The NLP is working well.');
      process.exit(0);
    }

    console.log(`🤖 Found ${aiMisses.length} AI classification failure(s):\n`);
    console.log('='.repeat(80));

    aiMisses.forEach((miss, index) => {
      const timestamp = new Date(miss.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const metadata = miss.metadata || {};

      console.log(`\n${index + 1}. [${timestamp}]`);
      console.log(`   📝 User said: "${metadata.originalText || 'N/A'}"`);
      console.log(`   🤖 AI classified as: ${metadata.aiIntent || 'unknown'} (${((metadata.aiConfidence || 0) * 100).toFixed(0)}% confidence)`);
      console.log(`   ✅ Expected: ${metadata.expectedIntent || 'N/A'}`);
      console.log(`   🔍 Detected keywords: ${metadata.detectedKeywords?.join(', ') || 'none'}`);
      console.log(`   👤 User: ${miss.phone || miss.userId || 'N/A'}`);
      console.log('-'.repeat(80));
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total AI misses: ${aiMisses.length}`);

    // Group by AI intent to find patterns
    const intentCounts: Record<string, number> = {};
    aiMisses.forEach(miss => {
      const intent = miss.metadata?.aiIntent || 'unknown';
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    });

    console.log(`\n   Most common misclassifications:`);
    Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([intent, count]) => {
        console.log(`     - ${intent}: ${count} times`);
      });

    console.log('\n💡 These logs help improve AI training. Use them to enhance NLPService.ts prompts.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAIMisses();
