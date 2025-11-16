/**
 * PRODUCTION NLP Analysis - Connect to Railway Redis
 * Analyze last 5 days of REAL production conversations
 *
 * Usage: npx tsx analyze-prod-nlp.ts
 */

import Redis from 'ioredis';

const PROD_REDIS_URL = 'redis://default:uVqJSRHgJHxcckklpcZbFN00sRGAkpLZ@centerbeam.proxy.rlwy.net:19475';

async function analyzeProdNLP() {
  const prodRedis = new Redis(PROD_REDIS_URL);

  try {
    console.log('🔌 Connecting to PRODUCTION Redis (Railway)...\n');
    await prodRedis.ping();
    console.log('✅ Connected to production!\n');

    // Get all messages
    const messages = await prodRedis.lrange('user_messages', 0, -1);

    if (messages.length === 0) {
      console.log('📭 No messages in production Redis');
      process.exit(0);
    }

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    // Parse messages
    const allParsed = messages
      .map(msg => {
        try {
          return JSON.parse(msg);
        } catch {
          return null;
        }
      })
      .filter(msg => msg !== null);

    // Filter last 5 days
    const recentMessages = allParsed.filter(msg => {
      if (!msg.timestamp) return false;
      const msgDate = new Date(msg.timestamp);
      return msgDate >= fiveDaysAgo;
    });

    console.log(`📊 Total messages in prod: ${allParsed.length}`);
    console.log(`📊 Messages from last 5 days: ${recentMessages.length}\n`);

    // Show date range
    if (allParsed.length > 0) {
      const timestamps = allParsed.map(msg => new Date(msg.timestamp));
      const oldest = new Date(Math.min(...timestamps.map(d => d.getTime())));
      const newest = new Date(Math.max(...timestamps.map(d => d.getTime())));

      console.log(`📅 Full date range in prod:`);
      console.log(`   Oldest: ${oldest.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);
      console.log(`   Newest: ${newest.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n`);
    }

    // Analyze recent messages
    const incoming = recentMessages.filter(msg => msg.direction === 'incoming');
    const uniqueUsers = new Set(incoming.map(msg => msg.userId || msg.phone));

    console.log('=' .repeat(80));
    console.log('📊 NLP PERFORMANCE ANALYSIS - LAST 5 DAYS (PRODUCTION)');
    console.log('='.repeat(80));
    console.log(`\n📈 Volume:`);
    console.log(`   Total incoming messages: ${incoming.length}`);
    console.log(`   Unique users: ${uniqueUsers.size}`);
    console.log(`   Messages per user: ${(incoming.length / uniqueUsers.size || 0).toFixed(1)}`);

    // Track failures
    const aiMisses = recentMessages.filter(msg => msg.messageText?.startsWith('#AI-MISS'));
    const errors = recentMessages.filter(msg => msg.error || msg.messageText === '[ERROR]');
    const unclearResponses = recentMessages.filter(msg =>
      msg.direction === 'outgoing' && (
        msg.messageText?.includes('לא הבנתי') ||
        msg.messageText?.includes('לא ברור') ||
        msg.messageText?.includes('תוכל לנסח מחדש') ||
        msg.messageText?.includes('מה התכוונת')
      )
    );

    // Low confidence classifications
    const lowConfidence = incoming.filter(msg =>
      msg.intent &&
      msg.intent.confidence < 0.7 &&
      !msg.messageText?.startsWith('#')
    );

    const totalFailures = aiMisses.length + errors.length + unclearResponses.length;
    const failureRate = incoming.length > 0 ? (totalFailures / incoming.length) * 100 : 0;

    console.log(`\n❌ Failures:`);
    console.log(`   #AI-MISS (explicit NLP failures): ${aiMisses.length}`);
    console.log(`   Error responses: ${errors.length}`);
    console.log(`   "Unclear" bot responses: ${unclearResponses.length}`);
    console.log(`   Low confidence (<70%): ${lowConfidence.length}`);
    console.log(`   \n   🎯 FAILURE RATE: ${failureRate.toFixed(2)}%`);

    // Show AI misses
    if (aiMisses.length > 0) {
      console.log(`\n\n🤖 AI-MISS Details:`);
      console.log('='.repeat(80));
      aiMisses.slice(0, 20).forEach((miss, i) => {
        const timestamp = new Date(miss.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        const metadata = miss.metadata || {};
        console.log(`\n${i + 1}. [${timestamp}]`);
        console.log(`   📝 User: "${metadata.originalText || miss.messageText}"`);
        console.log(`   🤖 AI: ${metadata.aiIntent || 'unknown'} (${((metadata.aiConfidence || 0) * 100).toFixed(0)}%)`);
        console.log(`   ✅ Expected: ${metadata.expectedIntent || 'N/A'}`);
      });
    }

    // Show low confidence
    if (lowConfidence.length > 0) {
      console.log(`\n\n⚠️  Low Confidence Classifications (<70%):`);
      console.log('='.repeat(80));
      lowConfidence.slice(0, 15).forEach((msg, i) => {
        const timestamp = new Date(msg.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        console.log(`\n${i + 1}. [${timestamp}]`);
        console.log(`   📝 "${msg.messageText}"`);
        console.log(`   🤖 ${msg.intent.intent} (${(msg.intent.confidence * 100).toFixed(0)}%)`);
      });
    }

    // Show unclear responses
    if (unclearResponses.length > 0) {
      console.log(`\n\n💬 Bot "Unclear" Responses:`);
      console.log('='.repeat(80));
      unclearResponses.slice(0, 10).forEach((msg, i) => {
        const timestamp = new Date(msg.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        console.log(`\n${i + 1}. [${timestamp}]`);
        console.log(`   "${msg.messageText?.substring(0, 100)}"`);
      });
    }

    // HONEST RECOMMENDATION
    console.log('\n\n' + '='.repeat(80));
    console.log('💡 BRUTALLY HONEST RECOMMENDATION');
    console.log('='.repeat(80));

    if (incoming.length === 0) {
      console.log(`\n⚠️  NO DATA - Cannot make recommendation`);
      console.log(`\nProduction Redis has no messages from the last 5 days.`);
      console.log(`Either the bot isn't being used, or messages aren't being logged.`);
    } else if (failureRate < 3) {
      console.log(`\n✅ YOUR NLP IS WORKING GREAT (${failureRate.toFixed(2)}% failure rate)`);
      console.log(`\n🚫 DO NOT ADD GPT API PRE-PROCESSING`);
      console.log(`\n**Why?**`);
      console.log(`   - You're handling ${(100 - failureRate).toFixed(1)}% of requests correctly`);
      console.log(`   - Adding GPT would add 1-3 seconds to EVERY message`);
      console.log(`   - Cost: $0.002/msg × ${incoming.length} msgs = $${(incoming.length * 0.002).toFixed(2)} (5 days)`);
      console.log(`   - Monthly estimate: ~$${(incoming.length * 0.002 * 6).toFixed(2)}/month`);
      console.log(`   - You'd slow down 97% of good requests to fix 3% bad ones`);
      console.log(`\n**Better approach:**`);
      console.log(`   1. Review the ${totalFailures} failures above`);
      console.log(`   2. Add specific patterns to your local NLP`);
      console.log(`   3. Cost: $0, Speed: instant, No external dependency`);
    } else if (failureRate < 10) {
      console.log(`\n⚠️  MODERATE NLP ISSUES (${failureRate.toFixed(2)}% failure rate)`);
      console.log(`\n💡 RECOMMENDATION: HYBRID APPROACH (confidence-based)`);
      console.log(`\n**Option 1: Smart fallback (BEST)**`);
      console.log(`   - If local NLP confidence > 70% → process immediately ⚡ (${incoming.length - lowConfidence.length} msgs)`);
      console.log(`   - If confidence < 70% → use GPT-4o-mini (${lowConfidence.length} msgs)`);
      console.log(`   - Cost: $0.002 × ${lowConfidence.length} = $${(lowConfidence.length * 0.002).toFixed(2)} (5 days) vs $${(incoming.length * 0.002).toFixed(2)} for all`);
      console.log(`   - Savings: ${(100 - (lowConfidence.length / incoming.length) * 100).toFixed(0)}% cheaper than GPT-everything`);
      console.log(`\n**Option 2: Fix local NLP**`);
      console.log(`   - Add training data for the ${totalFailures} failure patterns`);
      console.log(`   - Cost: $0 (one-time dev effort)`);
      console.log(`   - Long-term better solution`);
      console.log(`\n**Option 3: Use GPT-4o-mini for ALL (NOT RECOMMENDED)**`);
      console.log(`   - Cost: $${(incoming.length * 0.002).toFixed(2)} for 5 days`);
      console.log(`   - Monthly: ~$${(incoming.length * 0.002 * 6).toFixed(2)}`);
      console.log(`   - Latency: +1-3 seconds per message`);
    } else {
      console.log(`\n🔴 SERIOUS NLP PROBLEMS (${failureRate.toFixed(2)}% failure rate)`);
      console.log(`\n✅ YES - ADD GPT-4O-MINI PRE-PROCESSING`);
      console.log(`\nYour NLP is failing ${totalFailures} out of ${incoming.length} messages.`);
      console.log(`This is unacceptable user experience.`);
      console.log(`\n**Recommendation: Use GPT-4o-mini ($0.002/message)**`);
      console.log(`   - 5-day cost: $${(incoming.length * 0.002).toFixed(2)}`);
      console.log(`   - Monthly: ~$${(incoming.length * 0.002 * 6).toFixed(2)}`);
      console.log(`   - Added latency: 1-3 seconds per message`);
      console.log(`   - Worth it to fix ${totalFailures} failures and improve UX`);
      console.log(`\n**Why GPT-4o-mini and not GPT-4o?**`);
      console.log(`   - GPT-4o-mini: $0.002/message`);
      console.log(`   - GPT-4o: $0.02/message (10x more expensive)`);
      console.log(`   - Both handle Hebrew + NLP classification well`);
    }

    console.log('\n');
    await prodRedis.quit();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await prodRedis.quit();
    process.exit(1);
  }
}

analyzeProdNLP();
