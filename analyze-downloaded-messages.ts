/**
 * Analyze downloaded production messages
 * BRUTALLY HONEST assessment: Should we add GPT API?
 */

import * as fs from 'fs';

interface Message {
  timestamp: string;
  direction: 'incoming' | 'outgoing';
  messageText: string;
  userId?: string;
  phone?: string;
  intent?: {
    intent: string;
    confidence: number;
  };
  error?: string;
  metadata?: any;
  status?: string;
}

async function analyzeMessages() {
  try {
    console.log('📖 Reading production messages...\n');

    // Read the downloaded file
    const rawData = fs.readFileSync('/tmp/prod-messages.json', 'utf-8');
    const lines = rawData.split('\n').filter(line => line.trim());

    console.log(`📊 Total lines: ${lines.length}\n`);

    // Parse each message
    const messages: Message[] = [];
    lines.forEach((line, i) => {
      try {
        const parsed = JSON.parse(line);
        messages.push(parsed);
      } catch (e) {
        // Some lines might be malformed
      }
    });

    console.log(`✅ Parsed ${messages.length} messages\n`);

    // Filter last 5 days
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const recentMessages = messages.filter(msg => {
      if (!msg.timestamp) return false;
      const msgDate = new Date(msg.timestamp);
      return msgDate >= fiveDaysAgo;
    });

    // Show date range
    if (messages.length > 0) {
      const timestamps = messages.map(msg => new Date(msg.timestamp));
      const oldest = new Date(Math.min(...timestamps.map(d => d.getTime())));
      const newest = new Date(Math.max(...timestamps.map(d => d.getTime())));

      console.log(`📅 Full date range:`);
      console.log(`   Oldest: ${oldest.toLocaleString('en-US')}`);
      console.log(`   Newest: ${newest.toLocaleString('en-US')}`);
      console.log(`   Last 5 days cutoff: ${fiveDaysAgo.toLocaleString('en-US')}\n`);
    }

    console.log(`📊 Messages from last 5 days: ${recentMessages.length}\n`);

    // Analyze
    const incoming = recentMessages.filter(msg => msg.direction === 'incoming');
    const uniqueUsers = new Set(incoming.map(msg => msg.userId || msg.phone));

    console.log('='.repeat(80));
    console.log('📊 NLP PERFORMANCE - LAST 5 DAYS (PRODUCTION)');
    console.log('='.repeat(80));
    console.log(`\n📈 Volume:`);
    console.log(`   Incoming messages: ${incoming.length}`);
    console.log(`   Unique users: ${uniqueUsers.size}`);
    console.log(`   Avg messages/user: ${(incoming.length / uniqueUsers.size || 0).toFixed(1)}`);

    // Track failures
    const aiMisses = recentMessages.filter(msg =>
      msg.messageText?.startsWith('#AI-MISS')
    );

    const errors = recentMessages.filter(msg =>
      msg.error || msg.messageText === '[ERROR]'
    );

    const unclearResponses = recentMessages.filter(msg =>
      msg.direction === 'outgoing' && (
        msg.messageText?.includes('לא הבנתי') ||
        msg.messageText?.includes('לא ברור') ||
        msg.messageText?.includes('תוכל לנסח מחדש') ||
        msg.messageText?.includes('מה התכוונת') ||
        msg.messageText?.includes('אני לא בטוח')
      )
    );

    const lowConfidence = incoming.filter(msg =>
      msg.intent &&
      msg.intent.confidence < 0.7 &&
      !msg.messageText?.startsWith('#')
    );

    const totalFailures = aiMisses.length + errors.length + unclearResponses.length;
    const failureRate = incoming.length > 0 ? (totalFailures / incoming.length) * 100 : 0;

    console.log(`\n❌ Failures:`);
    console.log(`   #AI-MISS: ${aiMisses.length}`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   "Unclear" responses: ${unclearResponses.length}`);
    console.log(`   Low confidence (<70%): ${lowConfidence.length}`);
    console.log(`   \n   🎯 TOTAL FAILURES: ${totalFailures} / ${incoming.length}`);
    console.log(`   🎯 FAILURE RATE: ${failureRate.toFixed(2)}%\n`);

    // Show examples
    if (aiMisses.length > 0) {
      console.log(`\n🤖 AI-MISS Examples (NLP completely failed):`);
      console.log('='.repeat(80));
      aiMisses.slice(0, 10).forEach((miss, i) => {
        const metadata = miss.metadata || {};
        console.log(`\n${i + 1}. "${metadata.originalText || miss.messageText}"`);
        console.log(`   AI thought: ${metadata.aiIntent || 'unknown'} (${((metadata.aiConfidence || 0) * 100).toFixed(0)}%)`);
        console.log(`   Should be: ${metadata.expectedIntent || 'N/A'}`);
      });
    }

    if (lowConfidence.length > 0) {
      console.log(`\n\n⚠️  Low Confidence Examples (<70%):`);
      console.log('='.repeat(80));
      lowConfidence.slice(0, 10).forEach((msg, i) => {
        console.log(`\n${i + 1}. "${msg.messageText}"`);
        console.log(`   Classified: ${msg.intent!.intent} (${(msg.intent!.confidence * 100).toFixed(0)}%)`);
      });
    }

    if (unclearResponses.length > 0) {
      console.log(`\n\n💬 "Unclear" Bot Responses:`);
      console.log('='.repeat(80));
      unclearResponses.slice(0, 10).forEach((msg, i) => {
        console.log(`\n${i + 1}. "${msg.messageText?.substring(0, 150)}"`);
      });
    }

    // HONEST VERDICT
    console.log('\n\n' + '='.repeat(80));
    console.log('💡 BRUTALLY HONEST VERDICT');
    console.log('='.repeat(80));

    if (incoming.length === 0) {
      console.log(`\n⚠️  NO DATA from last 5 days - cannot assess\n`);
    } else if (failureRate < 3) {
      console.log(`\n✅ YOUR NLP IS EXCELLENT (${failureRate.toFixed(2)}% failure)`);
      console.log(`\n🚫 DO NOT ADD GPT API`);
      console.log(`\n**Reality check:**`);
      console.log(`   ✓ ${incoming.length - totalFailures} messages handled perfectly`);
      console.log(`   ✗ ${totalFailures} messages failed`);
      console.log(`   → ${(100 - failureRate).toFixed(1)}% success rate`);
      console.log(`\n**Why NOT to add GPT:**`);
      console.log(`   - Adds 1-3 seconds latency to EVERY message`);
      console.log(`   - Costs $0.002/msg = $${(incoming.length * 0.002).toFixed(2)}/5days = ~$${(incoming.length * 0.002 * 6).toFixed(2)}/month`);
      console.log(`   - External dependency (OpenAI down = your bot down)`);
      console.log(`   - You'd slow 97% good requests to fix 3% bad ones`);
      console.log(`\n**Better approach:**`);
      console.log(`   1. Fix the ${totalFailures} specific failures above`);
      console.log(`   2. Add those patterns to local NLP`);
      console.log(`   3. Cost: $0, Latency: 0ms, Reliability: 100%`);
    } else if (failureRate < 10) {
      console.log(`\n⚠️  MODERATE ISSUES (${failureRate.toFixed(2)}% failure)`);
      console.log(`\n💡 BEST APPROACH: HYBRID (confidence-based)`);
      console.log(`\n**The Smart Way:**`);
      console.log(`   - High confidence (>70%): Process locally ⚡ → ${incoming.length - lowConfidence.length} msgs`);
      console.log(`   - Low confidence (<70%): Ask GPT-4o-mini 🤖 → ${lowConfidence.length} msgs`);
      console.log(`\n**Cost comparison:**`);
      console.log(`   - Hybrid: $0.002 × ${lowConfidence.length} = $${(lowConfidence.length * 0.002).toFixed(3)} (5 days)`);
      console.log(`   - All GPT: $0.002 × ${incoming.length} = $${(incoming.length * 0.002).toFixed(2)} (5 days)`);
      console.log(`   - Savings: ${(100 - (lowConfidence.length / incoming.length) * 100).toFixed(0)}%`);
      console.log(`\n**OR just fix local NLP:**`);
      console.log(`   - Review ${totalFailures} failures`);
      console.log(`   - Add patterns to NLP training`);
      console.log(`   - Cost: $0 forever`);
    } else {
      console.log(`\n🔴 SERIOUS PROBLEMS (${failureRate.toFixed(2)}% failure)`);
      console.log(`\n✅ YES - USE GPT-4O-MINI`);
      console.log(`\n**The numbers don't lie:**`);
      console.log(`   - ${totalFailures} failures out of ${incoming.length} messages`);
      console.log(`   - That's ${failureRate.toFixed(1)}% of users getting bad experience`);
      console.log(`   - This is UNACCEPTABLE`);
      console.log(`\n**GPT-4o-mini cost:**`);
      console.log(`   - 5 days: $${(incoming.length * 0.002).toFixed(2)}`);
      console.log(`   - 30 days: ~$${(incoming.length * 0.002 * 6).toFixed(2)}`);
      console.log(`   - Latency: +1-3 seconds per message`);
      console.log(`\n**Worth it?** YES. User experience > cost.`);
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeMessages();
