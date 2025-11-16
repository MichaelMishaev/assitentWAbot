/**
 * Comprehensive NLP Failure Analysis - Last 5 Days of Production Conversations
 * HONEST ASSESSMENT: Should we add GPT API pre-processing?
 *
 * Usage: npx tsx analyze-nlp-failures.ts
 */

import { redisMessageLogger } from './src/services/RedisMessageLogger.js';
import { redis } from './src/config/redis.js';

interface AnalysisResult {
  totalMessages: number;
  totalConversations: number;
  aiMisses: number;
  errorResponses: number;
  unclearResponses: number;
  failureRate: number;
  commonFailurePatterns: Array<{ pattern: string; count: number; examples: string[] }>;
  lowConfidenceClassifications: Array<{ text: string; confidence: number; intent: string }>;
}

async function analyzeNLPFailures() {
  try {
    console.log('🔍 Analyzing last 5 days of production conversations...\n');

    // Get all messages
    const messages = await redis.lrange('user_messages', 0, -1);

    if (messages.length === 0) {
      console.log('📭 No messages found in Redis');
      process.exit(0);
    }

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    // Parse and filter last 5 days
    const recentMessages = messages
      .map(msg => {
        try {
          return JSON.parse(msg);
        } catch {
          return null;
        }
      })
      .filter(msg => {
        if (!msg || !msg.timestamp) return false;
        const msgDate = new Date(msg.timestamp);
        return msgDate >= fiveDaysAgo;
      });

    console.log(`📊 Found ${recentMessages.length} messages from last 5 days\n`);

    // Initialize analysis
    const analysis: AnalysisResult = {
      totalMessages: 0,
      totalConversations: 0,
      aiMisses: 0,
      errorResponses: 0,
      unclearResponses: 0,
      failureRate: 0,
      commonFailurePatterns: [],
      lowConfidenceClassifications: []
    };

    // Track unique users (conversations)
    const uniqueUsers = new Set<string>();

    // Track failures
    const aiMissMessages: any[] = [];
    const errorMessages: any[] = [];
    const unclearMessages: any[] = [];
    const lowConfidenceMessages: any[] = [];

    // Count incoming messages only (user messages, not bot responses)
    const incomingMessages = recentMessages.filter(msg => msg.direction === 'incoming');
    analysis.totalMessages = incomingMessages.length;

    // Analyze each message
    recentMessages.forEach(msg => {
      if (msg.direction === 'incoming') {
        uniqueUsers.add(msg.userId || msg.phone);

        // Check for #AI-MISS (explicit NLP failures)
        if (msg.messageText?.startsWith('#AI-MISS')) {
          analysis.aiMisses++;
          aiMissMessages.push(msg);
        }

        // Check for low confidence classifications
        if (msg.intent && msg.intent.confidence < 0.7 && !msg.messageText?.startsWith('#')) {
          lowConfidenceMessages.push({
            text: msg.messageText,
            confidence: msg.intent.confidence,
            intent: msg.intent.intent,
            timestamp: msg.timestamp
          });
        }

        // Check for error messages
        if (msg.error || msg.messageText === '[ERROR]') {
          analysis.errorResponses++;
          errorMessages.push(msg);
        }
      }

      // Check bot responses for "unclear" patterns
      if (msg.direction === 'outgoing') {
        const text = msg.messageText?.toLowerCase() || '';
        if (
          text.includes('לא הבנתי') ||
          text.includes('לא ברור') ||
          text.includes('תוכל לנסח מחדש') ||
          text.includes('מה התכוונת') ||
          text.includes('אני לא בטוח')
        ) {
          analysis.unclearResponses++;
          unclearMessages.push(msg);
        }
      }
    });

    analysis.totalConversations = uniqueUsers.size;

    // Calculate total failures
    const totalFailures = analysis.aiMisses + analysis.errorResponses + analysis.unclearResponses;
    analysis.failureRate = (totalFailures / analysis.totalMessages) * 100;

    // Print detailed analysis
    console.log('=' .repeat(80));
    console.log('📊 NLP PERFORMANCE ANALYSIS - LAST 5 DAYS');
    console.log('='.repeat(80));
    console.log(`\n📈 Volume:`);
    console.log(`   Total incoming messages: ${analysis.totalMessages}`);
    console.log(`   Unique users/conversations: ${analysis.totalConversations}`);
    console.log(`   Messages per user: ${(analysis.totalMessages / analysis.totalConversations).toFixed(1)}`);

    console.log(`\n❌ Failures:`);
    console.log(`   #AI-MISS (explicit NLP failures): ${analysis.aiMisses}`);
    console.log(`   Error responses: ${analysis.errorResponses}`);
    console.log(`   "Unclear" bot responses: ${analysis.unclearResponses}`);
    console.log(`   TOTAL FAILURES: ${totalFailures}`);
    console.log(`   \n   🎯 FAILURE RATE: ${analysis.failureRate.toFixed(2)}%`);

    // Show low confidence classifications
    if (lowConfidenceMessages.length > 0) {
      console.log(`\n⚠️  Low Confidence Classifications (<70%):`);
      console.log(`   Count: ${lowConfidenceMessages.length}`);
      console.log(`\n   Examples:`);
      lowConfidenceMessages.slice(0, 10).forEach((msg, i) => {
        console.log(`   ${i + 1}. "${msg.text}"`);
        console.log(`      → Classified as: ${msg.intent} (${(msg.confidence * 100).toFixed(0)}% confidence)`);
      });
    }

    // Show AI misses details
    if (aiMissMessages.length > 0) {
      console.log(`\n\n🤖 AI-MISS Details (NLP completely failed):`);
      console.log('='.repeat(80));
      aiMissMessages.slice(0, 15).forEach((miss, index) => {
        const timestamp = new Date(miss.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        const metadata = miss.metadata || {};

        console.log(`\n${index + 1}. [${timestamp}]`);
        console.log(`   📝 User said: "${metadata.originalText || miss.messageText}"`);
        console.log(`   🤖 AI classified as: ${metadata.aiIntent || 'unknown'} (${((metadata.aiConfidence || 0) * 100).toFixed(0)}%)`);
        console.log(`   ✅ Expected: ${metadata.expectedIntent || 'N/A'}`);
        console.log(`   🔍 Keywords: ${metadata.detectedKeywords?.join(', ') || 'none'}`);
      });
    }

    // Show unclear responses
    if (unclearMessages.length > 0) {
      console.log(`\n\n💬 "Unclear" Bot Responses:`);
      console.log('='.repeat(80));
      unclearMessages.slice(0, 10).forEach((msg, i) => {
        const timestamp = new Date(msg.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        console.log(`\n${i + 1}. [${timestamp}]`);
        console.log(`   Bot said: "${msg.messageText.substring(0, 100)}..."`);
      });
    }

    // HONEST RECOMMENDATION
    console.log('\n\n' + '='.repeat(80));
    console.log('💡 HONEST RECOMMENDATION');
    console.log('='.repeat(80));

    if (analysis.failureRate < 5) {
      console.log(`\n✅ NLP is performing WELL (${analysis.failureRate.toFixed(2)}% failure rate)`);
      console.log(`\n🚫 DON'T ADD GPT API PRE-PROCESSING`);
      console.log(`\nReasons:`);
      console.log(`   - Your current NLP handles 95%+ of requests correctly`);
      console.log(`   - Adding GPT would add 1-3s latency to EVERY message`);
      console.log(`   - Cost: ~$0.02 per message = $${(analysis.totalMessages * 0.02).toFixed(2)} for these 5 days`);
      console.log(`   - You'd slow down 95% of good requests to fix 5% bad ones`);
      console.log(`\n💡 Better solution: Fix the specific failure patterns above`);
    } else if (analysis.failureRate < 15) {
      console.log(`\n⚠️  NLP has MODERATE issues (${analysis.failureRate.toFixed(2)}% failure rate)`);
      console.log(`\n💡 RECOMMENDATION: HYBRID APPROACH`);
      console.log(`\nOption 1: Confidence-based fallback`);
      console.log(`   - If local NLP confidence > 70% → process immediately ⚡`);
      console.log(`   - If confidence < 70% → use GPT-4o-mini for clarification`);
      console.log(`   - This would only use GPT for ~${lowConfidenceMessages.length} messages (${((lowConfidenceMessages.length / analysis.totalMessages) * 100).toFixed(1)}%)`);
      console.log(`   - Estimated cost: $${(lowConfidenceMessages.length * 0.002).toFixed(2)} vs $${(analysis.totalMessages * 0.02).toFixed(2)} for all messages`);
      console.log(`\nOption 2: Improve local NLP`);
      console.log(`   - Add more training data for the specific failure patterns`);
      console.log(`   - Cost: $0 (one-time development effort)`);
      console.log(`   - Better long-term solution`);
    } else {
      console.log(`\n🔴 NLP has SERIOUS issues (${analysis.failureRate.toFixed(2)}% failure rate)`);
      console.log(`\n✅ YES, ADD GPT API PRE-PROCESSING`);
      console.log(`\nYour NLP is failing too often. Use GPT-4o-mini ($0.002/message)`);
      console.log(`   - 5-day cost would be: $${(analysis.totalMessages * 0.002).toFixed(2)}`);
      console.log(`   - Monthly estimate: ~$${(analysis.totalMessages * 0.002 * 6).toFixed(2)}`);
      console.log(`   - This is worth it to fix ${totalFailures} failures`);
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeNLPFailures();
