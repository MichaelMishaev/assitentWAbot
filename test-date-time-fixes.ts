#!/usr/bin/env tsx

/**
 * Test script for Bug #9 fixes:
 * - Issue A: Date without year should use next year if past
 * - Issue B: Time should be extracted even on same line as date
 */

import { parseHebrewDate } from './src/utils/hebrewDateParser.js';
import { DateTime } from 'luxon';

const timezone = 'Asia/Jerusalem';
const now = DateTime.now().setZone(timezone);
const today = now.toFormat('yyyy-MM-dd');

console.log('🧪 Testing Bug #9 Fixes');
console.log(`📅 Today is: ${today}\n`);

// Test cases
const testCases = [
  {
    name: 'Date without year - future month (should use current year)',
    input: '25.12',
    expectedYear: now.year, // December is after current date in 2025
  },
  {
    name: 'Date without year - past month (should use next year)',
    input: '10.10',
    expectedYear: now.year + 1, // October 10 is before today, should use 2026
  },
  {
    name: 'Date with time on same line - format 1',
    input: '20.10 בשעה 15:00',
    expectTime: '15:00',
  },
  {
    name: 'Date with time on same line - format 2',
    input: '20.10 15:00',
    expectTime: '15:00',
  },
  {
    name: 'Date with time on same line - format 3',
    input: '20.10 ב-15:00',
    expectTime: '15:00',
  },
  {
    name: 'Date with year - should use specified year',
    input: '20.10.2025',
    expectedYear: 2025,
  },
];

console.log('═'.repeat(70));
console.log('Testing parseHebrewDate():\n');

let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  console.log(`\n📝 Test: ${testCase.name}`);
  console.log(`   Input: "${testCase.input}"`);

  const result = parseHebrewDate(testCase.input, timezone);

  if (!result.success || !result.date) {
    console.log(`   ❌ FAIL: Parsing failed`);
    console.log(`   Error: ${result.error}`);
    failCount++;
    continue;
  }

  const parsedDate = DateTime.fromJSDate(result.date).setZone(timezone);
  console.log(`   Parsed: ${parsedDate.toFormat('yyyy-MM-dd HH:mm')}`);

  // Check expected year
  if (testCase.expectedYear) {
    if (parsedDate.year === testCase.expectedYear) {
      console.log(`   ✅ PASS: Year is ${testCase.expectedYear}`);
      passCount++;
    } else {
      console.log(`   ❌ FAIL: Expected year ${testCase.expectedYear}, got ${parsedDate.year}`);
      failCount++;
    }
  }

  // Check expected time
  if (testCase.expectTime) {
    const actualTime = parsedDate.toFormat('HH:mm');
    if (actualTime === testCase.expectTime) {
      console.log(`   ✅ PASS: Time is ${testCase.expectTime}`);
      passCount++;
    } else {
      console.log(`   ❌ FAIL: Expected time ${testCase.expectTime}, got ${actualTime}`);
      failCount++;
    }
  }
}

console.log('\n' + '═'.repeat(70));
console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed`);

if (failCount === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
