/**
 * Test: Lead Time Extraction for "תזכיר לי יום לפני"
 * Bug Fix: Ensure "תזכיר לי X לפני" is extracted as leadTimeMinutes, not notes
 */

import { GeminiNLPService } from './services/GeminiNLPService.js';

const nlpService = new GeminiNLPService();

async function testLeadTimeExtraction() {
  console.log('\n🧪 Testing Lead Time Extraction Fix\n');
  console.log('='.repeat(70));

  const testCases = [
    {
      name: 'Original Bug: "תזכיר לי יום לפני"',
      message: 'יום שישי , 09:30\nטקס קבלת ספר תורה לאמה \nתזכיר לי יום לפני',
      expectedLeadTime: 1440,
      expectedTitle: 'טקס קבלת ספר תורה לאמה'
    },
    {
      name: 'Hour before: "תזכיר לי שעה לפני"',
      message: 'פגישה מחר 14:00 תזכיר לי שעה לפני',
      expectedLeadTime: 60,
      expectedTitle: 'פגישה'
    },
    {
      name: '30 minutes: "תזכיר לי 30 דקות לפני"',
      message: 'תזכיר לי ביום רביעי 16:00 לקחת את הילדים תזכיר לי 30 דקות לפני',
      expectedLeadTime: 30,
      expectedTitle: 'לקחת את הילדים'
    },
    {
      name: 'No lead time specified (should be undefined)',
      message: 'תזכיר לי מחר בשעה 10 לקנות חלב',
      expectedLeadTime: undefined,
      expectedTitle: 'לקנות חלב'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Message: "${testCase.message.substring(0, 60)}${testCase.message.length > 60 ? '...' : ''}"`);

    try {
      const result = await nlpService.parseIntent(testCase.message, [], 'Asia/Jerusalem');

      console.log(`   Intent: ${result.intent}`);
      console.log(`   Title: ${result.reminder?.title || '(none)'}`);
      console.log(`   Lead Time: ${result.reminder?.leadTimeMinutes || '(none)'}`);
      console.log(`   Notes: ${result.reminder?.notes || '(none)'}`);

      // Validation
      const checks = [];

      // Check 1: Intent should be create_reminder
      if (result.intent === 'create_reminder') {
        checks.push('✅ Intent: create_reminder');
      } else {
        checks.push(`❌ Intent: ${result.intent} (expected create_reminder)`);
      }

      // Check 2: Title should match
      if (result.reminder?.title?.includes(testCase.expectedTitle)) {
        checks.push(`✅ Title contains: "${testCase.expectedTitle}"`);
      } else {
        checks.push(`❌ Title: "${result.reminder?.title}" (expected to contain "${testCase.expectedTitle}")`);
      }

      // Check 3: Lead time should match
      if (result.reminder?.leadTimeMinutes === testCase.expectedLeadTime) {
        checks.push(`✅ Lead Time: ${testCase.expectedLeadTime} minutes`);
      } else {
        checks.push(`❌ Lead Time: ${result.reminder?.leadTimeMinutes} (expected ${testCase.expectedLeadTime})`);
      }

      // Check 4: "תזכיר לי X לפני" should NOT be in notes
      const hasLeadTimeInNotes = result.reminder?.notes?.includes('לפני') || result.reminder?.notes?.includes('תזכיר');
      if (!hasLeadTimeInNotes) {
        checks.push('✅ Notes clean (no "תזכיר לי...לפני")');
      } else {
        checks.push(`❌ Notes polluted: "${result.reminder?.notes}"`);
      }

      checks.forEach(check => console.log(`   ${check}`));

      const allPassed = checks.every(c => c.startsWith('✅'));
      if (allPassed) {
        console.log('\n   🎉 PASSED');
        passed++;
      } else {
        console.log('\n   ❌ FAILED');
        failed++;
      }

    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

  if (failed === 0) {
    console.log('✅ ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

testLeadTimeExtraction().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
