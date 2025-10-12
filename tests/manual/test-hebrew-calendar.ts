/**
 * Manual Test Script for Hebrew Calendar Phase
 *
 * Tests real holiday dates for 2025/2026 to ensure the logic works correctly.
 */

import { HebcalClient } from '../../src/infrastructure/external/hebcal/HebcalClient.js';
import logger from '../../src/utils/logger.js';

async function testHebrewCalendar() {
  console.log('🧪 Testing Hebrew Calendar Logic\n');
  console.log('='.repeat(60));

  // Initialize HebcalClient
  const hebcalClient = new HebcalClient();
  await hebcalClient.initialize({
    defaultLocation: {
      name: 'Jerusalem',
      latitude: 31.7683,
      longitude: 35.2137,
      tzid: 'Asia/Jerusalem'
    },
    candleLightingMins: 18
  });

  // Test cases with known dates
  const testCases = [
    {
      name: 'Regular Weekday (Monday)',
      date: new Date('2025-11-03T10:00:00'), // Monday - No holiday
      expected: { isHoliday: false, isShabbat: false }
    },
    {
      name: 'Shabbat (Saturday)',
      date: new Date('2025-10-18T10:00:00'), // Saturday
      expected: { isHoliday: false, isShabbat: true }
    },
    {
      name: 'Yom Kippur 2025',
      date: new Date('2025-10-02T10:00:00'), // Thursday, 10 Tishrei 5786 = Yom Kippur
      expected: { isHoliday: true, severity: 'block' }
    },
    {
      name: 'Rosh Hashana 2025 (Day 1)',
      date: new Date('2025-09-23T10:00:00'), // Tuesday
      expected: { isHoliday: true, severity: 'warn' }
    },
    {
      name: 'Passover 2026 (First Day)',
      date: new Date('2026-04-02T10:00:00'),
      expected: { isHoliday: true, severity: 'warn' }
    },
    {
      name: 'Friday Evening (before Shabbat)',
      date: new Date('2025-10-17T18:00:00'), // Friday 6 PM
      expected: { shabbatTimes: true }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n📅 Test: ${testCase.name}`);
    console.log(`   Date: ${testCase.date.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);

    try {
      const result = await hebcalClient.execute(testCase.date, {
        userId: 'test-user',
        messageId: 'test-msg',
        timestamp: new Date(),
        metadata: {},
        logger
      });

      console.log(`   Hebrew Date: ${result.hebrewDate}`);
      console.log(`   Is Holiday: ${result.isHoliday}`);
      console.log(`   Is Shabbat: ${result.isShabbat}`);
      if (result.holidayName) {
        console.log(`   Holiday Name: ${result.holidayName}`);
      }
      if (result.severity) {
        console.log(`   Severity: ${result.severity}`);
      }
      if (result.shabbatTimes) {
        console.log(`   Shabbat Start: ${result.shabbatTimes.start.toFormat('HH:mm')}`);
        console.log(`   Shabbat End: ${result.shabbatTimes.end.toFormat('HH:mm')}`);
      }
      if (result.message) {
        console.log(`   Message: ${result.message}`);
      }

      // Validate expectations
      let testPassed = true;
      if (testCase.expected.isHoliday !== undefined && result.isHoliday !== testCase.expected.isHoliday) {
        console.log(`   ❌ FAILED: Expected isHoliday=${testCase.expected.isHoliday}, got ${result.isHoliday}`);
        testPassed = false;
      }
      if (testCase.expected.isShabbat !== undefined && result.isShabbat !== testCase.expected.isShabbat) {
        console.log(`   ❌ FAILED: Expected isShabbat=${testCase.expected.isShabbat}, got ${result.isShabbat}`);
        testPassed = false;
      }
      if (testCase.expected.severity && result.severity !== testCase.expected.severity) {
        console.log(`   ❌ FAILED: Expected severity=${testCase.expected.severity}, got ${result.severity}`);
        testPassed = false;
      }
      if (testCase.expected.shabbatTimes && !result.shabbatTimes) {
        console.log(`   ❌ FAILED: Expected Shabbat times but got none`);
        testPassed = false;
      }

      if (testPassed) {
        console.log(`   ✅ PASSED`);
        passed++;
      } else {
        failed++;
      }

    } catch (error) {
      console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${testCases.length} total)`);

  if (failed === 0) {
    console.log('✅ All Hebrew Calendar tests passed!');
  } else {
    console.log('❌ Some tests failed!');
    process.exit(1);
  }
}

// Run the tests
testHebrewCalendar().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
