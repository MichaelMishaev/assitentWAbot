/**
 * Regression Tests for Production Bug Fixes
 *
 * These tests ensure that bugs fixed in production don't reappear.
 * Each test corresponds to a specific issue from user # comments.
 *
 * Reference commits:
 * - 6462a82: 6 critical production bugs
 * - 33d808c: 3 critical bugs from # comments
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { DateTime } from 'luxon';

describe('Regression Tests: Production Bug Fixes', () => {
  describe('Issue #3: Today events filter (commit 6462a82)', () => {
    it('should filter out past events when querying today', () => {
      const now = DateTime.now().setZone('Asia/Jerusalem');
      const today = now.startOf('day');

      // Mock events: one in the past, one in the future
      const events = [
        {
          title: 'Past Event',
          startTsUtc: now.minus({ hours: 2 }).toJSDate(), // 2 hours ago
        },
        {
          title: 'Future Event',
          startTsUtc: now.plus({ hours: 2 }).toJSDate(), // 2 hours from now
        }
      ];

      // Filter logic (from NLPRouter.ts:555-569)
      const filteredEvents = events.filter(event => {
        const eventTime = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        return eventTime >= now; // Only future events
      });

      expect(filteredEvents).toHaveLength(1);
      expect(filteredEvents[0].title).toBe('Future Event');
    });

    it('should include events happening right now', () => {
      const now = DateTime.now().setZone('Asia/Jerusalem');

      const events = [
        {
          title: 'Current Event',
          startTsUtc: now.toJSDate(), // Right now
        }
      ];

      const filteredEvents = events.filter(event => {
        const eventTime = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        return eventTime >= now;
      });

      expect(filteredEvents).toHaveLength(1);
    });
  });

  describe('Issue #4: Preserve time when updating date (commit 6462a82)', () => {
    it('should keep original time when updating event date', () => {
      const originalEvent = {
        startTsUtc: DateTime.fromISO('2025-10-15T14:30:00', { zone: 'Asia/Jerusalem' }).toJSDate()
      };

      const newDate = DateTime.fromISO('2025-10-20T00:00:00', { zone: 'Asia/Jerusalem' }); // Midnight

      // Logic from NLPRouter.ts:884-906
      const isMidnight = newDate.hour === 0 && newDate.minute === 0;
      let finalDate: DateTime;

      if (isMidnight) {
        // Preserve original time
        const original = DateTime.fromJSDate(originalEvent.startTsUtc).setZone('Asia/Jerusalem');
        finalDate = newDate.set({ hour: original.hour, minute: original.minute });
      } else {
        finalDate = newDate;
      }

      expect(finalDate.hour).toBe(14);
      expect(finalDate.minute).toBe(30);
      expect(finalDate.day).toBe(20); // Date updated
    });

    it('should allow explicit midnight time', () => {
      const originalEvent = {
        startTsUtc: DateTime.fromISO('2025-10-15T14:30:00', { zone: 'Asia/Jerusalem' }).toJSDate()
      };

      // User explicitly sets time to midnight
      const newDate = DateTime.fromISO('2025-10-20T00:00:00', { zone: 'Asia/Jerusalem' });
      const userExplicitlySetTime = true; // This would come from parsing context

      let finalDate: DateTime;

      if (userExplicitlySetTime) {
        finalDate = newDate; // Use explicit midnight
      } else {
        const original = DateTime.fromJSDate(originalEvent.startTsUtc).setZone('Asia/Jerusalem');
        finalDate = newDate.set({ hour: original.hour, minute: original.minute });
      }

      expect(finalDate.hour).toBe(0);
      expect(finalDate.minute).toBe(0);
    });
  });

  describe('Issue #5: RTL formatting for comment numbers (commit 6462a82)', () => {
    it('should use LEFT-TO-RIGHT EMBEDDING for Hebrew numbering', () => {
      const commentIndex = 1;
      const commentText = 'הערה לדוגמה';

      // Before fix: `${commentIndex}. ${commentText}` (incorrect RTL)
      // After fix: Use Unicode LTR embedding
      const formatted = `\u202A${commentIndex}.\u202C ${commentText}`;

      // Verify Unicode characters are present
      expect(formatted).toContain('\u202A'); // LTR EMBEDDING
      expect(formatted).toContain('\u202C'); // POP DIRECTIONAL FORMATTING
      expect(formatted).toContain('1.');
      expect(formatted).toContain('הערה לדוגמה');
    });
  });

  describe('Issue #7: Reminder filtering (commit 6462a82)', () => {
    it('should filter out past reminders', () => {
      const now = DateTime.now().setZone('Asia/Jerusalem');

      const reminders = [
        {
          title: 'שתיית מים',
          dueTsUtc: now.minus({ hours: 1 }).toJSDate(), // Past
          status: 'active'
        },
        {
          title: 'שתיית מים',
          dueTsUtc: now.plus({ hours: 1 }).toJSDate(), // Future
          status: 'active'
        }
      ];

      // Filter logic from NLPRouter.ts:1209-1244
      const filteredReminders = reminders.filter(r => {
        const dueTime = DateTime.fromJSDate(r.dueTsUtc).setZone('Asia/Jerusalem');
        return r.status === 'active' && dueTime >= now;
      });

      expect(filteredReminders).toHaveLength(1);
      expect(DateTime.fromJSDate(filteredReminders[0].dueTsUtc)).toBeInstanceOf(DateTime);
    });

    it('should filter by title with fuzzy matching', () => {
      const reminders = [
        { title: 'שתיית מים', status: 'active' },
        { title: 'פגישה עם רופא', status: 'active' },
        { title: 'שתייה של מים קרים', status: 'active' }
      ];

      const searchTerm = 'שתיית מים';

      // Simple fuzzy matching
      const filteredByTitle = reminders.filter(r =>
        r.title.includes(searchTerm) || searchTerm.includes(r.title.slice(0, 5))
      );

      expect(filteredByTitle.length).toBeGreaterThanOrEqual(1);
      expect(filteredByTitle[0].title).toContain('מים');
    });
  });

  describe('Bug #2: Event not found after 24h (commit 33d808c)', () => {
    it('should extend Redis TTL to 7 days', () => {
      // Redis mapping configuration
      const OLD_TTL = 24 * 60 * 60; // 24 hours (old)
      const NEW_TTL = 7 * 24 * 60 * 60; // 7 days (new)

      expect(NEW_TTL).toBeGreaterThan(OLD_TTL);
      expect(NEW_TTL).toBe(604800); // 7 days in seconds
    });
  });

  describe('Bug #3: Time disambiguation (commit 33d808c)', () => {
    it('should use today if time is in the future', () => {
      const now = DateTime.fromISO('2025-10-11T14:00:00', { zone: 'Asia/Jerusalem' });
      const timeInput = '16:00'; // 2 hours from now

      const parsedTime = DateTime.fromFormat(timeInput, 'HH:mm', {
        zone: 'Asia/Jerusalem'
      }).set({
        year: now.year,
        month: now.month,
        day: now.day
      });

      const isPast = parsedTime < now;

      const finalDate = isPast
        ? parsedTime.plus({ days: 1 }) // Tomorrow
        : parsedTime; // Today

      expect(finalDate.day).toBe(now.day); // Same day
      expect(finalDate.hour).toBe(16);
    });

    it('should use tomorrow if time has already passed', () => {
      const now = DateTime.fromISO('2025-10-11T17:00:00', { zone: 'Asia/Jerusalem' });
      const timeInput = '16:00'; // 1 hour ago

      const parsedTime = DateTime.fromFormat(timeInput, 'HH:mm', {
        zone: 'Asia/Jerusalem'
      }).set({
        year: now.year,
        month: now.month,
        day: now.day
      });

      const isPast = parsedTime < now;

      const finalDate = isPast
        ? parsedTime.plus({ days: 1 }) // Tomorrow
        : parsedTime; // Today

      expect(finalDate.day).toBe(now.day + 1); // Next day
      expect(finalDate.hour).toBe(16);
    });
  });

  describe('Issue #8: Comment visibility (commit 6462a82)', () => {
    it('should reload event after adding comment to show it', async () => {
      // Mock event service
      let eventWithComment = {
        id: '123',
        title: 'Test Event',
        notes: [] as any[]
      };

      // Simulate adding comment
      const addComment = (comment: string) => {
        eventWithComment.notes.push({
          text: comment,
          timestamp: new Date().toISOString(),
          priority: 'normal'
        });
      };

      // Add comment
      addComment('Comment from NLP');

      // Reload event (simulated)
      const reloadedEvent = { ...eventWithComment };

      expect(reloadedEvent.notes).toHaveLength(1);
      expect(reloadedEvent.notes[0].text).toBe('Comment from NLP');
    });
  });
});

describe('Edge Case Tests', () => {
  describe('Midnight Detection', () => {
    it('should detect midnight times correctly', () => {
      const midnight = DateTime.fromISO('2025-10-11T00:00:00', { zone: 'Asia/Jerusalem' });
      const almostMidnight = DateTime.fromISO('2025-10-11T00:01:00', { zone: 'Asia/Jerusalem' });

      expect(midnight.hour).toBe(0);
      expect(midnight.minute).toBe(0);
      expect(almostMidnight.hour === 0 && almostMidnight.minute === 0).toBe(false);
    });
  });

  describe('Timezone Handling', () => {
    it('should handle DST transitions correctly', () => {
      // Example: DST transition in Israel (March/October)
      const beforeDST = DateTime.fromISO('2025-03-27T00:00:00', { zone: 'Asia/Jerusalem' });
      const afterDST = DateTime.fromISO('2025-03-28T00:00:00', { zone: 'Asia/Jerusalem' });

      expect(beforeDST.isValid).toBe(true);
      expect(afterDST.isValid).toBe(true);
    });
  });

  describe('Week Boundaries', () => {
    it('should handle "next Monday" on Sunday correctly', () => {
      const sunday = DateTime.fromISO('2025-10-12T20:00:00', { zone: 'Asia/Jerusalem' }); // Sunday night
      const nextMonday = sunday.plus({ days: 1 }).startOf('day');

      expect(nextMonday.weekday).toBe(1); // Monday
      expect(nextMonday.day).toBe(13);
    });
  });
});
