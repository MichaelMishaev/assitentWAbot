/**
 * Test script to isolate the Wednesday→Saturday weekday mismapping bug
 * Bug reported on 2025-12-22 from user 972542101057
 */

import { DateTime } from 'luxon';
import { parseHebrewDate } from './src/utils/hebrewDateParser.js';

console.log('═══════════════════════════════════════════════════════');
console.log('Testing Weekday Mismapping Bug');
console.log('═══════════════════════════════════════════════════════\n');

// Simulate the exact production scenario
// Bug occurred on 2025-12-22 14:24 (Monday)
const testDate = DateTime.fromObject(
  { year: 2025, month: 12, day: 22, hour: 14, minute: 24 },
  { zone: 'Asia/Jerusalem' }
);

console.log(`Test Date: ${testDate.toFormat('yyyy-MM-dd HH:mm')} (${testDate.toFormat('EEEE')})`);
console.log(`Luxon weekday number: ${testDate.weekday}`);
console.log(`Luxon weekday % 7: ${testDate.weekday % 7}`);
console.log('');

// Test all Hebrew weekday names
const testCases = [
  { hebrew: 'ראשון', english: 'Sunday', expectedNumber: 0 },
  { hebrew: 'שני', english: 'Monday', expectedNumber: 1 },
  { hebrew: 'שלישי', english: 'Tuesday', expectedNumber: 2 },
  { hebrew: 'רביעי', english: 'Wednesday', expectedNumber: 3 },  // ← THE BUG
  { hebrew: 'חמישי', english: 'Thursday', expectedNumber: 4 },
  { hebrew: 'שישי', english: 'Friday', expectedNumber: 5 },
  { hebrew: 'שבת', english: 'Saturday', expectedNumber: 6 },
];

console.log('Testing Hebrew weekday parsing:');
console.log('─'.repeat(80));

let failedTests = 0;

for (const testCase of testCases) {
  // Mock the current date to our test date
  const result = parseHebrewDate(testCase.hebrew, 'Asia/Jerusalem');

  if (result.success && result.date) {
    const parsed = DateTime.fromJSDate(result.date, { zone: 'Asia/Jerusalem' });
    const dayName = parsed.toFormat('EEEE');
    const dayNumber = parsed.weekday % 7; // Convert to our system
    const expectedDayName = testCase.english;

    // Calculate expected date
    const currentDay = testDate.weekday % 7; // Monday = 1
    let daysToAdd = testCase.expectedNumber - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7;
    const expectedDate = testDate.plus({ days: daysToAdd }).startOf('day');

    const isCorrect = parsed.toFormat('yyyy-MM-dd') === expectedDate.toFormat('yyyy-MM-dd');
    const status = isCorrect ? '✓' : '✗';

    console.log(`${status} ${testCase.hebrew} (${testCase.english})`);
    console.log(`  Expected: ${expectedDate.toFormat('yyyy-MM-dd EEEE')}`);
    console.log(`  Got:      ${parsed.toFormat('yyyy-MM-dd EEEE')}`);

    if (!isCorrect) {
      failedTests++;
      const daysDiff = Math.round(parsed.diff(expectedDate, 'days').days);
      console.log(`  ⚠️  ERROR: Off by ${Math.abs(daysDiff)} days!`);
    }
    console.log('');
  } else {
    console.log(`✗ ${testCase.hebrew}: Failed to parse`);
    console.log(`  Error: ${result.error}`);
    console.log('');
    failedTests++;
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log(`Results: ${testCases.length - failedTests}/${testCases.length} passed`);
if (failedTests > 0) {
  console.log(`⚠️  ${failedTests} tests FAILED!`);
} else {
  console.log('✓ All tests passed!');
}
console.log('═══════════════════════════════════════════════════════\n');

// Test the specific production scenario
console.log('Production Scenario Test:');
console.log('─'.repeat(80));
console.log('User input: "תזכיר לי ביום רביעי בשעה 17:00 , להזמין בייביסיטר"');
console.log('Date: Monday 2025-12-22 14:24');
console.log('');

const prodResult = parseHebrewDate('רביעי', 'Asia/Jerusalem');
if (prodResult.success && prodResult.date) {
  const prodParsed = DateTime.fromJSDate(prodResult.date, { zone: 'Asia/Jerusalem' });
  console.log(`Parsed result: ${prodParsed.toFormat('yyyy-MM-dd EEEE')}`);
  console.log(`Expected:      2025-12-24 Wednesday`);
  console.log(`Bot created:   2025-12-27 Saturday`);
  console.log('');

  if (prodParsed.toFormat('yyyy-MM-dd') === '2025-12-24') {
    console.log('✓ parseHebrewDate is CORRECT!');
    console.log('⚠️  Bug must be in AI extraction, not the parser!');
  } else if (prodParsed.toFormat('yyyy-MM-dd') === '2025-12-27') {
    console.log('✗ parseHebrewDate is WRONG!');
    console.log('⚠️  Bug is in the getNextWeekday function!');
  } else {
    console.log(`? parseHebrewDate returned unexpected date: ${prodParsed.toFormat('yyyy-MM-dd')}`);
  }
} else {
  console.log(`✗ Failed to parse: ${prodResult.error}`);
}
console.log('═══════════════════════════════════════════════════════');
