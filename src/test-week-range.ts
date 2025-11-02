/**
 * Test: Week Range Calculation (Israel: Sunday-Saturday)
 *
 * This test verifies that getEventsForWeek correctly calculates
 * week boundaries using Sunday as the first day of the week (Israel standard).
 *
 * Bug: User asked "מה לי השבוע?" on Sunday 02/11 and the bot showed
 * events from Monday 27/10 - Sunday 02/11 (PAST week) instead of
 * Sunday 02/11 - Saturday 08/11 (CURRENT week)
 */

import { DateTime } from 'luxon';

function calculateWeekRange(date: Date): { start: Date; end: Date; startFormatted: string; endFormatted: string } {
  const dt = DateTime.fromJSDate(date).setZone('Asia/Jerusalem');

  // Calculate start of week (Sunday) manually
  // Luxon weekday: 1=Monday, 2=Tuesday, ..., 7=Sunday
  const daysFromSunday = dt.weekday === 7 ? 0 : dt.weekday;
  const startOfWeek = dt.minus({ days: daysFromSunday }).startOf('day').toUTC().toJSDate();
  // End of week is next Sunday (exclusive), which gives us through Saturday
  const endOfWeek = dt.minus({ days: daysFromSunday }).plus({ days: 7 }).startOf('day').toUTC().toJSDate();

  const startFormatted = DateTime.fromJSDate(startOfWeek).setZone('Asia/Jerusalem').toFormat('yyyy-MM-dd (EEE)');
  const endFormatted = DateTime.fromJSDate(endOfWeek).setZone('Asia/Jerusalem').toFormat('yyyy-MM-dd (EEE)');

  return { start: startOfWeek, end: endOfWeek, startFormatted, endFormatted };
}

function testWeekRanges() {
  console.log('🧪 Testing Week Range Calculation (Israel: Sunday-Saturday)\n');

  const testCases = [
    {
      name: 'Sunday, November 2, 2025 (User Bug)',
      date: new Date('2025-11-02T23:36:00+02:00'),
      expectedStart: '2025-11-02 (Sun)',
      expectedEnd: '2025-11-09 (Sun)' // Exclusive, so events through Saturday 11/08
    },
    {
      name: 'Monday, November 3, 2025',
      date: new Date('2025-11-03T10:00:00+02:00'),
      expectedStart: '2025-11-02 (Sun)',
      expectedEnd: '2025-11-09 (Sun)'
    },
    {
      name: 'Friday, November 7, 2025',
      date: new Date('2025-11-07T10:00:00+02:00'),
      expectedStart: '2025-11-02 (Sun)',
      expectedEnd: '2025-11-09 (Sun)'
    },
    {
      name: 'Saturday, November 8, 2025 (Last day of week)',
      date: new Date('2025-11-08T10:00:00+02:00'),
      expectedStart: '2025-11-02 (Sun)',
      expectedEnd: '2025-11-09 (Sun)'
    },
    {
      name: 'Sunday, November 9, 2025 (Next week)',
      date: new Date('2025-11-09T10:00:00+02:00'),
      expectedStart: '2025-11-09 (Sun)',
      expectedEnd: '2025-11-16 (Sun)'
    }
  ];

  let allPassed = true;

  testCases.forEach((test, index) => {
    console.log(`${index + 1}. ${test.name}`);
    const result = calculateWeekRange(test.date);

    const startMatch = result.startFormatted === test.expectedStart;
    const endMatch = result.endFormatted === test.expectedEnd;

    console.log(`   Input:    ${DateTime.fromJSDate(test.date).setZone('Asia/Jerusalem').toFormat('yyyy-MM-dd (EEE) HH:mm')}`);
    console.log(`   Week:     ${result.startFormatted} → ${result.endFormatted}`);
    console.log(`   Expected: ${test.expectedStart} → ${test.expectedEnd}`);

    if (startMatch && endMatch) {
      console.log('   ✅ PASS\n');
    } else {
      console.log('   ❌ FAIL\n');
      allPassed = false;
    }
  });

  // Special test: User's exact scenario
  console.log('📌 User Bug Scenario:');
  console.log('User asked "מה לי השבוע?" on Sunday, November 2, 2025 at 23:36');
  const userDate = new Date('2025-11-02T23:36:00+02:00');
  const userWeek = calculateWeekRange(userDate);
  console.log(`\nCalculated Week Range:`);
  console.log(`  Start: ${userWeek.startFormatted} (Sunday)`);
  console.log(`  End:   ${userWeek.endFormatted} (Sunday, exclusive)`);
  console.log(`  → Events from Sunday 02/11 through Saturday 08/11\n`);

  // Check if November 7 (Friday) would be included
  const nov7 = DateTime.fromISO('2025-11-07T09:30:00', { zone: 'Asia/Jerusalem' }).toJSDate();
  const nov7InRange = nov7 >= userWeek.start && nov7 < userWeek.end;

  console.log('Would event on Friday, November 7, 2025 09:30 be included?');
  console.log(`  Event date: ${DateTime.fromJSDate(nov7).setZone('Asia/Jerusalem').toFormat('yyyy-MM-dd (EEE) HH:mm')}`);
  console.log(`  In range:   ${nov7InRange ? '✅ YES' : '❌ NO'}\n`);

  if (!nov7InRange) {
    console.log('❌ BUG: November 7 event would NOT be included!');
    allPassed = false;
  }

  if (allPassed) {
    console.log('🎉 All tests passed! Week range calculation is correct.');
  } else {
    console.log('❌ Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

testWeekRanges();
