import { describe, test, expect, beforeEach } from '@jest/globals';
import { ValidationEnrichmentPhase } from '../../../src/domain/phases/phase10-validation/ValidationEnrichmentPhase.js';
import { PhaseContext } from '../../../src/domain/orchestrator/PhaseContext.js';
import { IncomingMessage } from '../../../src/providers/IMessageProvider.js';
import { DateTime } from 'luxon';

describe.skip('ValidationEnrichmentPhase', () => {
  let phase: ValidationEnrichmentPhase;
  const timezone = 'Asia/Jerusalem';

  beforeEach(() => {
    phase = new ValidationEnrichmentPhase();
  });

  // Helper function to create a mock PhaseContext
  function createMockContext(entities: Partial<any> = {}, intent: string = 'create_event'): PhaseContext {
    const mockMessage: IncomingMessage = {
      messageId: 'test-123',
      from: '+972501234567',
      content: {
        text: 'test message'
      },
      timestamp: Date.now(),
      isFromMe: false
    };

    const context = new PhaseContext(mockMessage, 'user123', timezone);
    context.intent = intent;
    context.confidence = 0.85;
    context.entities = { ...context.entities, ...entities };

    return context;
  }

  describe('Validation Rules', () => {
    test('should validate that end time is after start time', async () => {
      const startTime = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();
      const endTime = DateTime.now().setZone(timezone).toJSDate(); // Before start

      const context = createMockContext({
        title: 'פגישה',
        date: startTime,
        endDate: endTime
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('End time must be after start time');
    });

    test('should pass validation when end time is after start time', async () => {
      const startTime = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();
      const endTime = DateTime.now().setZone(timezone).plus({ hours: 2 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: startTime,
        endDate: endTime
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
    });

    test('should warn when event date is in the past', async () => {
      const pastDate = DateTime.now().setZone(timezone).minus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: pastDate
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('past'))).toBe(true);
    });

    test('should NOT warn when event is within 5-minute grace period', async () => {
      const now = DateTime.now().setZone(timezone).minus({ minutes: 2 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: now
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.warnings?.length || 0).toBe(0);
    });

    test('should validate time format HH:MM', async () => {
      const context = createMockContext({
        title: 'פגישה',
        time: '14:30',
        date: DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate()
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
    });

    test('should reject invalid time format', async () => {
      const context = createMockContext({
        title: 'פגישה',
        time: '25:70', // Invalid
        date: DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate()
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid time format (expected HH:MM)');
    });

    test('should warn about events outside working hours (early morning)', async () => {
      const earlyMorning = DateTime.now().setZone(timezone).set({ hour: 4, minute: 0 }).plus({ days: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: earlyMorning,
        time: '04:00'
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.warnings?.some(w => w.includes('working hours'))).toBe(true);
    });

    test('should warn about events outside working hours (late night)', async () => {
      const lateNight = DateTime.now().setZone(timezone).set({ hour: 23, minute: 30 }).plus({ days: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: lateNight,
        time: '23:30'
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.warnings?.some(w => w.includes('working hours'))).toBe(true);
    });

    test('should add default title when missing', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: undefined,
        date: futureDate
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.title).toBe('אירוע חדש');
      expect(result.data.enrichments).toContain('Added default title');
    });

    test('should NOT add default title when present', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה חשובה',
        date: futureDate
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.title).toBe('פגישה חשובה');
      expect(result.data.enrichments).not.toContain('Added default title');
    });

    test('should validate recurrence pattern', async () => {
      const context = createMockContext({
        title: 'פגישה',
        recurrence: {
          pattern: undefined, // Missing pattern
          interval: 1
        }
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Recurrence pattern is missing');
    });

    test('should validate recurrence interval >= 1', async () => {
      const context = createMockContext({
        title: 'פגישה',
        recurrence: {
          pattern: 'daily',
          interval: 0 // Invalid
        }
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Recurrence interval must be at least 1');
    });
  });

  describe('Enrichment Rules', () => {
    test('should add default 1-hour duration for events', async () => {
      const startTime = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: startTime
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.endDate).toBeDefined();
      const endDateTime = DateTime.fromJSDate(context.entities.endDate!);
      const startDateTime = DateTime.fromJSDate(startTime);
      expect(endDateTime.diff(startDateTime, 'hours').hours).toBe(1);
      expect(result.data.enrichments).toContain('Added default 1-hour duration');
    });

    test('should NOT add duration if endDate already exists', async () => {
      const startTime = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();
      const endTime = DateTime.now().setZone(timezone).plus({ hours: 3 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: startTime,
        endDate: endTime
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.endDate).toBe(endTime);
      expect(result.data.enrichments).not.toContain('Added default 1-hour duration');
    });

    test('should add default priority "normal"', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: futureDate,
        priority: undefined
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.priority).toBe('normal');
      expect(result.data.enrichments).toContain('Added default priority: normal');
    });

    test('should NOT override existing priority', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: futureDate,
        priority: 'urgent'
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.priority).toBe('urgent');
      expect(result.data.enrichments).not.toContain('Added default priority: normal');
    });

    test('should generate display date text if missing', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: futureDate,
        dateText: undefined
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.dateText).toBeDefined();
      expect(context.entities.dateText).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
      expect(result.data.enrichments).toContain('Generated display date text');
    });

    test('should NOT override existing dateText', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: futureDate,
        dateText: 'מחר בשעה 10'
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.dateText).toBe('מחר בשעה 10');
      expect(result.data.enrichments).not.toContain('Generated display date text');
    });

    test('should enrich voice message metadata', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: futureDate,
        isVoiceMessage: true,
        transcriptionConfidence: 0.92
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.data.enrichments).toContain('Voice message detected - applied normalization');
    });
  });

  describe('Confidence Adjustments', () => {
    test('should boost confidence when all required fields present', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה חשובה',
        date: futureDate
      });
      context.confidence = 0.80;

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.confidence).toBeGreaterThan(0.80);
      expect(result.data.enrichments).toContain('Boosted confidence (has title + date)');
    });

    test('should reduce confidence when warnings present', async () => {
      const pastDate = DateTime.now().setZone(timezone).minus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: pastDate
      });
      context.confidence = 0.90;

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.confidence).toBeLessThan(0.90);
    });

    test('should cap confidence boost at 0.95', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: futureDate
      });
      context.confidence = 0.92; // Start high

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.confidence).toBeLessThanOrEqual(0.95);
    });

    test('should not reduce confidence below 0.5', async () => {
      const pastDate = DateTime.now().setZone(timezone).minus({ days: 1 }).toJSDate();
      const invalidTime = DateTime.now().setZone(timezone).minus({ days: 1 }).set({ hour: 3 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: pastDate,
        time: '03:00'
      });
      context.confidence = 0.55;

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('Intent-Specific Behavior', () => {
    test('should validate create_event intent', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: futureDate
      }, 'create_event');

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.priority).toBe('normal');
    });

    test('should validate create_reminder intent', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        title: 'תזכורת',
        date: futureDate
      }, 'create_reminder');

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.priority).toBe('normal');
    });

    test('should NOT warn about past dates for search intent', async () => {
      const pastDate = DateTime.now().setZone(timezone).minus({ days: 1 }).toJSDate();

      const context = createMockContext({
        date: pastDate
      }, 'search_event');

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      // Should not warn about past date for searches
    });
  });

  describe('Error Handling', () => {
    test('should handle multiple validation errors', async () => {
      const pastStart = DateTime.now().setZone(timezone).minus({ hours: 1 }).toJSDate();
      const pastEnd = DateTime.now().setZone(timezone).minus({ hours: 2 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה',
        date: pastStart,
        endDate: pastEnd,
        time: '25:99' // Invalid
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(1);
    });

    test('should handle exception gracefully', async () => {
      // Create a context that will cause an error
      const context = createMockContext({});

      // Override entities with malformed data
      (context.entities as any) = null;

      const result = await phase.execute(context);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Validation failed');
    });
  });

  describe('Phase Metadata', () => {
    test('should have correct phase order', () => {
      expect(phase.order).toBe(10);
    });

    test('should be a required phase', () => {
      expect(phase.isRequired).toBe(true);
    });

    test('should have descriptive name', () => {
      expect(phase.name).toBe('validation-enrichment');
    });

    test('should always run', async () => {
      const context = createMockContext({});
      const shouldRun = await phase.shouldRun(context);

      expect(shouldRun).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    test('should validate and enrich complete event', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 2 }).toJSDate();

      const context = createMockContext({
        title: 'פגישה חשובה',
        date: futureDate,
        time: '14:00',
        location: 'משרד',
        contactNames: ['דני'],
        priority: 'high'
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.endDate).toBeDefined();
      expect(context.entities.dateText).toBeDefined();
      expect(result.data.confidence).toBeGreaterThan(0.85);
    });

    test('should validate and enrich minimal event', async () => {
      const futureDate = DateTime.now().setZone(timezone).plus({ hours: 1 }).toJSDate();

      const context = createMockContext({
        date: futureDate
      });

      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(context.entities.title).toBe('אירוע חדש');
      expect(context.entities.priority).toBe('normal');
      expect(context.entities.endDate).toBeDefined();
      expect(context.entities.dateText).toBeDefined();
    });
  });
});
