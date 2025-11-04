/**
 * QA Test: Hebrew Day Names Parsing
 *
 * Tests that Hebrew day names (יום ראשון, יום שני, etc.) are correctly
 * parsed to the next occurrence of that weekday.
 */

import { DateTime } from 'luxon';
import { parseHebrewDate } from './utils/hebrewDateParser.js';

function testHebrewDayParsing() {
  console.log('🧪 Testing Hebrew Day Names Parsing\n');
  console.log('====================================\n');

  // Reference date: Monday, November 3, 2025
  const referenceDate = DateTime.fromISO('2025-11-03', { zone: 'Asia/Jerusalem' });
  console.log(`Reference Date: ${referenceDate.toFormat('EEEE, MMMM d, yyyy')} (${referenceDate.toFormat('EEE')})\n`);

  const testCases = [
    {
      input: 'יום ראשון',
      expectedDay: 'Sunday',
      expectedDate: '2025-11-09', // Next Sunday from Nov 3 (Monday)
      dayNumber: 0
    },
    {
      input: 'יום שני',
      expectedDay: 'Monday',
      expectedDate: '2025-11-10', // Next Monday from Nov 3 (Monday) - should be next week
      dayNumber: 1
    },
    {
      input: 'יום שלישי',
      expectedDay: 'Tuesday',
      expectedDate: '2025-11-04', // Tomorrow (Tuesday)
      dayNumber: 2
    },
    {
      input: 'יום רביעי',
      expectedDay: 'Wednesday',
      expectedDate: '2025-11-05', // Wednesday
      dayNumber: 3
    },
    {
      input: 'יום חמישי',
      expectedDay: 'Thursday',
      expectedDate: '2025-11-06', // Thursday ← THIS IS THE BUG!
      dayNumber: 4
    },
    {
      input: 'יום שישי',
      expectedDay: 'Friday',
      expectedDate: '2025-11-07', // Friday
      dayNumber: 5
    },
    {
      input: 'שבת',
      expectedDay: 'Saturday',
      expectedDate: '2025-11-08', // Saturday
      dayNumber: 6
    }
  ];

  let allPassed = true;

  testCases.forEach((test, index) => {
    console.log(`${index + 1}. Testing: ${test.input} (${test.expectedDay})`);

    // Parse using hebrewDateParser
    const parseResult = parseHebrewDate(test.input, 'Asia/Jerusalem');

    if (!parseResult.success || !parseResult.date) {
      console.log(`   ❌ FAIL: Parser failed - ${parseResult.error || 'No date returned'}\n`);
      allPassed = false;
      return;
    }

    const parsedDate = DateTime.fromJSDate(parseResult.date).setZone('Asia/Jerusalem');
    const parsedDateStr = parsedDate.toFormat('yyyy-MM-dd');
    const parsedDayName = parsedDate.toFormat('EEEE');

    console.log(`   Parsed:   ${parsedDateStr} (${parsedDayName})`);
    console.log(`   Expected: ${test.expectedDate} (${test.expectedDay})`);

    const dateMatches = parsedDateStr === test.expectedDate;
    const dayMatches = parsedDayName === test.expectedDay;

    if (dateMatches && dayMatches) {
      console.log(`   ✅ PASS\n`);
    } else {
      console.log(`   ❌ FAIL:`);
      if (!dateMatches) console.log(`      - Date mismatch: got ${parsedDateStr}, expected ${test.expectedDate}`);
      if (!dayMatches) console.log(`      - Day mismatch: got ${parsedDayName}, expected ${test.expectedDay}`);
      console.log();
      allPassed = false;
    }
  });

  console.log('====================================\n');

  if (allPassed) {
    console.log('🎉 All tests passed! Hebrew day parsing is correct.');
  } else {
    console.log('❌ Some tests failed. Hebrew day parsing has bugs.');
    process.exit(1);
  }
}

testHebrewDayParsing();
