/**
 * Test AI extraction of weekday names
 * Bug: AI was calculating weekdays as dates instead of extracting as dateText
 * Fix: Updated prompt to extract weekdays only as dateText, leave date=null
 */

import { AIEntityExtractor } from './src/domain/phases/phase3-entity-extraction/AIEntityExtractor.js';
import { DateTime } from 'luxon';

console.log('═══════════════════════════════════════════════════════');
console.log('Testing AI Weekday Extraction Fix');
console.log('═══════════════════════════════════════════════════════\n');

const extractor = new AIEntityExtractor();
const timezone = 'Asia/Jerusalem';

const testCases = [
  {
    name: 'Production Bug - Wednesday',
    input: 'תזכיר לי ביום רביעי בשעה 17:00 להזמין בייביסיטר',
    expectedDateText: 'רביעי',
    expectedWeekday: 'Wednesday',
  },
  {
    name: 'Monday',
    input: 'תזכיר לי ביום שני בבוקר',
    expectedDateText: 'שני',
    expectedWeekday: 'Monday',
  },
  {
    name: 'Tuesday',
    input: 'פגישה ביום שלישי',
    expectedDateText: 'שלישי',
    expectedWeekday: 'Tuesday',
  },
  {
    name: 'Thursday',
    input: 'אירוע יום חמישי',
    expectedDateText: 'חמישי',
    expectedWeekday: 'Thursday',
  },
  {
    name: 'Friday',
    input: 'יום שישי תזכורת',
    expectedDateText: 'שישי',
    expectedWeekday: 'Friday',
  },
  {
    name: 'Saturday',
    input: 'שבת אירוע',
    expectedDateText: 'שבת',
    expectedWeekday: 'Saturday',
  },
  {
    name: 'Sunday',
    input: 'יום ראשון פגישה',
    expectedDateText: 'ראשון',
    expectedWeekday: 'Sunday',
  },
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log(`Input: "${testCase.input}"`);

    try {
      const result = await extractor.extract(
        testCase.input,
        'create_reminder',
        timezone
      );

      console.log(`  AI extracted:`);
      console.log(`    - Full result: ${JSON.stringify(result, null, 2)}`);
      console.log(`    - dateText: ${result.dateText || 'null'} (type: ${typeof result.dateText})`);
      console.log(`    - date: ${result.date ? DateTime.fromJSDate(result.date).toISO() : 'null'}`);

      // Check if dateText contains the expected weekday name
      const hasDateText = result.dateText?.includes(testCase.expectedDateText);

      // Check if date is null (should NOT be calculated by AI for weekdays)
      const dateIsNull = result.date === undefined || result.date === null;

      if (hasDateText && dateIsNull) {
        console.log(`  ✓ PASSED - AI extracted weekday as dateText, left date=null`);
        passed++;
      } else {
        console.log(`  ✗ FAILED`);
        if (!hasDateText) {
          console.log(`    - dateText doesn't contain "${testCase.expectedDateText}"`);
        }
        if (!dateIsNull) {
          console.log(`    - date should be null but is: ${result.date}`);
          console.log(`    - AI incorrectly calculated the date!`);
        }
        failed++;
      }
    } catch (error: any) {
      console.log(`  ✗ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${testCases.length} passed`);
  if (failed === 0) {
    console.log('✓ AI Weekday extraction is FIXED!');
    console.log('  AI now correctly extracts weekdays as dateText');
    console.log('  Hebrew parser will calculate the actual dates');
  } else {
    console.log(`⚠️  ${failed} tests failed`);
    console.log('  AI may still be calculating weekday dates incorrectly');
  }
  console.log('═══════════════════════════════════════════════════════');

  process.exit(failed === 0 ? 0 : 1);
}

runTests();
