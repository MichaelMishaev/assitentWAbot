/**
 * Test: Lead Time Extraction from "תזכיר לי יום לפני"
 *
 * This test verifies that EntityExtractionPhase correctly extracts
 * leadTimeMinutes from Hebrew phrases like "תזכיר לי יום לפני"
 * and copies it to context.entities.
 */

import { EntityExtractionPhase } from './domain/phases/phase3-entity-extraction/EntityExtractionPhase.js';
import { PhaseContext } from './domain/orchestrator/PhaseContext.js';
import { IncomingMessage } from './providers/IMessageProvider.js';

async function testLeadTimeExtraction() {
  console.log('🧪 Testing Lead Time Extraction in EntityExtractionPhase...\n');

  // Create test message with "תזכיר לי יום לפני" (remind me 1 day before)
  const testMessage: IncomingMessage = {
    from: '972501234567',
    messageId: 'test-123',
    content: {
      text: 'יום שישי , 09:30 / טקס קבלת ספר תורה לאמה / תזכיר לי יום לפני'
    },
    timestamp: Date.now(),
    isFromMe: false
  };

  // Create context
  const context = new PhaseContext(testMessage, '972501234567', 'Asia/Jerusalem');
  context.intent = 'create_reminder';

  // Run EntityExtractionPhase
  const phase = new EntityExtractionPhase();
  const result = await phase.execute(context);

  // Verify results
  console.log('📊 Test Results:\n');
  console.log('Phase success:', result.success);
  console.log('Entity count:', result.data.entityCount);
  console.log('Overall confidence:', result.data.confidence.toFixed(2));
  console.log('\n📝 Extracted Entities:');
  console.log('  Title:', context.entities.title);
  console.log('  Date:', context.entities.date);
  console.log('  Time:', context.entities.time);
  console.log('  Notes:', context.entities.notes);
  console.log('  ✅ leadTimeMinutes:', context.entities.leadTimeMinutes);

  // Assertions
  const tests = [
    {
      name: 'Phase executed successfully',
      pass: result.success === true
    },
    {
      name: 'leadTimeMinutes extracted (1440 = 1 day)',
      pass: context.entities.leadTimeMinutes === 1440
    },
    {
      name: 'Notes does NOT contain "תזכיר לי יום לפני"',
      pass: !context.entities.notes?.includes('תזכיר לי')
    },
    {
      name: 'Title extracted correctly',
      pass: !!context.entities.title
    },
    {
      name: 'Date extracted correctly',
      pass: !!context.entities.date
    }
  ];

  console.log('\n✅ Test Assertions:');
  let allPassed = true;
  tests.forEach(test => {
    const icon = test.pass ? '✅' : '❌';
    console.log(`  ${icon} ${test.name}`);
    if (!test.pass) allPassed = false;
  });

  if (allPassed) {
    console.log('\n🎉 All tests passed! EntityExtractionPhase correctly extracts leadTimeMinutes.');
  } else {
    console.log('\n❌ Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

testLeadTimeExtraction().catch(error => {
  console.error('❌ Test failed with error:', error);
  process.exit(1);
});
