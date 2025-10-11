/**
 * Phase 7: Recurrence Pattern Detection
 *
 * Detects and generates RRULE for recurring events:
 * - "כל יום" → Daily recurrence
 * - "כל יום ראשון" → Weekly on Sunday
 * - "חודשי" → Monthly recurrence
 *
 * Uses rrule library for standard recurrence format
 *
 * Priority: #7
 */

import { RRule, Frequency } from 'rrule';
import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';

export class RecurrencePhase extends BasePhase {
  readonly name = 'recurrence-detector';
  readonly order = 7;
  readonly description = 'Detect and generate recurrence patterns';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    // Only run if we don't already have recurrence
    return !context.entities.recurrence;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const text = context.processedText;

      // Detect recurrence pattern
      const pattern = this.detectRecurrencePattern(text);

      if (pattern) {
        // Generate RRULE
        const rrule = this.generateRRule(pattern, context);

        context.entities.recurrence = {
          pattern: pattern.frequency,
          interval: pattern.interval || 1,
          rrule: rrule.toString()
        };

        logger.info('Recurrence detected', {
          pattern: pattern.frequency,
          rrule: rrule.toString()
        });

        return this.success({
          detected: true,
          pattern,
          rrule: rrule.toString()
        });
      }

      return this.success({ detected: false });

    } catch (error) {
      logger.error('Recurrence detection failed', { error });
      return this.success({ detected: false }, ['Recurrence detection failed']);
    }
  }

  /**
   * Detect recurrence pattern from text
   */
  private detectRecurrencePattern(text: string): RecurrencePattern | null {
    // Daily patterns
    if (/כל יום|daily|every day/i.test(text)) {
      return {
        frequency: 'daily',
        interval: 1
      };
    }

    // Weekly patterns
    const weeklyMatch = text.match(/כל (יום )?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/i);
    if (weeklyMatch) {
      const dayName = weeklyMatch[2];
      const dayOfWeek = this.hebrewDayToNumber(dayName);

      return {
        frequency: 'weekly',
        interval: 1,
        byweekday: dayOfWeek
      };
    }

    // Weekly (general)
    if (/כל שבוע|weekly|every week/i.test(text)) {
      return {
        frequency: 'weekly',
        interval: 1
      };
    }

    // Monthly patterns
    if (/כל חודש|חודשי|monthly|every month/i.test(text)) {
      return {
        frequency: 'monthly',
        interval: 1
      };
    }

    // Yearly patterns
    if (/כל שנה|שנתי|yearly|every year/i.test(text)) {
      return {
        frequency: 'yearly',
        interval: 1
      };
    }

    return null;
  }

  /**
   * Generate RRULE from pattern
   */
  private generateRRule(pattern: RecurrencePattern, context: PhaseContext): RRule {
    const options: any = {
      freq: this.getFrequency(pattern.frequency),
      interval: pattern.interval || 1
    };

    // Set start date (dtstart)
    if (context.entities.date) {
      options.dtstart = context.entities.date;
    }

    // Set day of week for weekly recurrence
    if (pattern.byweekday !== undefined) {
      options.byweekday = [pattern.byweekday];
    }

    // Check if we should exclude Shabbat
    if (this.shouldExcludeShabbat(context)) {
      // Exclude Saturday (day 6)
      if (pattern.frequency === 'daily') {
        options.byweekday = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
      }
    }

    return new RRule(options);
  }

  /**
   * Convert frequency string to RRule frequency
   */
  private getFrequency(frequency: string): Frequency {
    const map: Record<string, Frequency> = {
      'daily': RRule.DAILY,
      'weekly': RRule.WEEKLY,
      'monthly': RRule.MONTHLY,
      'yearly': RRule.YEARLY
    };
    return map[frequency] || RRule.DAILY;
  }

  /**
   * Convert Hebrew day name to number (0=Sunday, 6=Saturday)
   */
  private hebrewDayToNumber(dayName: string): number {
    const map: Record<string, number> = {
      'ראשון': RRule.SU.weekday,
      'שני': RRule.MO.weekday,
      'שלישי': RRule.TU.weekday,
      'רביעי': RRule.WE.weekday,
      'חמישי': RRule.TH.weekday,
      'שישי': RRule.FR.weekday,
      'שבת': RRule.SA.weekday
    };
    return map[dayName] || RRule.MO.weekday;
  }

  /**
   * Check if we should exclude Shabbat from recurrence
   */
  private shouldExcludeShabbat(context: PhaseContext): boolean {
    // Check if user has preference to exclude Shabbat
    // For now, default to false (don't exclude)
    // Can be enhanced with user preferences later
    return false;
  }
}

interface RecurrencePattern {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  byweekday?: number; // Day of week (0-6)
}
