/**
 * Test script for time-only parsing bug fix
 * Tests various Hebrew time expressions to ensure they're interpreted as time, not dates
 */

import { parseHebrewDate } from '../utils/hebrewDateParser.js';
import { DateTime } from 'luxon';

interface TestCase {
  input: string;
  description: string;
  expectSuccess: boolean;
  expectedHour?: number;
  expectedToday?: boolean;
}

const testCases: TestCase[] = [
  // BUG FIX: Time-only with "ב" prefix
  { input: 'ב 21', description: 'Time with ב prefix (21:00)', expectSuccess: true, expectedHour: 21, expectedToday: true },
  { input: 'בשעה 21', description: 'Time with בשעה prefix (21:00)', expectSuccess: true, expectedHour: 21, expectedToday: true },
  { input: 'ב-21', description: 'Time with ב- prefix (21:00)', expectSuccess: true, expectedHour: 21, expectedToday: true },
  { input: 'ב 18', description: 'Time with ב prefix (18:00)', expectSuccess: true, expectedHour: 18, expectedToday: true },
  { input: 'בשעה 9', description: 'Morning time with בשעה (09:00)', expectSuccess: true, expectedHour: 9, expectedToday: true },

  // Time-only without prefix (should work if hour > 12)
  { input: '21', description: 'Standalone hour > 12 (21:00)', expectSuccess: true, expectedHour: 21, expectedToday: true },
  { input: '18', description: 'Standalone hour > 12 (18:00)', expectSuccess: true, expectedHour: 18, expectedToday: true },
  { input: '13', description: 'Standalone hour > 12 (13:00)', expectSuccess: true, expectedHour: 13, expectedToday: true },

  // Standard time format with colon
  { input: '21:30', description: 'Standard time format (21:30)', expectSuccess: true, expectedHour: 21, expectedToday: true },
  { input: 'בשעה 21:30', description: 'Time with בשעה and colon (21:30)', expectSuccess: true, expectedHour: 21, expectedToday: true },

  // Natural language time
  { input: '21 בערב', description: 'Natural time with בערב (21:00)', expectSuccess: true, expectedHour: 21, expectedToday: true },
  { input: '9 בבוקר', description: 'Natural time with בבוקר (09:00)', expectSuccess: true, expectedHour: 9, expectedToday: true },
  { input: 'בערב', description: 'Time period only (19:00 default)', expectSuccess: true, expectedHour: 19, expectedToday: true },

  // Edge cases that should NOT be treated as time
  { input: '9', description: 'Standalone small hour without context (ambiguous)', expectSuccess: false },
  { input: '5', description: 'Standalone small hour without context (ambiguous)', expectSuccess: false },

  // Date formats (should still work)
  { input: '21/11', description: 'Date format DD/MM (21st of November)', expectSuccess: true, expectedHour: 0 }, // Not today
  { input: '21.11', description: 'Date format DD.MM (21st of November)', expectSuccess: true, expectedHour: 0 }, // Not today

  // Combined date + time
  { input: 'מחר בשעה 21', description: 'Tomorrow at 21:00', expectSuccess: true, expectedHour: 21 },
  { input: 'היום ב 18', description: 'Today at 18:00', expectSuccess: true, expectedHour: 18, expectedToday: true },
];

console.log('🧪 Testing Time-Only Parsing Fix\n');
console.log('=' .repeat(80));

let passedTests = 0;
let failedTests = 0;

for (const testCase of testCases) {
  const result = parseHebrewDate(testCase.input, 'Asia/Jerusalem');

  let passed = true;
  let errorMsg = '';

  // Check if parsing succeeded as expected
  if (result.success !== testCase.expectSuccess) {
    passed = false;
    errorMsg = `Expected ${testCase.expectSuccess ? 'success' : 'failure'}, got ${result.success ? 'success' : 'failure'}`;
  }

  // If expected to succeed, check the hour
  if (testCase.expectSuccess && result.success && result.date && testCase.expectedHour !== undefined) {
    const dt = DateTime.fromJSDate(result.date).setZone('Asia/Jerusalem');
    if (dt.hour !== testCase.expectedHour) {
      passed = false;
      errorMsg = `Expected hour ${testCase.expectedHour}, got ${dt.hour}`;
    }

    // Check if it's today (if specified)
    if (testCase.expectedToday) {
      const now = DateTime.now().setZone('Asia/Jerusalem').startOf('day');
      const resultDay = dt.startOf('day');

      // Should be today or tomorrow (if time is in the past)
      const isToday = resultDay.equals(now);
      const isTomorrow = resultDay.equals(now.plus({ days: 1 }));

      if (!isToday && !isTomorrow) {
        passed = false;
        errorMsg = `Expected today or tomorrow, got ${resultDay.toFormat('dd/MM/yyyy')}`;
      }
    }
  }

  // Print result
  const statusIcon = passed ? '✅' : '❌';
  const status = passed ? 'PASS' : 'FAIL';

  console.log(`${statusIcon} [${status}] "${testCase.input}"`);
  console.log(`   Description: ${testCase.description}`);

  if (result.success && result.date) {
    const dt = DateTime.fromJSDate(result.date).setZone('Asia/Jerusalem');
    console.log(`   Result: ${dt.toFormat('dd/MM/yyyy HH:mm')}`);
  } else {
    console.log(`   Result: FAILED - ${result.error}`);
  }

  if (!passed) {
    console.log(`   ❗ Error: ${errorMsg}`);
    failedTests++;
  } else {
    passedTests++;
  }

  console.log('');
}

console.log('=' .repeat(80));
console.log(`\n📊 Test Summary: ${passedTests} passed, ${failedTests} failed out of ${testCases.length} tests`);

if (failedTests === 0) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed`);
  process.exit(1);
}
