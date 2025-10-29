/**
 * REGRESSION TEST: Verify Bugs #10-13 + Bug #20 (Context Awareness)
 *
 * Tests all critical bug fixes with REAL user messages from production
 * Ensures no regressions after Phase 2 implementation
 */

import { NLPService } from './services/NLPService.js';
import { pool } from './config/database.js';
import { redis } from './config/redis.js';
import logger from './utils/logger.js';

interface TestCase {
  id: string;
  description: string;
  userMessage: string;
  expectedIntent: string;
  expectedMinConfidence: number;
  validation: (result: any) => { pass: boolean; reason?: string };
}

const testCases: TestCase[] = [
  // BUG #10: "אצל" pattern should be preserved in title
  {
    id: 'BUG_10',
    description: 'אצל pattern preserved in reminder title',
    userMessage: 'תזכיר לי פגישה אצל אלבז ב14:45',
    expectedIntent: 'create_reminder',
    expectedMinConfidence: 0.7,
    validation: (result) => {
      const titleIncludes = result.reminder?.title?.includes('אצל');
      return {
        pass: titleIncludes,
        reason: titleIncludes ? '✅ Title includes "אצל"' : `❌ Title missing "אצל": ${result.reminder?.title}`
      };
    }
  },

  // BUG #11: "ל" prefix should be preserved in infinitive verbs
  {
    id: 'BUG_11',
    description: 'ל prefix preserved in infinitive verbs (לנסוע)',
    userMessage: 'קבע תזכורת ל 16:00 לנסוע הביתה',
    expectedIntent: 'create_reminder',
    expectedMinConfidence: 0.7,
    validation: (result) => {
      const titleIncludes = result.reminder?.title?.includes('לנסוע');
      return {
        pass: titleIncludes,
        reason: titleIncludes ? '✅ Title includes "לנסוע"' : `❌ Title missing "לנסוע": ${result.reminder?.title}`
      };
    }
  },

  // BUG #12: "תזכיר לי" standalone should have HIGH confidence (0.95)
  {
    id: 'BUG_12',
    description: 'תזכיר לי standalone has 0.95 confidence',
    userMessage: 'תזכיר לי',
    expectedIntent: 'create_reminder',
    expectedMinConfidence: 0.95,
    validation: (result) => {
      const pass = result.confidence >= 0.95;
      return {
        pass,
        reason: pass ? `✅ High confidence: ${result.confidence}` : `❌ Low confidence: ${result.confidence} (expected ≥0.95)`
      };
    }
  },

  // BUG #13: "ב17:00" pattern should extract time correctly
  {
    id: 'BUG_13',
    description: 'ב17:00 pattern extracts time',
    userMessage: 'פגישה עם שימי מחר ב17:00',
    expectedIntent: 'create_event',
    expectedMinConfidence: 0.7,
    validation: (result) => {
      const dateStr = result.event?.date || '';
      const hasTime = dateStr.includes('17:00');
      return {
        pass: hasTime,
        reason: hasTime ? `✅ Time extracted: ${dateStr}` : `❌ Time not extracted: ${dateStr}`
      };
    }
  },

  // Additional regression test: Multi-word event with time
  {
    id: 'REGRESSION_1',
    description: 'Complex event with participants and time',
    userMessage: 'פגישה עם דני ושרה מחר ב-15:00 במשרד',
    expectedIntent: 'create_event',
    expectedMinConfidence: 0.7,
    validation: (result) => {
      const hasTitle = !!result.event?.title;
      const hasTime = result.event?.date?.includes('15:00');
      const hasLocation = result.event?.location?.includes('משרד');
      const pass = hasTitle && hasTime && hasLocation;
      return {
        pass,
        reason: pass ? '✅ All fields extracted' : `❌ Missing fields: title=${hasTitle}, time=${hasTime}, location=${hasLocation}`
      };
    }
  },

  // Regression test: Reminder with relative time
  {
    id: 'REGRESSION_2',
    description: 'Reminder with relative time (עוד 2 שעות)',
    userMessage: 'תזכיר לי עוד 2 שעות לשתות מים',
    expectedIntent: 'create_reminder',
    expectedMinConfidence: 0.7,
    validation: (result) => {
      const hasTitle = result.reminder?.title?.includes('שתות מים');
      const hasDate = !!result.reminder?.dueDate;
      const pass = hasTitle && hasDate;
      return {
        pass,
        reason: pass ? '✅ Relative time parsed' : `❌ Missing: title=${hasTitle}, date=${hasDate}`
      };
    }
  }
];

async function runRegressionTests() {
  console.log('\n📋 REGRESSION TEST SUITE: Bugs #10-13 + General Checks');
  console.log('='.repeat(70));

  const nlpService = new NLPService();
  const results: { test: TestCase; result: any; validation: { pass: boolean; reason?: string }; error?: any }[] = [];

  for (const testCase of testCases) {
    console.log(`\n[${testCase.id}] ${testCase.description}`);
    console.log(`   User: "${testCase.userMessage}"`);

    try {
      const result = await nlpService.parseIntent(
        testCase.userMessage,
        [], // No contacts for these tests
        'Asia/Jerusalem'
      );

      console.log(`   Intent: ${result.intent} (confidence: ${result.confidence.toFixed(2)})`);

      // Check intent match
      const intentMatch = result.intent === testCase.expectedIntent;
      const confidenceMatch = result.confidence >= testCase.expectedMinConfidence;

      // Run custom validation
      const validation = testCase.validation(result);

      const pass = intentMatch && confidenceMatch && validation.pass;

      if (pass) {
        console.log(`   ✅ PASS`);
        if (validation.reason) console.log(`      ${validation.reason}`);
      } else {
        console.log(`   ❌ FAIL`);
        if (!intentMatch) console.log(`      Intent: expected ${testCase.expectedIntent}, got ${result.intent}`);
        if (!confidenceMatch) console.log(`      Confidence: expected ≥${testCase.expectedMinConfidence}, got ${result.confidence}`);
        if (validation.reason) console.log(`      ${validation.reason}`);
      }

      results.push({ test: testCase, result, validation: { pass, reason: validation.reason } });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error}`);
      results.push({ test: testCase, result: null, validation: { pass: false }, error });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));

  const passed = results.filter(r => r.validation.pass).length;
  const failed = results.filter(r => !r.validation.pass).length;
  const passRate = ((passed / results.length) * 100).toFixed(1);

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Pass Rate: ${passRate}%`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.validation.pass).forEach(r => {
      console.log(`  • ${r.test.id}: ${r.test.description}`);
    });
  }

  // Cleanup
  await pool.end();
  await redis.quit();

  console.log('\n✅ Regression test complete!\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runRegressionTests().catch(error => {
  console.error('Fatal error in regression tests:', error);
  process.exit(1);
});
