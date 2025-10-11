/**
 * Phase 4: Hebrew Calendar Integration
 *
 * Checks event dates against:
 * - Jewish holidays
 * - Shabbat
 * - Israeli national holidays
 *
 * Priority: #1 (CRITICAL)
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import { HebcalClient, HolidayCheckResult } from '../../../infrastructure/external/hebcal/HebcalClient.js';
import { pluginManager } from '../../../plugins/PluginManager.js';
import logger from '../../../utils/logger.js';

export class HebrewCalendarPhase extends BasePhase {
  readonly name = 'hebrew-calendar';
  readonly order = 4;
  readonly description = 'Check dates against Jewish calendar and holidays';
  readonly isRequired = false; // Non-blocking, just adds warnings

  private hebcalClient: HebcalClient | null = null;

  /**
   * Initialize with Hebcal client
   */
  async initialize(): Promise<void> {
    // Get Hebcal client from plugin manager
    this.hebcalClient = pluginManager.getPlugin('hebcal-client') as HebcalClient;

    if (!this.hebcalClient) {
      logger.warn('HebcalClient not registered, Hebrew calendar checks disabled');
    }
  }

  /**
   * Only run if we have a date and the Hebcal client
   */
  async shouldRun(context: PhaseContext): Promise<boolean> {
    return !!context.entities.date && !!this.hebcalClient;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const date = context.entities.date;
      if (!date || !this.hebcalClient) {
        return this.success({ skipped: true });
      }

      // Check the date
      const result: HolidayCheckResult = await this.hebcalClient.execute(date, {
        userId: context.userId,
        messageId: context.originalMessage.messageId,
        timestamp: new Date(),
        metadata: {},
        logger
      });

      // Add Hebrew date to entities
      context.entities.hebrewDate = {
        year: 0, // HDate doesn't expose year easily, can add if needed
        month: '',
        day: 0,
        formatted: result.hebrewDate
      };

      // Check for conflicts
      if (result.isHoliday || result.isShabbat) {
        context.entities.holidayConflict = {
          name: result.holidayName || 'שבת',
          type: result.isShabbat ? 'shabbat' : 'jewish',
          severity: result.severity || 'warn',
          message: result.message || ''
        };

        // Add warning to context
        if (result.message) {
          context.addWarning(result.message);
        }

        // Log the conflict
        logger.info('Holiday/Shabbat conflict detected', {
          date: date.toISOString(),
          holidayName: result.holidayName,
          isShabbat: result.isShabbat,
          severity: result.severity
        });
      }

      // Check Shabbat timing specifically (for Friday evening appointments)
      if (result.shabbatTimes) {
        const appointmentDateTime = context.entities.time
          ? this.combineDateAndTime(date, context.entities.time)
          : date;

        // Check if appointment overlaps with Shabbat
        if (
          appointmentDateTime >= result.shabbatTimes.start.toJSDate() &&
          appointmentDateTime <= result.shabbatTimes.end.toJSDate()
        ) {
          const warning = `⚠️ הפגישה חופפת לשבת! ` +
            `שבת נכנסת ב-${result.shabbatTimes.start.toFormat('HH:mm')} ` +
            `ויוצאת ב-${result.shabbatTimes.end.toFormat('HH:mm')}`;

          context.addWarning(warning);

          if (context.entities.holidayConflict) {
            context.entities.holidayConflict.severity = 'warn';
            context.entities.holidayConflict.message = warning;
          }
        }
      }

      // Handle case where user has no location
      if (!context.getMetadata('userLocation')) {
        // Check if time is "on the verge" of Shabbat
        if (result.shabbatTimes && date.getDay() === 5) {
          // Friday - check time
          const time = context.entities.time;
          if (time) {
            const hour = parseInt(time.split(':')[0]);
            if (hour >= 16 && hour <= 20) {
              // Might be Shabbat depending on location
              const warning = '⚠️ ייתכן שהתאריך חופף לשבת (תלוי במיקום)\n' +
                'אם יש לך מיקום ספציפי, הוסף אותו לפרופיל שלך בהגדרות';
              context.addWarning(warning);
            }
          }
        }
      }

      return this.success({
        checked: true,
        result,
        conflict: !!context.entities.holidayConflict
      });

    } catch (error) {
      logger.error('Hebrew calendar check failed', { error });
      // Non-blocking: just log error and continue
      return this.success({
        checked: false,
        error: error instanceof Error ? error.message : String(error)
      }, ['Hebrew calendar check failed']);
    }
  }

  /**
   * Helper: Combine date and time string into Date object
   */
  private combineDateAndTime(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }
}
