/**
 * Test script for Bug #4 fix: Greeting Detection
 *
 * Tests that the new greeting detection utility correctly identifies
 * greetings vs non-greetings (emoji, gibberish, etc.)
 */

import { isGreeting } from './src/utils/greetingDetection.js';

interface TestCase {
  input: string;
  expected: boolean;
  description: string;
}

const testCases: TestCase[] = [
  // ===== POSITIVE TESTS (Should be detected as greetings) =====
  { input: 'היי', expected: true, description: 'Hebrew: היי' },
  { input: 'שלום', expected: true, description: 'Hebrew: שלום' },
  { input: 'בוקר טוב', expected: true, description: 'Hebrew: בוקר טוב' },
  { input: 'מה נשמע', expected: true, description: 'Hebrew: מה נשמע' },
  { input: 'מה קורה', expected: true, description: 'Hebrew: מה קורה' },
  { input: 'hello', expected: true, description: 'English: hello' },
  { input: 'hi', expected: true, description: 'English: hi' },
  { input: 'hey', expected: true, description: 'English: hey' },
  { input: 'good morning', expected: true, description: 'English: good morning' },
  { input: "what's up", expected: true, description: 'English: what\'s up' },
  { input: 'yo', expected: true, description: 'English slang: yo' },

  // ===== NEGATIVE TESTS (Should NOT be detected as greetings) =====
  { input: '👍', expected: false, description: 'Emoji: thumbs up (Bug #4 example)' },
  { input: 'ططط', expected: false, description: 'Arabic gibberish (Bug #4 example)' },
  { input: 'asdfasdf', expected: false, description: 'Random gibberish' },
  { input: '😊', expected: false, description: 'Emoji: smiley face' },
  { input: '123', expected: false, description: 'Numbers only' },
  { input: 'תזכיר לי מחר', expected: false, description: 'Command (not greeting)' },
  { input: 'create event', expected: false, description: 'Command (not greeting)' },
  { input: '!@#$%', expected: false, description: 'Special characters' },
  { input: '', expected: false, description: 'Empty string' },
  { input: '   ', expected: false, description: 'Whitespace only' },
];

console.log('🧪 Testing Greeting Detection (Bug #4 Fix)\n');
console.log('=' .repeat(80));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = isGreeting(testCase.input);
  const success = result === testCase.expected;

  if (success) {
    passed++;
    console.log(`✅ PASS: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}" → ${result} (expected: ${testCase.expected})`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${testCase.description}`);
    console.log(`   Input: "${testCase.input}" → ${result} (expected: ${testCase.expected})`);
  }
}

console.log('=' .repeat(80));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${testCases.length} total)`);

if (failed === 0) {
  console.log('✅ All tests passed! Bug #4 fix is working correctly.');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the greeting detection logic.');
  process.exit(1);
}
