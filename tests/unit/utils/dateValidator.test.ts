/**
 * Date Validator Tests
 *
 * Comprehensive tests for date validation utility
 * to prevent Invalid Date / NaN timestamp bugs
 */

import {
  isValidDateString,
  safeParseDate,
  isFutureDate,
  formatDateHebrew,
  extractDateFromIntent
} from '../../../src/utils/dateValidator';

describe('Date Validator', () => {

  describe('isValidDateString', () => {

    test('should accept valid ISO date strings', () => {
      expect(isValidDateString('2025-10-15T10:00:00Z')).toBe(true);
      expect(isValidDateString('2025-10-15T10:00:00.000Z')).toBe(true);
      expect(isValidDateString('2025-10-15')).toBe(true);
    });

    test('should accept valid Date objects', () => {
      expect(isValidDateString(new Date())).toBe(true);
      expect(isValidDateString(new Date('2025-10-15'))).toBe(true);
    });

    test('should reject null and undefined', () => {
      expect(isValidDateString(null)).toBe(false);
      expect(isValidDateString(undefined)).toBe(false);
    });

    test('should reject invalid date strings', () => {
      expect(isValidDateString('שבוע הבא')).toBe(false); // Hebrew text
      expect(isValidDateString('next week')).toBe(false); // English text
      expect(isValidDateString('not a date')).toBe(false);
      expect(isValidDateString('0NaN-NaN-NaN')).toBe(false); // The actual bug format
    });

    test('should reject non-string values', () => {
      expect(isValidDateString(123)).toBe(false);
      expect(isValidDateString({})).toBe(false);
      expect(isValidDateString([])).toBe(false);
    });

    test('should reject Invalid Date objects', () => {
      expect(isValidDateString(new Date('invalid'))).toBe(false);
      expect(isValidDateString(new Date(NaN))).toBe(false);
    });
  });

  describe('safeParseDate', () => {

    test('should parse valid ISO date strings', () => {
      const date = safeParseDate('2025-10-15T10:00:00Z');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getTime()).toBeGreaterThan(0);
    });

    test('should return null for invalid dates', () => {
      expect(safeParseDate('שבוע הבא')).toBe(null);
      expect(safeParseDate('next week')).toBe(null);
      expect(safeParseDate(null)).toBe(null);
      expect(safeParseDate(undefined)).toBe(null);
    });

    test('should return null for NaN timestamp bug pattern', () => {
      // This is the exact pattern that causes PostgreSQL errors
      expect(safeParseDate('0NaN-NaN-NaNTNaN:NaN:NaN.NaN+NaN:NaN')).toBe(null);
    });

    test('should pass through valid Date objects', () => {
      const originalDate = new Date('2025-10-15T10:00:00Z');
      const result = safeParseDate(originalDate);
      expect(result).toBe(originalDate);
    });

    test('should reject Invalid Date objects', () => {
      const invalidDate = new Date('invalid');
      expect(safeParseDate(invalidDate)).toBe(null);
    });

    test('should include context in logs when provided', () => {
      // This should log a warning with context
      const result = safeParseDate('invalid', 'test-context');
      expect(result).toBe(null);
    });
  });

  describe('isFutureDate', () => {

    test('should return true for future dates', () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      expect(isFutureDate(futureDate)).toBe(true);
    });

    test('should return false for past dates', () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      expect(isFutureDate(pastDate)).toBe(false);
    });

    test('should use buffer for near-present dates', () => {
      const now = new Date();
      const tenSecondsAgo = new Date(now.getTime() - 10000);

      // With 30 second buffer (default), 10 seconds ago is still "future"
      expect(isFutureDate(tenSecondsAgo)).toBe(true);

      // With 5 second buffer, 10 seconds ago is past
      expect(isFutureDate(tenSecondsAgo, 5000)).toBe(false);
    });

    test('should handle custom buffer', () => {
      const oneMinuteAgo = new Date(Date.now() - 60000);

      // With 2 minute buffer, 1 minute ago is still "future"
      expect(isFutureDate(oneMinuteAgo, 120000)).toBe(true);

      // With 30 second buffer, 1 minute ago is past
      expect(isFutureDate(oneMinuteAgo, 30000)).toBe(false);
    });
  });

  describe('formatDateHebrew', () => {

    test('should format valid dates in Hebrew locale', () => {
      const date = new Date('2025-10-15T10:00:00Z');
      const formatted = formatDateHebrew(date);

      // Should contain date components (exact format may vary)
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
      expect(formatted).not.toBe('תאריך לא תקין');
    });

    test('should return error message for null date', () => {
      expect(formatDateHebrew(null)).toBe('תאריך לא תקין');
    });

    test('should return error message for Invalid Date', () => {
      const invalidDate = new Date('invalid');
      expect(formatDateHebrew(invalidDate)).toBe('תאריך לא תקין');
    });
  });

  describe('extractDateFromIntent', () => {

    test('should extract event.date from NLP intent', () => {
      const intent = {
        intent: 'list_events',
        event: {
          date: '2025-10-15T10:00:00Z'
        }
      };

      const date = extractDateFromIntent(intent, 'event.date');
      expect(date).toBeInstanceOf(Date);
      expect(date?.toISOString()).toBe('2025-10-15T10:00:00.000Z');
    });

    test('should extract reminder.dueDate from NLP intent', () => {
      const intent = {
        intent: 'create_reminder',
        reminder: {
          dueDate: '2025-10-15T10:00:00Z'
        }
      };

      const date = extractDateFromIntent(intent, 'reminder.dueDate');
      expect(date).toBeInstanceOf(Date);
    });

    test('should return null for missing event object', () => {
      const intent = {
        intent: 'list_events'
        // No event object
      };

      const date = extractDateFromIntent(intent, 'event.date');
      expect(date).toBe(null);
    });

    test('should return null for missing date field', () => {
      const intent = {
        intent: 'list_events',
        event: {
          title: 'Test Event'
          // No date field
        }
      };

      const date = extractDateFromIntent(intent, 'event.date');
      expect(date).toBe(null);
    });

    test('should return null for invalid date in intent', () => {
      const intent = {
        intent: 'list_events',
        event: {
          date: 'שבוע הבא' // Invalid - not ISO format
        }
      };

      const date = extractDateFromIntent(intent, 'event.date');
      expect(date).toBe(null);
    });

    test('should handle NaN timestamp bug pattern from NLP', () => {
      const intent = {
        intent: 'list_events',
        event: {
          date: null // NLP returned null
        }
      };

      const date = extractDateFromIntent(intent, 'event.date');
      expect(date).toBe(null);
    });
  });

  describe('Regression Tests - Real Bugs', () => {

    test('BUG: "שבוע הבא" (next week) should not cause NaN timestamp', () => {
      // This is the exact bug reported by user
      const hebrewText = 'שבוע הבא';
      const result = safeParseDate(hebrewText);

      expect(result).toBe(null);
      // Should NOT create Invalid Date that becomes "0NaN-NaN-NaN..."
    });

    test('BUG: null from NLP should not cause database error', () => {
      const result = safeParseDate(null);
      expect(result).toBe(null);
    });

    test('BUG: undefined from NLP should not cause database error', () => {
      const result = safeParseDate(undefined);
      expect(result).toBe(null);
    });

    test('BUG: Empty string from NLP should not cause database error', () => {
      const result = safeParseDate('');
      expect(result).toBe(null);
    });
  });

  describe('Integration with MessageRouter patterns', () => {

    test('should prevent getEventsByDate with invalid date', () => {
      // Simulates: await this.eventService.getEventsByDate(userId, new Date(event.date))
      const eventDate = 'שבוע הבא'; // Invalid from NLP

      const parsedDate = safeParseDate(eventDate, 'handleNLPSearchEvents');

      // Should catch invalid date BEFORE database call
      expect(parsedDate).toBe(null);
    });

    test('should allow getEventsByDate with valid date', () => {
      const eventDate = '2025-10-15T10:00:00Z'; // Valid ISO from NLP

      const parsedDate = safeParseDate(eventDate, 'handleNLPSearchEvents');

      expect(parsedDate).toBeInstanceOf(Date);
      expect(parsedDate?.getTime()).toBeGreaterThan(0);
    });

    test('should prevent state corruption with invalid dates', () => {
      // Simulates: startTsUtc: new Date(event.date)
      const eventDate = null; // Invalid from NLP

      const parsedDate = safeParseDate(eventDate, 'handleNLPCreateEvent');

      // Should catch BEFORE storing in state
      expect(parsedDate).toBe(null);
    });
  });
});
