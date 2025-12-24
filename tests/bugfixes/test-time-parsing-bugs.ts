/**
 * Test for Time Parsing Bugs (#B, #R)
 * Bug #B: User updates time to 09:45, bot records different time
 * Bug #R: User says 11, bot records 10
 *
 * Production reports:
 * - Bug #B (2025-12-21): "עדכנתי 09:45 , הוא נתן שעה אחרת"
 * - Bug #R (2025-11-02): "אמרתי לו 11 ... רשם 10"
 */

import { AIEntityExtractor } from '../../src/domain/phases/phase3-entity-extraction/AIEntityExtractor.js';
import { parseHebrewDate } from '../../src/utils/hebrewDateParser.js';
import { DateTime } from 'luxon';

const aiExtractor = new AIEntityExtractor();
const timezone = 'Asia/Jerusalem';

interface TestCase {
  name: string;
  input: string;
  expectedTime: string; // HH:mm format
  bugNumber?: string;
}

const testCases: TestCase[] = [
  // Bug #B: 09:45 should be 09:45, not something else
  {
    name: 'Bug #B - Update time to 09:45',
    input: 'עדכן ל 09:45',
    expectedTime: '09:45',
    bugNumber: '#B'
  },
  {
    name: 'Bug #B variant - 09:45 in different context',
    input: 'תזכורת בשעה 09:45',
    expectedTime: '09:45',
    bugNumber: '#B'
  },

  // Bug #R: 11 should be 11:00, not 10:00
  {
    name: 'Bug #R - Time 11 should be 11:00',
    input: 'תזכורת ב 11',
    expectedTime: '11:00',
    bugNumber: '#R'
  },
  {
    name: 'Bug #R variant - Just "11"',
    input: '11',
    expectedTime: '11:00',
    bugNumber: '#R'
  },
  {
    name: 'Bug #R variant - "בשעה 11"',
    input: 'בשעה 11',
    expectedTime: '11:00',
    bugNumber: '#R'
  },

  // Additional time parsing tests
  {
    name: 'Time with colon - 14:30',
    input: 'תזכורת ב 14:30',
    expectedTime: '14:30'
  },
  {
    name: 'Time without colon - 15',
    input: 'תזכורת ב 15',
    expectedTime: '15:00'
  },
  {
    name: 'Morning time - 08:00',
    input: 'תזכורת ב 8',
    expectedTime: '08:00'
  },
  {
    name: 'Evening time - 20:00',
    input: 'תזכורת ב 20',
    expectedTime: '20:00'
  },
  {
    name: 'Time with "בשעה" - 16:15',
    input: 'בשעה 16:15',
    expectedTime: '16:15'
  }
];

async function runTests() {
  console.log('🧪 Testing Time Parsing (Bugs #B, #R)\n');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const testCase of testCases) {
    try {
      // Extract entities using AI (intent: "create_reminder" for time extraction)
      const result = await aiExtractor.extract(testCase.input, 'create_reminder', timezone);

      // Check if time was extracted
      if (!result.time) {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Input: "${testCase.input}"`);
        console.log(`   Expected time: ${testCase.expectedTime}`);
        console.log(`   Actual: NO TIME EXTRACTED`);
        console.log(`   Full result: ${JSON.stringify(result, null, 2)}`);
        if (testCase.bugNumber) {
          console.log(`   🐛 Bug: ${testCase.bugNumber}`);
        }
        console.log('');
        failed++;
        failures.push(`${testCase.name}: No time extracted`);
        continue;
      }

      // Parse the extracted time
      const extractedTime = result.time;

      // Check if it matches expected
      if (extractedTime === testCase.expectedTime) {
        console.log(`✅ ${testCase.name}`);
        console.log(`   Input: "${testCase.input}"`);
        console.log(`   Extracted: ${extractedTime} ✓`);
        if (testCase.bugNumber) {
          console.log(`   🐛 Bug ${testCase.bugNumber} - FIXED!`);
        }
        console.log('');
        passed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Input: "${testCase.input}"`);
        console.log(`   Expected: ${testCase.expectedTime}`);
        console.log(`   Actual: ${extractedTime}`);
        console.log(`   Difference: Expected ${testCase.expectedTime}, got ${extractedTime}`);
        if (testCase.bugNumber) {
          console.log(`   🐛 Bug: ${testCase.bugNumber} - STILL FAILING!`);
        }
        console.log('');
        failed++;
        failures.push(`${testCase.name}: Expected ${testCase.expectedTime}, got ${extractedTime}`);
      }

    } catch (error) {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Error: ${error}`);
      console.log('');
      failed++;
      failures.push(`${testCase.name}: ${error}`);
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`Results: ${passed}/${testCases.length} passed`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('❌ Failed tests:');
    failures.forEach(f => console.log(`   - ${f}`));
    console.log('');
    process.exit(1);
  } else {
    console.log('✅ All time parsing tests PASSED!');
    console.log('🎉 Bugs #B and #R are FIXED!\n');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
