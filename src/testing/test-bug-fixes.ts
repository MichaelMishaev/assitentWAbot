#!/usr/bin/env ts-node
/**
 * Test Suite: Validating Bug Fixes from Production
 *
 * This tests all the recent bug fixes to ensure they work correctly.
 */

import { MessageSimulator, TestRunner, TestCase } from './MessageSimulator.js';
import logger from '../utils/logger.js';

async function main() {
  logger.info('🧪 Starting Bug Fix Validation Tests');

  const simulator = new MessageSimulator();
  await simulator.initialize();

  const runner = new TestRunner(simulator);

  const tests: TestCase[] = [
    // =================================================================
    // Bug #13: Time Recognition in Event Creation
    // =================================================================
    {
      name: 'Bug #13: Time should be recognized in "תקבע לי אירוע של ריקודים לתאריך 1.11 בשעה 13:00"',
      steps: [
        {
          userMessage: 'תקבע לי אירוע של ריקודים לתאריך 1.11 בשעה 13:00',
          // Should NOT ask for time, should create event directly
          expectedResponse: /ריקודים.*13:00|אירוע נוסף/,
          validate: async (response, sim) => {
            // Should not contain "באיזו שעה"
            return !response.includes('באיזו שעה');
          }
        }
      ]
    },

    // =================================================================
    // Bug #14: Search with Hebrew Tokenization
    // =================================================================
    {
      name: 'Bug #14: Search should find "חוג בישול לרום ולאמה" when searching "חוג בישול"',
      steps: [
        {
          userMessage: 'תקבע אירוע חוג בישול לרום ולאמה ב 15.10 בשעה 18:00',
          expectedResponse: /חוג בישול/
        },
        {
          userMessage: 'מתי חוג בישול',
          expectedResponse: /חוג בישול לרום ולאמה/,
          validate: async (response, sim) => {
            // Should NOT say "לא נמצאו אירועים"
            return !response.includes('לא נמצאו אירועים');
          }
        }
      ]
    },

    {
      name: 'Bug #14: Search should find event by partial name "ריקודים"',
      steps: [
        {
          userMessage: 'תקבע אירוע ריקודים ב 1.11 בשעה 13:00',
          expectedResponse: /ריקודים/
        },
        {
          userMessage: 'מתי יש לי ריקודים',
          expectedResponse: /ריקודים/,
          validate: async (response) => !response.includes('לא נמצאו אירועים')
        }
      ]
    },

    // =================================================================
    // Feature #12: Reminder Lead Time Settings
    // =================================================================
    {
      name: 'Feature #12: Settings menu should have 5 options including reminder time',
      steps: [
        {
          userMessage: 'תפריט',
          expectedResponse: '5) הגדרות'
        },
        {
          userMessage: '5',
          expectedResponse: /זמן תזכורת/,
          validate: async (response) => {
            // Should have 4 options: language, timezone, menu display, reminder time
            return response.includes('1️⃣') &&
                   response.includes('2️⃣') &&
                   response.includes('3️⃣') &&
                   response.includes('4️⃣');
          }
        }
      ]
    },

    {
      name: 'Feature #12: Reminder time setting should work',
      steps: [
        {
          userMessage: 'תפריט',
          expectedResponse: '5)'
        },
        {
          userMessage: '5',
          expectedState: 'SETTINGS_MENU'
        },
        {
          userMessage: '4', // Select reminder time
          expectedResponse: /זמן תזכורת.*דקות לפני/,
          expectedState: 'SETTINGS_REMINDER_TIME'
        },
        {
          userMessage: '5', // Select 60 minutes
          expectedResponse: /שעה לפני/,
          validate: async (response) => response.includes('זמן תזכורת שונה')
        }
      ]
    },

    // =================================================================
    // Bug #8: Reminder Detection (Already Fixed)
    // =================================================================
    {
      name: 'Bug #8: Reminder should be detected with explicit keyword',
      steps: [
        {
          userMessage: 'תזכיר לי להתקשר לשירות לקוחות של המקפיא מחר ב14:00',
          expectedResponse: /תזכורת|להתקשר לשירות/,
          validate: async (response) => !response.includes('לא הבנתי')
        }
      ]
    },

    // =================================================================
    // Multi-Line Event Creation (Bug #3)
    // =================================================================
    {
      name: 'Bug #3: Multi-line event with separate date and time',
      steps: [
        {
          userMessage: 'פגישה עם מיכאל\n20.10\n16:00\nקפה קפה',
          expectedResponse: /פגישה.*מיכאל/,
          validate: async (response, sim) => {
            // Should detect time 16:00
            const events = await sim.getAllEvents();
            const event = events.find(e => e.title.includes('פגישה'));
            if (!event) return false;

            // Check if time is 16:00
            const eventTime = new Date(event.startTsUtc);
            return eventTime.getHours() === 16 && eventTime.getMinutes() === 0;
          }
        }
      ]
    },

    // =================================================================
    // Edge Cases
    // =================================================================
    {
      name: 'Edge Case: Event with location should preserve location',
      steps: [
        {
          userMessage: 'פגישה מחר ב3 במשרד',
          expectedResponse: /פגישה/,
          validate: async (response, sim) => {
            const events = await sim.getAllEvents();
            const event = events.find(e => e.title.includes('פגישה'));
            return event?.location?.includes('משרד') ?? false;
          }
        }
      ]
    },

    {
      name: 'Edge Case: Default time for reminders (12:00)',
      steps: [
        {
          userMessage: 'תזכיר לי לקנות חלב מחר',
          expectedResponse: /תזכורת/,
          validate: async (response) => {
            // Should use default time 12:00
            return response.includes('12:00') || response.includes('12:30');
          }
        }
      ]
    }
  ];

  // Run all tests
  await runner.runTests(tests);

  // Cleanup
  await simulator.cleanup();

  logger.info('✅ All tests completed!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Test suite failed:', { error });
    process.exit(1);
  });
}

export { main as runBugFixTests };
