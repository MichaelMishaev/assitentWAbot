#!/usr/bin/env node
/**
 * REAL GPT API TEST - Calls OpenAI + Gemini NOW!
 *
 * This script tests your bot's NLP with REAL API calls
 */

import 'dotenv/config';
import { NLPService } from './src/services/NLPService.js';
import { GeminiNLPService } from './src/services/GeminiNLPService.js';

const TEST_MESSAGES = [
  'תזכיר לי לקנות חלב מחר',
  'תקבע לי אירוע של ריקודים לתאריך 1.11 בשעה 13:00',
  'כל האירועים שלי',
  'מתי יקיר',
  'פגישה עם יהודית'
];

async function testRealGPTAPI() {
  console.log('🤖 Testing REAL GPT API...\n');
  console.log('═'.repeat(60));

  // Check API keys
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  console.log('OpenAI Key:', openaiKey ? '✅ Present' : '❌ Missing');
  console.log('Gemini Key:', geminiKey ? '✅ Present' : '❌ Missing');
  console.log('═'.repeat(60));
  console.log('');

  if (!openaiKey) {
    console.error('❌ ERROR: OPENAI_API_KEY not found in environment!');
    console.error('Make sure .env file exists with your API key.');
    process.exit(1);
  }

  // Initialize services
  const gptService = new NLPService();
  const geminiService = new GeminiNLPService();

  let testNum = 1;
  let totalCost = 0;

  for (const message of TEST_MESSAGES) {
    console.log(`\n📨 Test ${testNum}/${TEST_MESSAGES.length}: "${message}"`);
    console.log('─'.repeat(60));

    try {
      // Call OpenAI GPT API
      console.log('🔵 Calling OpenAI GPT-4.1-mini...');
      const startGPT = Date.now();
      const gptResult = await gptService.parseIntent(message, [], 'Asia/Jerusalem');
      const gptTime = Date.now() - startGPT;

      console.log(`✅ GPT Response (${gptTime}ms):`);
      console.log(`   Intent: ${gptResult.intent}`);
      console.log(`   Confidence: ${(gptResult.confidence * 100).toFixed(0)}%`);
      if (gptResult.event?.title) {
        console.log(`   Event Title: ${gptResult.event.title}`);
      }
      if (gptResult.reminder?.title) {
        console.log(`   Reminder Title: ${gptResult.reminder.title}`);
      }

      // Estimate cost
      const inputTokens = message.length * 0.5; // Rough estimate
      const outputTokens = 100; // Rough estimate
      const gptCost = (inputTokens * 0.40 / 1000000) + (outputTokens * 1.60 / 1000000);
      totalCost += gptCost;

      // Call Gemini API
      console.log('\n🟢 Calling Google Gemini 2.5-flash-lite...');
      const startGemini = Date.now();
      const geminiResult = await geminiService.parseIntent(message, [], 'Asia/Jerusalem');
      const geminiTime = Date.now() - startGemini;

      console.log(`✅ Gemini Response (${geminiTime}ms):`);
      console.log(`   Intent: ${geminiResult.intent}`);
      console.log(`   Confidence: ${(geminiResult.confidence * 100).toFixed(0)}%`);
      if (geminiResult.event?.title) {
        console.log(`   Event Title: ${geminiResult.event.title}`);
      }
      if (geminiResult.reminder?.title) {
        console.log(`   Reminder Title: ${geminiResult.reminder.title}`);
      }

      const geminiCost = (inputTokens * 0.10 / 1000000) + (outputTokens * 0.40 / 1000000);
      totalCost += geminiCost;

      // Compare results
      console.log('\n🔍 Comparison:');
      if (gptResult.intent === geminiResult.intent) {
        console.log(`   ✅ Both agree: ${gptResult.intent}`);
      } else {
        console.log(`   ⚠️  Disagreement: GPT=${gptResult.intent}, Gemini=${geminiResult.intent}`);
      }

      console.log(`\n💰 Estimated cost for this test: $${(gptCost + geminiCost).toFixed(6)}`);

    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }

    testNum++;
  }

  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`✅ Tests completed: ${TEST_MESSAGES.length}`);
  console.log(`🔵 OpenAI GPT calls: ${TEST_MESSAGES.length}`);
  console.log(`🟢 Gemini calls: ${TEST_MESSAGES.length}`);
  console.log(`💰 Total estimated cost: $${totalCost.toFixed(4)}`);
  console.log('═'.repeat(60));
  console.log('');
  console.log('✅ All tests called REAL GPT API!');
}

// Run tests
testRealGPTAPI().catch(error => {
  console.error('\n💥 Fatal Error:');
  console.error(error);
  process.exit(1);
});
