/**
 * Morning Summary Feature - QA Test Suite
 *
 * Tests the complete morning summary notification system:
 * - User preferences management
 * - Summary generation with events and reminders
 * - Daily scheduling logic
 * - Message formatting
 */

import dotenv from 'dotenv';
import { pool } from '../config/database.js';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { UserService } from '../services/UserService.js';
import { SettingsService } from '../services/SettingsService.js';
import { EventService } from '../services/EventService.js';
import { MorningSummaryService } from '../services/MorningSummaryService.js';
import { DailySchedulerService } from '../services/DailySchedulerService.js';
import { DateTime } from 'luxon';

// Load environment variables
dotenv.config();

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function logResult(testName: string, passed: boolean, message: string, duration?: number) {
  results.push({ testName, passed, message, duration });
  const icon = passed ? '✅' : '❌';
  const durationStr = duration ? ` (${duration}ms)` : '';
  console.log(`${icon} ${testName}${durationStr}`);
  if (!passed) {
    console.log(`   ${message}`);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('Morning Summary Feature - QA Test Suite');
  console.log('========================================\n');

  const startTime = Date.now();

  // Initialize services
  const userService = new UserService();
  const settingsService = new SettingsService();
  const eventService = new EventService();
  const morningSummaryService = new MorningSummaryService();

  let testUserId: string | null = null;

  try {
    // ==================================================================
    // TEST 1: UserService - Get All Users
    // ==================================================================
    try {
      const testStart = Date.now();
      const users = await userService.getAllUsers();
      const duration = Date.now() - testStart;

      if (users.length >= 0) {
        logResult(
          'UserService.getAllUsers()',
          true,
          `Retrieved ${users.length} users`,
          duration
        );
        if (users.length > 0) {
          testUserId = users[0].id;
        }
      } else {
        logResult('UserService.getAllUsers()', false, 'Invalid result');
      }
    } catch (error) {
      logResult('UserService.getAllUsers()', false, `Error: ${error}`);
    }

    // ==================================================================
    // TEST 2: SettingsService - Get Morning Notification Preferences
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();
        const prefs = await settingsService.getMorningNotificationPrefs(testUserId);
        const duration = Date.now() - testStart;

        const hasAllFields =
          typeof prefs.enabled === 'boolean' &&
          typeof prefs.time === 'string' &&
          Array.isArray(prefs.days) &&
          typeof prefs.includeMemos === 'boolean';

        if (hasAllFields) {
          logResult(
            'SettingsService.getMorningNotificationPrefs()',
            true,
            `Default prefs: enabled=${prefs.enabled}, time=${prefs.time}`,
            duration
          );
        } else {
          logResult(
            'SettingsService.getMorningNotificationPrefs()',
            false,
            'Missing or invalid fields in preferences'
          );
        }
      } catch (error) {
        logResult(
          'SettingsService.getMorningNotificationPrefs()',
          false,
          `Error: ${error}`
        );
      }
    }

    // ==================================================================
    // TEST 3: SettingsService - Update Morning Notification Enabled
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();
        await settingsService.updateMorningNotificationEnabled(testUserId, true);
        const prefs = await settingsService.getMorningNotificationPrefs(testUserId);
        const duration = Date.now() - testStart;

        if (prefs.enabled === true) {
          logResult(
            'SettingsService.updateMorningNotificationEnabled(true)',
            true,
            'Successfully enabled morning notifications',
            duration
          );
        } else {
          logResult(
            'SettingsService.updateMorningNotificationEnabled(true)',
            false,
            `Expected enabled=true, got ${prefs.enabled}`
          );
        }
      } catch (error) {
        logResult(
          'SettingsService.updateMorningNotificationEnabled()',
          false,
          `Error: ${error}`
        );
      }
    }

    // ==================================================================
    // TEST 4: SettingsService - Update Morning Notification Time
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();
        const testTime = '07:30';
        await settingsService.updateMorningNotificationTime(testUserId, testTime);
        const prefs = await settingsService.getMorningNotificationPrefs(testUserId);
        const duration = Date.now() - testStart;

        if (prefs.time === testTime) {
          logResult(
            'SettingsService.updateMorningNotificationTime()',
            true,
            `Successfully set time to ${testTime}`,
            duration
          );
        } else {
          logResult(
            'SettingsService.updateMorningNotificationTime()',
            false,
            `Expected time=${testTime}, got ${prefs.time}`
          );
        }
      } catch (error) {
        logResult(
          'SettingsService.updateMorningNotificationTime()',
          false,
          `Error: ${error}`
        );
      }
    }

    // ==================================================================
    // TEST 5: SettingsService - Update Morning Notification Days
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();
        const testDays = [1, 2, 3, 4, 5]; // Weekdays
        await settingsService.updateMorningNotificationDays(testUserId, testDays);
        const prefs = await settingsService.getMorningNotificationPrefs(testUserId);
        const duration = Date.now() - testStart;

        const daysMatch = JSON.stringify(prefs.days.sort()) === JSON.stringify(testDays.sort());

        if (daysMatch) {
          logResult(
            'SettingsService.updateMorningNotificationDays()',
            true,
            `Successfully set days to weekdays`,
            duration
          );
        } else {
          logResult(
            'SettingsService.updateMorningNotificationDays()',
            false,
            `Expected days=${testDays}, got ${prefs.days}`
          );
        }
      } catch (error) {
        logResult(
          'SettingsService.updateMorningNotificationDays()',
          false,
          `Error: ${error}`
        );
      }
    }

    // ==================================================================
    // TEST 6: MorningSummaryService - Generate Summary (with events)
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();

        // Create a test event for today
        const tomorrow = DateTime.now().setZone('Asia/Jerusalem').plus({ days: 1 }).set({ hour: 14, minute: 0 });
        const testEvent = await eventService.createEvent({
          userId: testUserId,
          title: 'QA Test Event - Morning Summary',
          startTsUtc: tomorrow.toUTC().toJSDate(),
          endTsUtc: tomorrow.plus({ hours: 1 }).toUTC().toJSDate(),
          location: 'Test Location',
        });

        // Generate summary
        const summary = await morningSummaryService.generateSummaryForUser(
          testUserId,
          tomorrow.toJSDate()
        );
        const duration = Date.now() - testStart;

        const hasRequiredSections =
          summary.includes('בוקר טוב') &&
          summary.includes('אירועים') &&
          summary.includes('QA Test Event');

        if (hasRequiredSections) {
          logResult(
            'MorningSummaryService.generateSummaryForUser()',
            true,
            `Generated summary with ${summary.length} characters`,
            duration
          );
          console.log('\n--- Sample Summary Message ---');
          console.log(summary);
          console.log('------------------------------\n');
        } else {
          logResult(
            'MorningSummaryService.generateSummaryForUser()',
            false,
            'Summary missing required sections'
          );
        }

        // Cleanup test event
        await eventService.deleteEvent(testEvent.id, testUserId);
      } catch (error) {
        logResult(
          'MorningSummaryService.generateSummaryForUser()',
          false,
          `Error: ${error}`
        );
      }
    }

    // ==================================================================
    // TEST 7: UserService - Get Users With Morning Notifications
    // ==================================================================
    try {
      const testStart = Date.now();
      const users = await userService.getUsersWithMorningNotifications();
      const duration = Date.now() - testStart;

      if (users.length >= 0) {
        logResult(
          'UserService.getUsersWithMorningNotifications()',
          true,
          `Found ${users.length} users with morning notifications enabled`,
          duration
        );
      } else {
        logResult(
          'UserService.getUsersWithMorningNotifications()',
          false,
          'Invalid result'
        );
      }
    } catch (error) {
      logResult(
        'UserService.getUsersWithMorningNotifications()',
        false,
        `Error: ${error}`
      );
    }

    // ==================================================================
    // TEST 8: MorningSummaryService - Get Summary Stats
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();
        const stats = await morningSummaryService.getSummaryStats(testUserId);
        const duration = Date.now() - testStart;

        const hasAllStats =
          typeof stats.eventsToday === 'number' &&
          typeof stats.eventsThisWeek === 'number' &&
          typeof stats.remindersToday === 'number';

        if (hasAllStats) {
          logResult(
            'MorningSummaryService.getSummaryStats()',
            true,
            `Today: ${stats.eventsToday} events, ${stats.remindersToday} reminders`,
            duration
          );
        } else {
          logResult(
            'MorningSummaryService.getSummaryStats()',
            false,
            'Missing or invalid stats'
          );
        }
      } catch (error) {
        logResult(
          'MorningSummaryService.getSummaryStats()',
          false,
          `Error: ${error}`
        );
      }
    }

    // ==================================================================
    // TEST 9: Time Format Validation
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();
        let errorCaught = false;

        try {
          await settingsService.updateMorningNotificationTime(testUserId, '25:00'); // Invalid
        } catch (error) {
          errorCaught = true;
        }

        const duration = Date.now() - testStart;

        if (errorCaught) {
          logResult(
            'SettingsService - Time Format Validation',
            true,
            'Correctly rejected invalid time format',
            duration
          );
        } else {
          logResult(
            'SettingsService - Time Format Validation',
            false,
            'Did not reject invalid time format'
          );
        }
      } catch (error) {
        logResult(
          'SettingsService - Time Format Validation',
          false,
          `Unexpected error: ${error}`
        );
      }
    }

    // ==================================================================
    // TEST 10: Days Validation
    // ==================================================================
    if (testUserId) {
      try {
        const testStart = Date.now();
        let errorCaught = false;

        try {
          await settingsService.updateMorningNotificationDays(testUserId, [8, 9]); // Invalid
        } catch (error) {
          errorCaught = true;
        }

        const duration = Date.now() - testStart;

        if (errorCaught) {
          logResult(
            'SettingsService - Days Validation',
            true,
            'Correctly rejected invalid day numbers',
            duration
          );
        } else {
          logResult(
            'SettingsService - Days Validation',
            false,
            'Did not reject invalid day numbers'
          );
        }
      } catch (error) {
        logResult(
          'SettingsService - Days Validation',
          false,
          `Unexpected error: ${error}`
        );
      }
    }

    // ==================================================================
    // CLEANUP: Disable morning notifications for test user
    // ==================================================================
    if (testUserId) {
      try {
        await settingsService.updateMorningNotificationEnabled(testUserId, false);
        console.log('\n✅ Cleanup: Disabled morning notifications for test user\n');
      } catch (error) {
        console.log(`\n⚠️  Cleanup failed: ${error}\n`);
      }
    }

  } catch (error) {
    console.error('Fatal error during tests:', error);
  } finally {
    // Close connections
    await pool.end();
    await redis.quit();
  }

  // ==================================================================
  // SUMMARY
  // ==================================================================
  const totalTime = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => r.passed === false).length;
  const total = results.length;

  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${totalTime}ms`);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.testName}: ${r.message}`);
      });
    console.log('');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
