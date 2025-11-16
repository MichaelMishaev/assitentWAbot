/**
 * Test Smart Hybrid Recurrence against Production Data
 *
 * Tests the new Phase 7 logic with real production messages
 */

import { RecurrencePhase } from './src/domain/phases/phase7-recurrence/RecurrencePhase.js';
import { PhaseContext } from './src/domain/orchestrator/PhaseContext.js';

const phase = new RecurrencePhase();

interface TestCase {
  name: string;
  text: string;
  aiRecurrence?: {
    pattern: string;
    rrule: string;
  };
  expectedPattern: 'daily' | 'weekly' | 'monthly';
  expectedDay?: string; // For weekly: SU, MO, TU, WE, TH, FR, SA
  shouldOverrideAI: boolean;
}

const testCases: TestCase[] = [
  // Production Bug Case #1: User 972544345287
  {
    name: 'Hebrew Wednesday abbreviation',
    text: 'קבע תזכורת כל יום ד בשעה 18:00 ללכת לאימון',
    aiRecurrence: {
      pattern: 'daily', // AI made this mistake
      rrule: 'FREQ=DAILY'
    },
    expectedPattern: 'weekly',
    expectedDay: 'WE',
    shouldOverrideAI: true
  },

  // Production Bug Case #2: User 972542101057
  {
    name: 'Hebrew Monday with implicit recurring (חוג)',
    text: 'חוג בישול לרום ואמה כל יום שני ב18:00',
    aiRecurrence: {
      pattern: 'daily',
      rrule: 'FREQ=DAILY'
    },
    expectedPattern: 'weekly',
    expectedDay: 'MO',
    shouldOverrideAI: true
  },

  // Edge Case #1: Full Hebrew day name
  {
    name: 'Full Hebrew day name',
    text: 'תזכורת כל יום רביעי בשעה 15:00',
    aiRecurrence: {
      pattern: 'weekly',
      rrule: 'FREQ=WEEKLY;BYDAY=WE'
    },
    expectedPattern: 'weekly',
    expectedDay: 'WE',
    shouldOverrideAI: false // AI got it right
  },

  // Edge Case #2: English (should NOT override)
  {
    name: 'English pattern - keep AI',
    text: 'remind me every Monday at 3pm',
    aiRecurrence: {
      pattern: 'weekly',
      rrule: 'FREQ=WEEKLY;BYDAY=MO'
    },
    expectedPattern: 'weekly',
    expectedDay: 'MO',
    shouldOverrideAI: false // Keep AI for English
  },

  // Edge Case #3: Daily without day (should NOT override if AI got it)
  {
    name: 'Daily pattern - keep AI',
    text: 'תזכורת כל יום בשעה 8 בבוקר',
    aiRecurrence: {
      pattern: 'daily',
      rrule: 'FREQ=DAILY'
    },
    expectedPattern: 'daily',
    shouldOverrideAI: false // AI correct, no Hebrew day
  },

  // Edge Case #4: Tuesday abbreviation
  {
    name: 'Hebrew Tuesday abbreviation',
    text: 'אימון כל ג בשעה 17:00',
    aiRecurrence: {
      pattern: 'daily',
      rrule: 'FREQ=DAILY'
    },
    expectedPattern: 'weekly',
    expectedDay: 'TU',
    shouldOverrideAI: true
  },

  // Edge Case #5: No recurrence - AI wrong, rule also finds nothing
  {
    name: 'No recurrence at all',
    text: 'פגישה עם דני מחר בשעה 3',
    aiRecurrence: {
      pattern: 'daily', // AI hallucinated
      rrule: 'FREQ=DAILY'
    },
    expectedPattern: 'weekly', // Won't match, will keep AI (wrong but consistent)
    shouldOverrideAI: false // No Hebrew day pattern, keep AI
  },

  // Edge Case #6: Implicit recurring with lesson
  {
    name: 'Implicit recurring - שיעור',
    text: 'שיעור גיטרה ביום חמישי 16:00',
    aiRecurrence: {
      pattern: 'daily',
      rrule: 'FREQ=DAILY'
    },
    expectedPattern: 'weekly',
    expectedDay: 'TH',
    shouldOverrideAI: true
  }
];

async function runTests() {
  console.log('🧪 Testing Smart Hybrid Recurrence Phase\n');
  console.log('=' .repeat(80));

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`   Text: "${test.text}"`);

    const context: PhaseContext = {
      userId: 'test-user',
      phone: '972544345287',
      originalText: test.text,
      processedText: test.text,
      intent: 'create_reminder',
      confidence: 0.95,
      entities: test.aiRecurrence ? {
        recurrence: test.aiRecurrence
      } : {}
    } as any;

    const result = await phase.execute(context);

    // Check if override happened correctly
    // BasePhase.success() puts metadata in result.data
    const didOverride = result.data?.overriddenAI === true;
    const keptAI = result.data?.keptAI === true;

    console.log(`   AI Recurrence: ${test.aiRecurrence ? test.aiRecurrence.pattern : 'none'}`);
    console.log(`   Expected Override: ${test.shouldOverrideAI ? 'YES' : 'NO'}`);
    console.log(`   Actual Override: ${didOverride ? 'YES' : (keptAI ? 'NO (kept AI)' : 'N/A')}`);

    if (context.entities.recurrence) {
      console.log(`   Result Pattern: ${context.entities.recurrence.pattern}`);
      console.log(`   Result RRULE: ${context.entities.recurrence.rrule?.substring(0, 60)}`);
    }

    // Validate
    let testPassed = true;

    if (test.shouldOverrideAI && !didOverride) {
      console.log(`   ❌ FAIL: Should have overridden AI but didn't`);
      testPassed = false;
    }

    if (!test.shouldOverrideAI && didOverride) {
      console.log(`   ❌ FAIL: Should NOT have overridden AI but did`);
      testPassed = false;
    }

    if (context.entities.recurrence && test.shouldOverrideAI) {
      if (context.entities.recurrence.pattern !== test.expectedPattern) {
        console.log(`   ❌ FAIL: Expected pattern ${test.expectedPattern}, got ${context.entities.recurrence.pattern}`);
        testPassed = false;
      }

      if (test.expectedDay && !context.entities.recurrence.rrule?.includes(test.expectedDay)) {
        console.log(`   ❌ FAIL: Expected day ${test.expectedDay} in RRULE`);
        testPassed = false;
      }
    }

    if (testPassed) {
      console.log(`   ✅ PASS`);
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Results: ${passed}/${testCases.length} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('✅ All tests passed!\n');
  } else {
    console.log(`❌ ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
