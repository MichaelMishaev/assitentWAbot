#!/usr/bin/env tsx
/**
 * Analyze NLP Comparison Data
 * Shows head-to-head stats between GPT and Gemini
 */

import { nlpComparisonLogger } from '../services/NLPComparisonLogger.js';
import logger from '../utils/logger.js';

async function analyzeComparisons() {
  console.log('🔍 NLP Comparison Analysis (GPT vs Gemini)\n');
  console.log('='.repeat(60));

  try {
    // Get overall statistics
    const stats = await nlpComparisonLogger.getStats(1000); // Last 1000 comparisons

    console.log('\n📊 OVERALL STATISTICS (Last 1000 messages):\n');
    console.log(`Total Comparisons: ${stats.totalComparisons}`);
    console.log(`Intent Match Rate: ${stats.intentMatchRate.toFixed(2)}%`);
    console.log(`Avg Confidence Diff: ${stats.avgConfidenceDiff.toFixed(4)}\n`);

    console.log('⏱️  PERFORMANCE:\n');
    console.log(`GPT Avg Response Time: ${stats.avgGptTime.toFixed(0)}ms`);
    console.log(`Gemini Avg Response Time: ${stats.avgGeminiTime.toFixed(0)}ms`);
    console.log(`GPT Faster: ${stats.gptFasterPercent.toFixed(2)}%`);
    console.log(`Gemini Faster: ${(100 - stats.gptFasterPercent).toFixed(2)}%\n`);

    // Speed winner
    const speedWinner = stats.avgGptTime < stats.avgGeminiTime ? 'GPT' : 'Gemini';
    const speedDiff = Math.abs(stats.avgGptTime - stats.avgGeminiTime);
    console.log(`🏆 Speed Winner: ${speedWinner} (${speedDiff.toFixed(0)}ms faster)\n`);

    // Get mismatches
    console.log('='.repeat(60));
    console.log('\n❌ INTENT MISMATCHES (Last 20):\n');

    const mismatches = await nlpComparisonLogger.getMismatches(20);

    if (mismatches.length === 0) {
      console.log('✅ No mismatches found! Both providers are in perfect agreement.\n');
    } else {
      mismatches.forEach((mismatch, index) => {
        console.log(`${index + 1}. "${mismatch.userMessage}"`);
        console.log(`   GPT:    ${mismatch.gptIntent} (confidence: ${mismatch.gptConfidence})`);
        console.log(`   Gemini: ${mismatch.geminiIntent} (confidence: ${mismatch.geminiConfidence})`);
        console.log(`   Time: ${mismatch.timestamp.toLocaleString('he-IL')}\n`);
      });
    }

    // Recommendations
    console.log('='.repeat(60));
    console.log('\n💡 RECOMMENDATIONS:\n');

    if (stats.intentMatchRate >= 95) {
      console.log(`✅ Intent match rate is excellent (${stats.intentMatchRate.toFixed(2)}%)`);
      console.log('   Both providers are producing highly consistent results.');
    } else if (stats.intentMatchRate >= 85) {
      console.log(`⚠️  Intent match rate is good (${stats.intentMatchRate.toFixed(2)}%)`);
      console.log('   Review mismatches above to identify patterns.');
    } else {
      console.log(`❌ Intent match rate is low (${stats.intentMatchRate.toFixed(2)}%)`);
      console.log('   URGENT: Review prompt engineering for Gemini.');
    }

    if (stats.avgGeminiTime < stats.avgGptTime) {
      const improvement = ((stats.avgGptTime - stats.avgGeminiTime) / stats.avgGptTime * 100).toFixed(1);
      console.log(`\n🚀 Gemini is ${improvement}% faster than GPT!`);
      if (stats.intentMatchRate >= 90) {
        console.log('   ✅ RECOMMENDED: Consider switching to Gemini as primary.');
      }
    }

    console.log('\n='.repeat(60));

  } catch (error) {
    logger.error('Failed to analyze NLP comparisons', { error });
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

analyzeComparisons();
