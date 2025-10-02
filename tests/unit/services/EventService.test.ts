import { EventService } from '../../../src/services/EventService';
import {
  TestDatabase,
  setupTestEnvironment,
  teardownTestEnvironment,
  generateTestPhone,
} from '../../helpers/testHelpers';
import { testEvents, edgeCases } from '../../fixtures/testData';

describe('EventService', () => {
  let env: { db: TestDatabase; redis: any };
  let eventService: EventService;
  let testUserId: string;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    eventService = new EventService(env.db.getPool());
  });

  afterAll(async () => {
    await teardownTestEnvironment(env);
  });

  beforeEach(async () => {
    await env.db.clean();
    const user = await env.db.createTestUser({
      phone: generateTestPhone(),
      name: 'Test User',
    });
    testUserId = user.id;
  });

  describe('createEvent', () => {
    it('should create event with valid data', async () => {
      const event = await eventService.createEvent({
        userId: testUserId,
        ...testEvents.simpleMeeting,
      });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.userId).toBe(testUserId);
      expect(event.title).toBe(testEvents.simpleMeeting.title);
      expect(event.location).toBe(testEvents.simpleMeeting.location);
    });

    it('should create event without optional fields', async () => {
      const event = await eventService.createEvent({
        userId: testUserId,
        title: 'Simple Event',
        startTsUtc: new Date(),
      });

      expect(event).toBeDefined();
      expect(event.location).toBeNull();
      expect(event.endTsUtc).toBeNull();
      expect(event.rrule).toBeNull();
    });

    it('should create recurring event with RRULE', async () => {
      const event = await eventService.createEvent({
        userId: testUserId,
        ...testEvents.recurringMeeting,
      });

      expect(event.rrule).toBe(testEvents.recurringMeeting.rrule);
    });

    it('should handle emojis in title', async () => {
      const event = await eventService.createEvent({
        userId: testUserId,
        ...testEvents.withEmoji,
      });

      expect(event.title).toBe(testEvents.withEmoji.title);
      expect(event.title).toContain('🎉');
      expect(event.title).toContain('🎂');
    });

    it('should handle SQL injection attempt safely', async () => {
      const event = await eventService.createEvent({
        userId: testUserId,
        ...testEvents.sqlInjection,
      });

      expect(event.title).toBe(testEvents.sqlInjection.title);

      // Verify database wasn't compromised
      const events = await eventService.getAllEvents(testUserId);
      expect(events).toHaveLength(1);
    });

    it('should reject event with missing userId', async () => {
      await expect(
        eventService.createEvent({
          userId: '',
          title: 'Test',
          startTsUtc: new Date(),
        })
      ).rejects.toThrow();
    });

    it('should reject event with missing title', async () => {
      await expect(
        eventService.createEvent({
          userId: testUserId,
          title: '',
          startTsUtc: new Date(),
        })
      ).rejects.toThrow();
    });

    it('should handle very long titles', async () => {
      const longTitle = 'א'.repeat(200);
      const event = await eventService.createEvent({
        userId: testUserId,
        title: longTitle,
        startTsUtc: new Date(),
      });

      expect(event.title).toBe(longTitle);
    });
  });

  describe('getEvents', () => {
    beforeEach(async () => {
      // Create multiple events
      await env.db.createTestEvent(testUserId, {
        title: 'Event 1',
        startTsUtc: new Date('2025-01-15T10:00:00Z'),
      });
      await env.db.createTestEvent(testUserId, {
        title: 'Event 2',
        startTsUtc: new Date('2025-01-16T14:00:00Z'),
      });
      await env.db.createTestEvent(testUserId, {
        title: 'Event 3',
        startTsUtc: new Date('2025-01-17T09:00:00Z'),
      });
    });

    it('should return all events for user', async () => {
      const events = await eventService.getAllEvents(testUserId);
      expect(events).toHaveLength(3);
    });

    it('should return events in chronological order', async () => {
      const events = await eventService.getAllEvents(testUserId);

      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i].startTsUtc.getTime()).toBeLessThanOrEqual(
          events[i + 1].startTsUtc.getTime()
        );
      }
    });

    it('should not return other users events', async () => {
      const otherUser = await env.db.createTestUser({
        phone: generateTestPhone(),
        name: 'Other User',
      });

      await env.db.createTestEvent(otherUser.id, {
        title: 'Other Event',
        startTsUtc: new Date(),
      });

      const events = await eventService.getAllEvents(testUserId);
      expect(events).toHaveLength(3);
      expect(events.every((e: any) => e.userId === testUserId)).toBe(true);
    });

    it('should return empty array for user with no events', async () => {
      const newUser = await env.db.createTestUser({
        phone: generateTestPhone(),
        name: 'New User',
      });

      const events = await eventService.getAllEvents(newUser.id);
      expect(events).toEqual([]);
    });

    it('should apply limit parameter', async () => {
      const events = await eventService.getAllEvents(testUserId, 2);
      expect(events).toHaveLength(2);
    });
  });

  describe('getEventsByDate', () => {
    beforeEach(async () => {
      await env.db.createTestEvent(testUserId, {
        title: 'Today Event',
        startTsUtc: new Date('2025-01-15T10:00:00Z'),
      });
      await env.db.createTestEvent(testUserId, {
        title: 'Tomorrow Event',
        startTsUtc: new Date('2025-01-16T14:00:00Z'),
      });
    });

    it('should filter events by specific date', async () => {
      const events = await eventService.getEventsByDate(
        testUserId,
        new Date('2025-01-15')
      );

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Today Event');
    });

    it('should return empty array for date with no events', async () => {
      const events = await eventService.getEventsByDate(
        testUserId,
        new Date('2025-01-20')
      );

      expect(events).toEqual([]);
    });

    it('should handle timezone correctly', async () => {
      // Event at midnight UTC
      await env.db.createTestEvent(testUserId, {
        title: 'Midnight Event',
        startTsUtc: new Date('2025-01-18T00:00:00Z'),
      });

      const events = await eventService.getEventsByDate(
        testUserId,
        new Date('2025-01-18')
      );

      expect(events.some(e => e.title === 'Midnight Event')).toBe(true);
    });
  });

  describe('searchEvents', () => {
    beforeEach(async () => {
      await env.db.createTestEvent(testUserId, {
        title: 'פגישה עם לקוח',
        startTsUtc: new Date(),
        location: 'תל אביב',
      });
      await env.db.createTestEvent(testUserId, {
        title: 'ארוחת ערב',
        startTsUtc: new Date(),
        location: 'מסעדה',
      });
      await env.db.createTestEvent(testUserId, {
        title: 'פגישה של צוות',
        startTsUtc: new Date(),
        location: 'משרד',
      });
    });

    it('should find events by title keyword', async () => {
      const events = await eventService.searchEvents(testUserId, 'פגישה');
      expect(events).toHaveLength(2);
      expect(events.every((e: any) => e.title.includes('פגישה'))).toBe(true);
    });

    it('should find events by location', async () => {
      const events = await eventService.searchEvents(testUserId, 'תל אביב');
      expect(events).toHaveLength(1);
      expect(events[0].location).toContain('תל אביב');
    });

    it('should be case-insensitive', async () => {
      const eventsLower = await eventService.searchEvents(testUserId, 'פגישה');
      const eventsUpper = await eventService.searchEvents(testUserId, 'פגישה');
      expect(eventsLower).toHaveLength(eventsUpper.length);
    });

    it('should return empty array for no matches', async () => {
      const events = await eventService.searchEvents(testUserId, 'nonexistent');
      expect(events).toEqual([]);
    });

    it('should handle special characters in search', async () => {
      await env.db.createTestEvent(testUserId, {
        title: 'Event with (parentheses)',
        startTsUtc: new Date(),
      });

      const events = await eventService.searchEvents(testUserId, '(parentheses)');
      expect(events).toHaveLength(1);
    });
  });

  describe('updateEvent', () => {
    let eventId: string;

    beforeEach(async () => {
      const event = await env.db.createTestEvent(testUserId, {
        title: 'Original Title',
        startTsUtc: new Date('2025-01-15T10:00:00Z'),
        location: 'Original Location',
      });
      eventId = event.id;
    });

    it('should update event title', async () => {
      await eventService.updateEvent(eventId, testUserId, {
        title: 'Updated Title',
      });

      const events = await eventService.getAllEvents(testUserId);
      expect(events[0].title).toBe('Updated Title');
    });

    it('should update event location', async () => {
      await eventService.updateEvent(eventId, testUserId, {
        location: 'New Location',
      });

      const events = await eventService.getAllEvents(testUserId);
      expect(events[0].location).toBe('New Location');
    });

    it('should update event start time', async () => {
      const newTime = new Date('2025-01-20T14:00:00Z');
      await eventService.updateEvent(eventId, testUserId, {
        startTsUtc: newTime,
      });

      const events = await eventService.getAllEvents(testUserId);
      expect(events[0].startTsUtc.getTime()).toBe(newTime.getTime());
    });

    it('should reject update for non-existent event', async () => {
      await expect(
        eventService.updateEvent('non-existent-id', testUserId, {
          title: 'New Title',
        })
      ).rejects.toThrow();
    });

    it('should reject update for other users event', async () => {
      const otherUser = await env.db.createTestUser({
        phone: generateTestPhone(),
        name: 'Other User',
      });

      await expect(
        eventService.updateEvent(eventId, otherUser.id, {
          title: 'Hacked Title',
        })
      ).rejects.toThrow();
    });

    it('should update only provided fields', async () => {
      await eventService.updateEvent(eventId, testUserId, {
        title: 'New Title Only',
      });

      const events = await eventService.getAllEvents(testUserId);
      expect(events[0].title).toBe('New Title Only');
      expect(events[0].location).toBe('Original Location'); // Unchanged
    });
  });

  describe('deleteEvent', () => {
    let eventId: string;

    beforeEach(async () => {
      const event = await env.db.createTestEvent(testUserId, {
        title: 'To Delete',
        startTsUtc: new Date(),
      });
      eventId = event.id;
    });

    it('should delete event successfully', async () => {
      await eventService.deleteEvent(eventId, testUserId);

      const events = await eventService.getAllEvents(testUserId);
      expect(events).toHaveLength(0);
    });

    it('should reject delete for non-existent event', async () => {
      await expect(
        eventService.deleteEvent('non-existent-id', testUserId)
      ).rejects.toThrow();
    });

    it('should reject delete for other users event', async () => {
      const otherUser = await env.db.createTestUser({
        phone: generateTestPhone(),
        name: 'Other User',
      });

      await expect(
        eventService.deleteEvent(eventId, otherUser.id)
      ).rejects.toThrow();
    });

    it('should allow deleting event and creating new one with same title', async () => {
      await eventService.deleteEvent(eventId, testUserId);

      const newEvent = await eventService.createEvent({
        userId: testUserId,
        title: 'To Delete',
        startTsUtc: new Date(),
      });

      expect(newEvent.id).not.toBe(eventId);
      expect(newEvent.title).toBe('To Delete');
    });
  });

  describe('Performance Tests', () => {
    it('should handle bulk event creation efficiently', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 100 }, (_, i) =>
        eventService.createEvent({
          userId: testUserId,
          title: `Event ${i}`,
          startTsUtc: new Date(Date.now() + i * 86400000),
        })
      );

      await Promise.all(promises);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete in < 5s
    });

    it('should search through large dataset quickly', async () => {
      // Create 100 events
      for (let i = 0; i < 100; i++) {
        await env.db.createTestEvent(testUserId, {
          title: i % 10 === 0 ? 'Meeting' : `Event ${i}`,
          startTsUtc: new Date(Date.now() + i * 86400000),
        });
      }

      const start = Date.now();
      const results = await eventService.searchEvents(testUserId, 'Meeting');
      const duration = Date.now() - start;

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(500); // Should complete in < 500ms
    });
  });
});
