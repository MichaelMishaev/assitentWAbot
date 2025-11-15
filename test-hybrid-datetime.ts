/**
 * Test Hybrid DateTime Approach
 * Verify GPT-4o-mini fixes "למחר ב 16:00" → midnight bug
 */

import { gptDateTimeService } from './src/services/GPTDateTimeService.js';
import { DateTime } from 'luxon';

async function testHybridDateTime() {
  console.log('🧪 Testing Hybrid DateTime Extraction\n');
  console.log('='.repeat(80));

  const testCases = [
    // The bug case that failed
    { text: 'למחר ב 16:00', expected: '16:00' },
    { text: 'צור תזכורת למחר ב 16:00', expected: '16:00' },

    // Other common cases
    { text: 'מחרתיים בשעה 14:30', expected: '14:30' },
    { text: 'היום ב 20:00', expected: '20:00' },
    { text: 'מחר בבוקר', expected: '08:00' },
    { text: 'מחר בערב', expected: '18:00' },
    { text: 'שעה לפני', expected: 'relative' },
    { text: '30 דקות לפני', expected: 'relative' },
    { text: 'tomorrow at 3pm', expected: '15:00' },
    { text: 'next Monday at 10:00', expected: '10:00' },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📝 Test: "${test.text}"`);
    console.log('-'.repeat(80));

    try {
      const result = await gptDateTimeService.extractDateTime(test.text, 'Asia/Jerusalem');

      if (result.success) {
        if (test.expected === 'relative') {
          if (result.leadTimeMinutes) {
            console.log(`✅ PASS - Relative time detected: ${result.leadTimeMinutes} minutes`);
            passed++;
          } else {
            console.log(`❌ FAIL - Expected relative time, got absolute`);
            failed++;
          }
        } else {
          const time = result.time;
          const expectedTime = test.expected;
          const actualTime = time ? `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : 'N/A';

          if (actualTime === expectedTime) {
            console.log(`✅ PASS - Time: ${actualTime}`);
            console.log(`   Datetime: ${result.datetime?.toISOString()}`);
            console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
            console.log(`   Cache hit: ${result.cacheHit ? 'Yes' : 'No'}`);
            console.log(`   Latency: ${result.latencyMs}ms`);
            passed++;
          } else {
            console.log(`❌ FAIL - Expected ${expectedTime}, got ${actualTime}`);
            console.log(`   Full result:`, result);
            failed++;
          }
        }
      } else {
        console.log(`❌ FAIL - Extraction failed: ${result.error}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ FAIL - Exception: ${error}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failed}/${testCases.length}`);
  console.log(`   Success rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);

  // Cost estimation
  const totalCalls = testCases.length;
  const costPerCall = 0.0002;
  console.log(`\n💰 Cost estimate: $${(totalCalls * costPerCall).toFixed(4)} for ${totalCalls} calls`);

  console.log('\n');
  process.exit(failed > 0 ? 1 : 0);
}

testHybridDateTime();
