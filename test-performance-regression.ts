/**
 * Performance Regression Test Suite
 * Tests for Dec 10, 2025 performance optimization
 *
 * Run: tsx test-performance-regression.ts
 */

import { NLPService } from './src/services/NLPService.js';
import logger from './src/utils/logger.js';

interface TestCase {
  name: string;
  message: string;
  expectedIntent: string;
  minConfidence?: number;
  expectedFields?: Record<string, any>;
}

const testCases: TestCase[] = [
  // Intent Classification Accuracy
  {
    name: "Event creation with contact and time",
    message: "פגישה עם דני מחר ב-3",
    expectedIntent: "create_event",
    minConfidence: 0.9,
    expectedFields: {
      "event.contactName": "דני"
    }
  },
  {
    name: "Simple reminder",
    message: "תזכיר לי מחר ב2 להתקשר",
    expectedIntent: "create_reminder",
    minConfidence: 0.9
  },
  {
    name: "List events today",
    message: "מה יש לי היום",
    expectedIntent: "list_events",
    minConfidence: 0.9
  },
  {
    name: "Delete all events",
    message: "מחק את כל האירועים",
    expectedIntent: "delete_event",
    expectedFields: {
      "event.deleteAll": true
    }
  },
  {
    name: "Search by title",
    message: "מתי רופא שיניים",
    expectedIntent: "search_event",
    minConfidence: 0.9
  },
  {
    name: "Update event",
    message: "עדכן פגישה ל-5 אחרי הצהריים",
    expectedIntent: "update_event"
  },
  {
    name: "Generate dashboard",
    message: "צור דוח אישי",
    expectedIntent: "generate_dashboard"
  },
  {
    name: "Reminder with lead time",
    message: "תזכיר לי יום לפני הפגישה",
    expectedIntent: "create_reminder",
    expectedFields: {
      "reminder.leadTimeMinutes": 1440
    }
  },
  // Critical Fixes
  {
    name: "Minimal reminder",
    message: "תזכיר לי",
    expectedIntent: "create_reminder",
    minConfidence: 0.95
  },
  {
    name: "Contact extraction",
    message: "פגישה עם דני",
    expectedIntent: "create_event",
    expectedFields: {
      "event.contactName": "דני"
    }
  },
  {
    name: "List all events (no title)",
    message: "כל האירועים",
    expectedIntent: "list_events"
  },
  {
    name: "List by day of week",
    message: "ביום רביעי",
    expectedIntent: "list_events"
  }
];

async function runTest(testCase: TestCase, nlpService: NLPService): Promise<boolean> {
  const startTime = Date.now();

  try {
    const result = await nlpService.parseIntent(
      testCase.message,
      [],
      'Asia/Jerusalem'
    );

    const duration = Date.now() - startTime;

    // Check performance
    if (duration > 2000) {
      console.log(`    ⚠️  SLOW (${duration}ms) - Should be <2s`);
    }

    // Check intent
    if (result.intent !== testCase.expectedIntent) {
      console.log(`    ❌ FAIL: Intent mismatch`);
      console.log(`       Expected: ${testCase.expectedIntent}`);
      console.log(`       Got: ${result.intent}`);
      return false;
    }

    // Check confidence
    if (testCase.minConfidence && result.confidence < testCase.minConfidence) {
      console.log(`    ❌ FAIL: Low confidence`);
      console.log(`       Expected: >=${testCase.minConfidence}`);
      console.log(`       Got: ${result.confidence}`);
      return false;
    }

    // Check expected fields
    if (testCase.expectedFields) {
      for (const [path, expectedValue] of Object.entries(testCase.expectedFields)) {
        const parts = path.split('.');
        let actual: any = result;
        for (const part of parts) {
          actual = actual?.[part];
        }

        if (actual !== expectedValue) {
          console.log(`    ❌ FAIL: Field mismatch`);
          console.log(`       Field: ${path}`);
          console.log(`       Expected: ${expectedValue}`);
          console.log(`       Got: ${actual}`);
          return false;
        }
      }
    }

    console.log(`    ✅ PASS (${duration}ms, confidence: ${result.confidence.toFixed(2)})`);
    return true;

  } catch (error: any) {
    console.log(`    ❌ ERROR: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Performance Regression Test Suite');
  console.log('=====================================\n');

  console.log('Testing optimized NLPService (70% token reduction)');
  console.log('Target: <2s response time, ≥0.9 confidence\n');

  const nlpService = new NLPService();

  let passed = 0;
  let failed = 0;
  const durations: number[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`[${i + 1}/${testCases.length}] ${testCase.name}`);
    console.log(`  Message: "${testCase.message}"`);

    const success = await runTest(testCase, nlpService);

    if (success) {
      passed++;
    } else {
      failed++;
    }

    console.log('');
  }

  console.log('=====================================');
  console.log('📊 Test Summary');
  console.log('=====================================');
  console.log(`Total Tests: ${testCases.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log('=====================================\n');

  if (failed > 0) {
    console.log('❌ Some tests failed!');
    console.log('The performance optimization may have broken existing functionality.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    console.log('Performance optimization is working correctly.');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
