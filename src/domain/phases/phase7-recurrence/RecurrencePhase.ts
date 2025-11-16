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

// RRULE ES MODULE FIX: Import entire module as default then destructure
// The rrule library has ESM exports but Node.js needs default import for hybrid packages
import rruleModule from 'rrule';

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';

// Extract RRule from the default export
const { RRule } = rruleModule as any;

export class RecurrencePhase extends BasePhase {
  readonly name = 'recurrence-detector';
  readonly order = 7;
  readonly description = 'Detect and generate recurrence patterns';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    // Always run - we might need to override AI's mistakes on Hebrew patterns
    return true;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const text = context.processedText;

      // Always try rule-based detection
      const rulePattern = this.detectRecurrencePattern(text);

      // SMART HYBRID: If AI already extracted recurrence, decide whether to override
      if (context.entities.recurrence) {
        // Check if text has Hebrew day pattern
        const hasHebrewDayPattern = this.isHebrewDayPattern(text);

        if (rulePattern && hasHebrewDayPattern) {
          // Check if AI got it right - only override if WRONG
          if (context.entities.recurrence.pattern === rulePattern.frequency) {
            // AI is correct, keep it
            logger.info('✅ Keeping AI recurrence (AI got it right for Hebrew)', {
              text: text.substring(0, 100),
              pattern: context.entities.recurrence.pattern
            });

            return this.success({
              detected: true,
              keptAI: true,
              pattern: context.entities.recurrence.pattern
            });
          }

          // AI is wrong - override with rule-based (more accurate for Hebrew)
          const rrule = this.generateRRule(rulePattern, context);

          logger.info('🔄 Overriding AI recurrence with rule-based (Hebrew day pattern)', {
            text: text.substring(0, 100),
            aiPattern: context.entities.recurrence.pattern,
            rulePattern: rulePattern.frequency,
            aiRRule: context.entities.recurrence.rrule?.substring(0, 50),
            ruleRRule: rrule.toString().substring(0, 50)
          });

          context.entities.recurrence = {
            pattern: rulePattern.frequency,
            interval: rulePattern.interval || 1,
            rrule: rrule.toString()
          };

          return this.success({
            detected: true,
            overriddenAI: true,
            pattern: rulePattern,
            rrule: rrule.toString()
          });
        } else {
          // Keep AI result (English/complex patterns, or no rule match)
          logger.info('✅ Keeping AI recurrence (no Hebrew override needed)', {
            text: text.substring(0, 100),
            aiPattern: context.entities.recurrence.pattern,
            hasRuleMatch: !!rulePattern,
            hasHebrewPattern: hasHebrewDayPattern
          });

          return this.success({
            detected: true,
            keptAI: true,
            pattern: context.entities.recurrence.pattern
          });
        }
      }

      // No AI recurrence - use rule-based if found
      if (rulePattern) {
        const rrule = this.generateRRule(rulePattern, context);

        context.entities.recurrence = {
          pattern: rulePattern.frequency,
          interval: rulePattern.interval || 1,
          rrule: rrule.toString()
        };

        logger.info('Recurrence detected (rule-based)', {
          pattern: rulePattern.frequency,
          rrule: rrule.toString()
        });

        return this.success({
          detected: true,
          pattern: rulePattern,
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
   * Check if text contains Hebrew day pattern
   * Used to decide whether to override AI with rule-based matching
   */
  private isHebrewDayPattern(text: string): boolean {
    // Match Hebrew day patterns:
    // 1. "כל יום ד" / "כל ד" (day abbreviations) - no \b as it doesn't work with Hebrew
    // 2. "כל יום רביעי" / "כל רביעי" (full day names)
    // 3. "חוג ביום שלישי" / "אימון ביום ד" (implicit recurring with day)
    return /כל (יום )?[א-ו](?:\s|$|ב)/i.test(text) ||
           /כל (יום )?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/i.test(text) ||
           /(חוג|שיעור|אימון|קורס|תרגול).*?ב?יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|[א-ו])(?:\s|$|ב)/i.test(text);
  }

  /**
   * Detect recurrence pattern from text
   */
  private detectRecurrencePattern(text: string): RecurrencePattern | null {
    // BUG FIX #19: Weekly patterns MUST be checked BEFORE daily patterns
    // Otherwise "כל יום ד" matches "כל יום" and returns daily instead of weekly

    // BUG FIX #4/#32: Implicit recurring events from context words
    // Examples: "חוג ביום שלישי" (class on Tuesday), "שיעור ביום ד'" (lesson on Wednesday)
    // Keywords that imply recurrence: חוג (class), שיעור (lesson), אימון (training), קורס (course)
    // IMPORTANT: Require "יום" or "ביום" to avoid false matches (e.g., "גיטרה" matching "ג")
    const implicitRecurringMatch = text.match(/(חוג|שיעור|אימון|קורס|תרגול).*?ב?יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|[א-ו])(?:\s|$|ב)/i);
    if (implicitRecurringMatch) {
      const dayText = implicitRecurringMatch[2];

      // Check if it's an abbreviation (single letter) or full day name
      let dayOfWeek: number | null = null;
      if (dayText.length === 1) {
        // Abbreviation: א, ב, ג, etc.
        dayOfWeek = this.hebrewDayAbbrevToNumber(dayText);
      } else {
        // Full name: ראשון, שני, etc.
        dayOfWeek = this.hebrewDayToNumber(dayText);
      }

      if (dayOfWeek !== null) {
        logger.info('🔄 Implicit recurring event detected', {
          keyword: implicitRecurringMatch[1],
          day: dayText,
          dayOfWeek
        });

        return {
          frequency: 'weekly',
          interval: 1,
          byweekday: dayOfWeek
        };
      }
    }

    // Weekly patterns - full names (e.g., "כל יום רביעי", "כל רביעי")
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

    // Weekly patterns - abbreviations (e.g., "כל יום ד", "כל ד")
    // א=Sunday, ב=Monday, ג=Tuesday, ד=Wednesday, ה=Thursday, ו=Friday
    const weeklyAbbrevMatch = text.match(/כל (יום )?([א-ו])(?:\s|$|ב)/i);
    if (weeklyAbbrevMatch) {
      const dayAbbrev = weeklyAbbrevMatch[2];
      const dayOfWeek = this.hebrewDayAbbrevToNumber(dayAbbrev);

      if (dayOfWeek !== null) {
        return {
          frequency: 'weekly',
          interval: 1,
          byweekday: dayOfWeek
        };
      }
    }

    // Daily patterns - MUST come AFTER weekly checks
    // Use negative lookahead to prevent matching "כל יום ד" (every Wednesday)
    if (/כל יום(?!\s*[א-ו]|\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))/i.test(text) || /daily|every day/i.test(text)) {
      return {
        frequency: 'daily',
        interval: 1
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
  private generateRRule(pattern: RecurrencePattern, context: PhaseContext): any {
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
  private getFrequency(frequency: string): any {
    const map: Record<string, any> = {
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
   * Convert Hebrew day abbreviation to number (0=Sunday, 6=Saturday)
   * BUG FIX #19: Support day abbreviations like "כל יום ד" (every Wednesday)
   *
   * א = Sunday (ראשון)
   * ב = Monday (שני)
   * ג = Tuesday (שלישי)
   * ד = Wednesday (רביעי)
   * ה = Thursday (חמישי)
   * ו = Friday (שישי)
   * Note: Saturday (שבת) typically uses full name, not abbreviation
   */
  private hebrewDayAbbrevToNumber(dayAbbrev: string): number | null {
    const map: Record<string, number> = {
      'א': RRule.SU.weekday,  // Sunday
      'ב': RRule.MO.weekday,  // Monday
      'ג': RRule.TU.weekday,  // Tuesday
      'ד': RRule.WE.weekday,  // Wednesday
      'ה': RRule.TH.weekday,  // Thursday
      'ו': RRule.FR.weekday   // Friday
    };
    return map[dayAbbrev] !== undefined ? map[dayAbbrev] : null;
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
