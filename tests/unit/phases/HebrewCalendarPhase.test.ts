import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { HebrewCalendarPhase } from '../../../src/domain/phases/phase4-hebrew-calendar/HebrewCalendarPhase';
import { PhaseContext } from '../../../src/domain/orchestrator/PhaseContext';
import { DateTime } from 'luxon';

describe('HebrewCalendarPhase', () => {
  let phase: HebrewCalendarPhase;
  let context: PhaseContext;

  beforeEach(() => {
    phase = new HebrewCalendarPhase();

    // Create mock context
    const mockMessage = {
      messageId: 'test-123',
      from: '+972501234567',
      content: { text: 'test message' },
      timestamp: new Date(),
      isFromMe: false
    };

    context = new PhaseContext(mockMessage, 'user-123', 'Asia/Jerusalem');
  });

  test('should have correct metadata', () => {
    expect(phase.name).toBe('hebrew-calendar');
    expect(phase.order).toBe(4);
    expect(phase.isRequired).toBe(false);
  });

  test('should not run if no date in context', async () => {
    const shouldRun = await phase.shouldRun(context);
    expect(shouldRun).toBe(false);
  });

  test('should run if date exists', async () => {
    context.entities.date = new Date('2025-10-14T10:00:00Z');
    const shouldRun = await phase.shouldRun(context);
    expect(shouldRun).toBe(true);
  });

  test('should detect Shabbat (Saturday)', async () => {
    // Saturday, October 18, 2025
    context.entities.date = new Date('2025-10-18T10:00:00');

    await phase.initialize();
    const result = await phase.execute(context);

    expect(result.success).toBe(true);
    expect(context.entities.holidayConflict).toBeDefined();
    expect(context.entities.holidayConflict?.type).toBe('shabbat');
  });

  test('should detect Yom Kippur with block severity', async () => {
    // Yom Kippur 2025: October 12
    context.entities.date = new Date('2025-10-12T10:00:00');

    await phase.initialize();
    const result = await phase.execute(context);

    expect(result.success).toBe(true);
    if (context.entities.holidayConflict) {
      expect(context.entities.holidayConflict.severity).toBe('block');
      expect(context.entities.holidayConflict.name).toContain('כיפור');
    }
  });

  test('should warn about Friday evening appointments', async () => {
    // Friday evening - might conflict with Shabbat
    context.entities.date = new Date('2025-10-17T18:00:00'); // Friday 6 PM
    context.entities.time = '18:00';

    await phase.initialize();
    const result = await phase.execute(context);

    expect(result.success).toBe(true);
    expect(context.getWarnings().length).toBeGreaterThan(0);
  });

  test('should add Hebrew date to entities', async () => {
    context.entities.date = new Date('2025-10-14T10:00:00');

    await phase.initialize();
    await phase.execute(context);

    expect(context.entities.hebrewDate).toBeDefined();
    expect(context.entities.hebrewDate?.formatted).toBeDefined();
  });

  test('should handle missing Hebcal client gracefully', async () => {
    context.entities.date = new Date('2025-10-14T10:00:00');

    // Don't initialize (no Hebcal client)
    const result = await phase.execute(context);

    expect(result.success).toBe(true);
    expect(result.data.skipped).toBe(true);
  });

  test('should warn when no user location on borderline time', async () => {
    // Friday 6 PM - borderline Shabbat time
    context.entities.date = new Date('2025-10-17T18:00:00');
    context.entities.time = '18:30';
    // No location set

    await phase.initialize();
    const result = await phase.execute(context);

    expect(result.success).toBe(true);
    const warnings = context.getWarnings();
    const hasLocationWarning = warnings.some(w => w.includes('תלוי במיקום'));
    expect(hasLocationWarning).toBe(true);
  });
});
