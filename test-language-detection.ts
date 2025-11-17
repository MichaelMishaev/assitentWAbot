/**
 * Test script for Bug #4 Enhanced Fix: Language Detection & Multilingual Onboarding
 *
 * Tests the language detection and routing logic for unknown user messages
 */

import { detectLanguage, getLanguageName } from './src/utils/languageDetection.js';
import { isGreeting } from './src/utils/greetingDetection.js';

interface TestCase {
  input: string;
  expectedLanguage: string;
  expectedIsGreeting: boolean;
  expectedAction: string;
}

const testCases: TestCase[] = [
  // ===== GREETINGS (Should start registration) =====
  {
    input: 'היי',
    expectedLanguage: 'hebrew',
    expectedIsGreeting: true,
    expectedAction: '→ Start Registration',
  },
  {
    input: 'שלום',
    expectedLanguage: 'hebrew',
    expectedIsGreeting: true,
    expectedAction: '→ Start Registration',
  },
  {
    input: 'hello',
    expectedLanguage: 'english',
    expectedIsGreeting: true,
    expectedAction: '→ Start Registration',
  },
  {
    input: 'مرحبا',
    expectedLanguage: 'arabic',
    expectedIsGreeting: false, // Not in our greeting patterns
    expectedAction: '→ GPT-4o-mini response (Arabic)',
  },

  // ===== NON-HEBREW TEXT (Should trigger GPT-4o-mini) =====
  {
    input: 'I want to use this bot',
    expectedLanguage: 'english',
    expectedIsGreeting: false,
    expectedAction: '→ GPT-4o-mini response (English)',
  },
  {
    input: 'كيف استخدم هذا البوت؟',
    expectedLanguage: 'arabic',
    expectedIsGreeting: false,
    expectedAction: '→ GPT-4o-mini response (Arabic)',
  },
  {
    input: 'привет как дела',
    expectedLanguage: 'other',
    expectedIsGreeting: false,
    expectedAction: '→ GPT-4o-mini response (Other language)',
  },

  // ===== HEBREW NON-GREETINGS (Should be ignored) =====
  {
    input: 'תזכיר לי מחר',
    expectedLanguage: 'hebrew',
    expectedIsGreeting: false,
    expectedAction: '→ Ignore (Hebrew non-greeting)',
  },
  {
    input: 'צור אירוע',
    expectedLanguage: 'hebrew',
    expectedIsGreeting: false,
    expectedAction: '→ Ignore (Hebrew non-greeting)',
  },

  // ===== GIBBERISH/EMOJI (Should be ignored completely) =====
  {
    input: '👍',
    expectedLanguage: 'gibberish',
    expectedIsGreeting: false,
    expectedAction: '→ Ignore (Gibberish)',
  },
  {
    input: 'ططط',
    expectedLanguage: 'arabic',
    expectedIsGreeting: false,
    expectedAction: '→ GPT-4o-mini response (Arabic)', // Contains Arabic chars, so treat as Arabic (better UX)
  },
  {
    input: '😊😊😊',
    expectedLanguage: 'gibberish',
    expectedIsGreeting: false,
    expectedAction: '→ Ignore (Gibberish)',
  },
  {
    input: '123456',
    expectedLanguage: 'gibberish',
    expectedIsGreeting: false,
    expectedAction: '→ Ignore (Gibberish)',
  },
  {
    input: '!@#$%^&',
    expectedLanguage: 'gibberish',
    expectedIsGreeting: false,
    expectedAction: '→ Ignore (Gibberish)',
  },
];

console.log('🧪 Testing Language Detection & Routing (Bug #4 Enhanced Fix)\n');
console.log('='.repeat(100));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const detectedLanguage = detectLanguage(testCase.input);
  const languageName = getLanguageName(detectedLanguage);
  const isGreetingResult = isGreeting(testCase.input);

  // Determine expected action based on logic
  let actualAction: string;
  if (isGreetingResult) {
    actualAction = '→ Start Registration';
  } else if (detectedLanguage === 'hebrew') {
    actualAction = '→ Ignore (Hebrew non-greeting)';
  } else if (detectedLanguage !== 'gibberish') {
    actualAction = `→ GPT-4o-mini response (${languageName})`;
  } else {
    actualAction = '→ Ignore (Gibberish)';
  }

  const languageMatch = detectedLanguage === testCase.expectedLanguage;
  const greetingMatch = isGreetingResult === testCase.expectedIsGreeting;
  const actionMatch = actualAction === testCase.expectedAction;
  const success = languageMatch && greetingMatch && actionMatch;

  if (success) {
    passed++;
    console.log(`✅ PASS: "${testCase.input}"`);
    console.log(`   Language: ${languageName} | Greeting: ${isGreetingResult} | ${actualAction}`);
  } else {
    failed++;
    console.log(`❌ FAIL: "${testCase.input}"`);
    console.log(`   Expected: ${testCase.expectedLanguage} | ${testCase.expectedIsGreeting} | ${testCase.expectedAction}`);
    console.log(`   Got:      ${detectedLanguage} | ${isGreetingResult} | ${actualAction}`);
  }
  console.log('');
}

console.log('='.repeat(100));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${testCases.length} total)`);

// Summary of routing logic
console.log('\n📋 Routing Summary:');
console.log('┌─────────────────────────┬────────────────────────────────────────┐');
console.log('│ Message Type            │ Action                                 │');
console.log('├─────────────────────────┼────────────────────────────────────────┤');
console.log('│ Greeting (any language) │ ✅ Start Registration                  │');
console.log('│ Non-Hebrew text         │ 🤖 GPT-4o-mini multilingual response   │');
console.log('│ Hebrew non-greeting     │ ⚠️  Ignore silently                    │');
console.log('│ Gibberish/Emoji         │ ⚠️  Ignore silently                    │');
console.log('└─────────────────────────┴────────────────────────────────────────┘');

if (failed === 0) {
  console.log('\n✅ All tests passed! Enhanced Bug #4 fix is working correctly.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Please review the logic.');
  process.exit(1);
}
