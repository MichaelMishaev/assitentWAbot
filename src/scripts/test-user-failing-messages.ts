/**
 * Test Script - Simulate User's Failing Messages from Oct 8, 2025
 *
 * This script tests the EXACT messages that failed yesterday to verify all fixes work.
 *
 * USER'S PROBLEMS (Oct 8, 2025 night):
 * 1. Couldn't see what's on Sundays (day-of-week query)
 * 2. Couldn't update recurring reminder time (6+ failed attempts)
 * 3. Bot kept misclassifying reminder updates as event updates
 *
 * TESTS:
 * ✓ Day-of-week queries (ימי ראשון, ביום ראשון)
 * ✓ Time extraction ("ל 19:00", "לשעה 19:30")
 * ✓ NLP classification (reminder vs event)
 * ✓ Fuzzy matching (אימון → ללכת לאימון)
 */

import { parseHebrewDate } from '../utils/hebrewDateParser.js';
import { NLPService } from '../services/NLPService.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';

interface TestCase {
  name: string;
  userMessage: string;
  expectedIntent?: string;
  expectedToPass: boolean;
  description: string;
}

/**
 * Color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

/**
 * Format test result for console
 */
function formatResult(passed: boolean, message: string): string {
  const icon = passed ? '✓' : '✗';
  const color = passed ? colors.green : colors.red;
  return `${color}${icon}${colors.reset} ${message}`;
}

/**
 * Test 1: Hebrew Date Parser - Day of Week Support
 */
async function testHebrewDateParser(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}TEST 1: Hebrew Date Parser - Day-of-Week Queries${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const testCases: Array<{ input: string; shouldPass: boolean; description: string }> = [
    {
      input: 'ימי ראשון',
      shouldPass: true,
      description: 'User said: "מה יש לי בימי ראשון?" (What do I have on Sundays?)'
    },
    {
      input: 'ביום ראשון',
      shouldPass: true,
      description: 'User said: "מה יש לי ביום ראשון?" (What do I have on Sunday?)'
    },
    {
      input: 'יום ראשון',
      shouldPass: true,
      description: 'Basic day query: "יום ראשון" (Sunday)'
    },
    {
      input: 'ימי שני',
      shouldPass: true,
      description: 'Monday plural: "ימי שני"'
    },
    {
      input: 'ביום שישי',
      shouldPass: true,
      description: 'Friday with prefix: "ביום שישי"'
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = parseHebrewDate(testCase.input);
    const success = result.success === testCase.shouldPass;

    if (success) {
      passed++;
      console.log(formatResult(true, `"${testCase.input}" → Parsed successfully`));
      if (result.date) {
        const dt = DateTime.fromJSDate(result.date).setZone('Asia/Jerusalem');
        console.log(`  ${colors.blue}→${colors.reset} ${testCase.description}`);
        console.log(`  ${colors.blue}→${colors.reset} Next occurrence: ${dt.toFormat('EEEE dd/MM/yyyy HH:mm')}`);
      }
    } else {
      failed++;
      console.log(formatResult(false, `"${testCase.input}" → Failed`));
      console.log(`  ${colors.red}→${colors.reset} Expected: ${testCase.shouldPass ? 'SUCCESS' : 'FAIL'}`);
      console.log(`  ${colors.red}→${colors.reset} Got: ${result.success ? 'SUCCESS' : 'FAIL'}`);
      if (result.error) {
        console.log(`  ${colors.red}→${colors.reset} Error: ${result.error}`);
      }
    }
    console.log('');
  }

  console.log(`${colors.bold}Results:${colors.reset} ${colors.green}${passed} passed${colors.reset}, ${colors.red}${failed} failed${colors.reset}\n`);
}

/**
 * Test 2: NLP Service - Intent Classification & Time Extraction
 */
async function testNLPService(): Promise<void> {
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}TEST 2: NLP Service - Classification & Time Extraction${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const nlpService = new NLPService();

  const testCases: TestCase[] = [
    // USER'S ACTUAL FAILING MESSAGES FROM OCT 8
    {
      name: 'Failed Message #1',
      userMessage: 'תזכורת של ימי ראשון, תעדכן שעה ל 19:00',
      expectedIntent: 'update_reminder',
      expectedToPass: true,
      description: 'Oct 8, 23:33 - User tried to update recurring reminder time'
    },
    {
      name: 'Failed Message #2',
      userMessage: 'אימונים של ימי ראשון תעדכן לשעה 19:30',
      expectedIntent: 'update_reminder', // Was classified as update_event (BUG!)
      expectedToPass: true,
      description: 'Oct 8, 23:34 - Misclassified as update_event'
    },
    {
      name: 'Failed Message #3',
      userMessage: 'תזכורת של ימי ראשון, אימונים. תעדכן לשעה 19:30',
      expectedIntent: 'update_reminder',
      expectedToPass: true,
      description: 'Oct 8, 23:34 - User explicitly said "תזכורת" but time not extracted'
    },
    {
      name: 'Failed Message #4',
      userMessage: 'עדכן אימון של יום ראשון לשעה 19:30',
      expectedIntent: 'update_reminder', // Should be reminder, not event
      expectedToPass: true,
      description: 'Oct 8, 23:35 - Partial title match needed'
    },
    {
      name: 'Failed Message #5',
      userMessage: 'עדכן ללכת לאימון לשעה 19:30',
      expectedIntent: 'update_reminder', // Was update_event
      expectedToPass: true,
      description: 'Oct 8, 23:35 - EXACT name, still failed!'
    },
    // DAY-OF-WEEK QUERIES
    {
      name: 'Day Query #1',
      userMessage: 'מה יש לי בימי ראשון?',
      expectedIntent: 'list_events',
      expectedToPass: true,
      description: 'Oct 8, 22:26 - Could not parse "ימי ראשון"'
    },
    {
      name: 'Day Query #2',
      userMessage: 'מה יש לי ביום ראשון?',
      expectedIntent: 'list_events',
      expectedToPass: true,
      description: 'Oct 8, 22:26 - Could not parse "ביום ראשון"'
    },
    // ADDITIONAL EDGE CASES
    {
      name: 'Time Format #1',
      userMessage: 'עדכן תזכורת אימון ל 19:00',
      expectedIntent: 'update_reminder',
      expectedToPass: true,
      description: 'Time with "ל" prefix (no "שעה")'
    },
    {
      name: 'Time Format #2',
      userMessage: 'עדכן אימון ל-19:30',
      expectedIntent: 'update_reminder',
      expectedToPass: true,
      description: 'Time with "ל-" prefix'
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const result = await nlpService.parseIntent(testCase.userMessage, [], 'Asia/Jerusalem');

      // Check intent classification
      const intentCorrect = result.intent === testCase.expectedIntent;

      // Check if time was extracted (for update_reminder cases)
      let timeExtracted = true;
      if (testCase.expectedIntent === 'update_reminder' && testCase.userMessage.includes('19:') || testCase.userMessage.includes('ל ')) {
        const hasTime = result.reminder?.time || result.reminder?.date || result.reminder?.dateText;
        timeExtracted = !!hasTime;
      }

      // Check if date was parsed (for day-of-week queries)
      let dateExtracted = true;
      if (testCase.expectedIntent === 'list_events' && (testCase.userMessage.includes('ימי') || testCase.userMessage.includes('ביום'))) {
        dateExtracted = !!result.event?.dateText;
      }

      const success = intentCorrect && timeExtracted && dateExtracted;

      if (success) {
        passed++;
        console.log(formatResult(true, `${testCase.name}`));
        console.log(`  ${colors.blue}→${colors.reset} Message: "${testCase.userMessage}"`);
        console.log(`  ${colors.blue}→${colors.reset} ${testCase.description}`);
        console.log(`  ${colors.green}→${colors.reset} Intent: ${result.intent} (confidence: ${result.confidence})`);

        if (result.reminder) {
          console.log(`  ${colors.green}→${colors.reset} Reminder Title: ${result.reminder.title || 'N/A'}`);
          if (result.reminder.time) console.log(`  ${colors.green}→${colors.reset} Time Extracted: ${result.reminder.time}`);
          if (result.reminder.date) console.log(`  ${colors.green}→${colors.reset} Date: ${result.reminder.date}`);
          if (result.reminder.dateText) console.log(`  ${colors.green}→${colors.reset} DateText: ${result.reminder.dateText}`);
        }

        if (result.event?.dateText) {
          console.log(`  ${colors.green}→${colors.reset} DateText: ${result.event.dateText}`);
        }
      } else {
        failed++;
        console.log(formatResult(false, `${testCase.name}`));
        console.log(`  ${colors.red}→${colors.reset} Message: "${testCase.userMessage}"`);
        console.log(`  ${colors.red}→${colors.reset} ${testCase.description}`);
        console.log(`  ${colors.red}→${colors.reset} Expected Intent: ${testCase.expectedIntent}`);
        console.log(`  ${colors.red}→${colors.reset} Got Intent: ${result.intent} (confidence: ${result.confidence})`);

        if (!intentCorrect) {
          console.log(`  ${colors.red}→${colors.reset} ❌ Intent classification FAILED`);
        }
        if (!timeExtracted) {
          console.log(`  ${colors.red}→${colors.reset} ❌ Time extraction FAILED`);
          console.log(`  ${colors.red}→${colors.reset} Reminder data: ${JSON.stringify(result.reminder)}`);
        }
        if (!dateExtracted) {
          console.log(`  ${colors.red}→${colors.reset} ❌ Date extraction FAILED`);
          console.log(`  ${colors.red}→${colors.reset} Event data: ${JSON.stringify(result.event)}`);
        }
      }
      console.log('');
    } catch (error) {
      failed++;
      console.log(formatResult(false, `${testCase.name}`));
      console.log(`  ${colors.red}→${colors.reset} Message: "${testCase.userMessage}"`);
      console.log(`  ${colors.red}→${colors.reset} ERROR: ${error}`);
      console.log('');
    }
  }

  console.log(`${colors.bold}Results:${colors.reset} ${colors.green}${passed} passed${colors.reset}, ${colors.red}${failed} failed${colors.reset}\n`);
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║  USER FAILING MESSAGES TEST - Oct 8, 2025 Issues    ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.yellow}Testing the EXACT messages that failed yesterday...${colors.reset}\n`);

  try {
    // Test 1: Hebrew Date Parser
    await testHebrewDateParser();

    // Test 2: NLP Service
    await testNLPService();

    console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.green}✓ ALL TESTS COMPLETED${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}${colors.bold}TEST SUITE FAILED:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run tests
runTests().then(() => {
  console.log(`${colors.green}Done!${colors.reset}\n`);
  process.exit(0);
}).catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
