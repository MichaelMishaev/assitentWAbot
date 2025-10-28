import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';
import { EventService, Event } from './EventService.js';
import { SettingsService } from './SettingsService.js';
import { User } from '../types/index.js';

/**
 * MorningSummaryService - Generates and formats morning summary messages
 */
export class MorningSummaryService {
  constructor(
    private dbPool: Pool = pool,
    private eventService: EventService = new EventService(),
    private settingsService: SettingsService = new SettingsService()
  ) {}

  /**
   * Check if we should send morning summary to user today
   * @param user User object
   * @returns true if should send today
   */
  shouldSendToday(user: User): boolean {
    try {
      const prefs = user.prefsJsonb?.morningNotification;

      // Check if enabled
      if (!prefs?.enabled) {
        return false;
      }

      // Get current day in user's timezone
      const now = DateTime.now().setZone(user.timezone);
      const currentDay = now.weekday % 7; // Convert to 0=Sunday format (Luxon uses 1-7 Mon-Sun)

      // Check if today is in allowed days
      const allowedDays = prefs.days ?? [1, 2, 3, 4, 5];
      return allowedDays.includes(currentDay);
    } catch (error) {
      logger.error('Error checking if should send today', { userId: user.id, error });
      return false;
    }
  }

  /**
   * Generate morning summary message for a user
   * @param userId User ID
   * @param date Date to generate summary for (defaults to today in user's timezone)
   * @returns Formatted message string, or null if no events/reminders
   */
  async generateSummaryForUser(userId: string, date?: Date): Promise<string | null> {
    try {
      // Get user settings
      const settings = await this.settingsService.getUserSettings(userId);
      const prefs = settings.prefsJsonb?.morningNotification;

      // Get date in user's timezone
      const userTz = settings.timezone || 'Asia/Jerusalem';
      const targetDate = date
        ? DateTime.fromJSDate(date).setZone(userTz)
        : DateTime.now().setZone(userTz);

      // Get events for today
      const events = await this.eventService.getEventsByDate(userId, targetDate.toJSDate());

      // Get active reminders for today (if includeMemos is true)
      let reminders: any[] = [];
      if (prefs?.includeMemos !== false) {
        reminders = await this.getActiveRemindersForToday(userId, targetDate.toJSDate());
      }

      // SKIP if user has no events and no reminders
      if (events.length === 0 && reminders.length === 0) {
        logger.info('Skipping morning summary - no events or reminders for today', {
          userId,
          date: targetDate.toISODate(),
        });
        return null;
      }

      // Format the message
      const message = this.formatSummaryMessage(targetDate, events, reminders, userTz);

      logger.info('Morning summary generated', {
        userId,
        date: targetDate.toISODate(),
        eventsCount: events.length,
        remindersCount: reminders.length,
      });

      return message;
    } catch (error) {
      logger.error('Failed to generate morning summary', { userId, date, error });
      throw error;
    }
  }

  /**
   * Get active reminders for today
   * @param userId User ID
   * @param date Date to check
   * @returns Array of active reminders
   */
  private async getActiveRemindersForToday(userId: string, date: Date): Promise<any[]> {
    try {
      const dt = DateTime.fromJSDate(date).setZone('Asia/Jerusalem');
      const startOfDay = dt.startOf('day').toUTC().toJSDate();
      const endOfDay = dt.endOf('day').toUTC().toJSDate();

      const query = `
        SELECT * FROM reminders
        WHERE user_id = $1
          AND status IN ('pending', 'active')
          AND due_ts_utc >= $2
          AND due_ts_utc < $3
        ORDER BY due_ts_utc ASC
        LIMIT 20
      `;

      const result = await this.dbPool.query(query, [userId, startOfDay, endOfDay]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get active reminders for today', { userId, date, error });
      return []; // Return empty array on error, don't block summary
    }
  }

  /**
   * Format the morning summary message
   * @param date Date object
   * @param events Array of events
   * @param reminders Array of reminders
   * @param timezone User's timezone
   * @returns Formatted Hebrew message
   */
  private formatSummaryMessage(
    date: DateTime,
    events: Event[],
    reminders: any[],
    timezone: string
  ): string {
    // Hebrew day names
    const dayNames = [
      'ראשון',
      'שני',
      'שלישי',
      'רביעי',
      'חמישי',
      'שישי',
      'שבת',
    ];

    // Get day of week (0 = Sunday)
    const dayOfWeek = date.weekday % 7;
    const dayName = dayNames[dayOfWeek];

    // Format date
    const formattedDate = date.toFormat('d בMMMM', { locale: 'he' });

    // Build message
    let message = `🌅 *בוקר טוב!*\n\n`;
    message += `📅 *יום ${dayName}, ${formattedDate}*\n\n`;

    // Add events section
    if (events.length > 0) {
      message += `*אירועים להיום:*\n`;
      events.forEach((event) => {
        const startTime = DateTime.fromJSDate(event.startTsUtc)
          .setZone(timezone)
          .toFormat('HH:mm');

        message += `• ${startTime} - ${event.title}`;

        if (event.location) {
          message += ` 📍 ${event.location}`;
        }

        message += `\n`;
      });
      message += `\n`;
    } else {
      message += `📌 אין אירועים מתוכננים להיום\n\n`;
    }

    // Add reminders section
    if (reminders.length > 0) {
      message += `📝 *תזכורות להיום:*\n`;
      reminders.forEach((reminder) => {
        const dueTime = DateTime.fromJSDate(reminder.due_ts_utc)
          .setZone(timezone)
          .toFormat('HH:mm');

        message += `• ${dueTime} - ${reminder.title}\n`;
      });
      message += `\n`;
    }

    // Add footer with toggle info and stop instructions
    message += `---\n`;
    message += `⚙️ *להפסקת תזכורת הבוקר:*\n`;
    message += `שלח "/תפריט" ➜ בחר "הגדרות" ➜ בחר "תזכורת בוקר" ➜ כבה\n\n`;
    message += `או פנה למנהל המערכת`;

    return message;
  }

  /**
   * Get summary statistics for user
   * @param userId User ID
   * @returns Stats about upcoming events and reminders
   */
  async getSummaryStats(userId: string): Promise<{
    eventsToday: number;
    eventsThisWeek: number;
    remindersToday: number;
  }> {
    try {
      const now = DateTime.now().setZone('Asia/Jerusalem');
      const todayStart = now.startOf('day').toUTC().toJSDate();
      const todayEnd = now.endOf('day').toUTC().toJSDate();
      const weekEnd = now.endOf('week').toUTC().toJSDate();

      // Count events today
      const eventsTodayQuery = `
        SELECT COUNT(*) as count FROM events
        WHERE user_id = $1
          AND start_ts_utc >= $2
          AND start_ts_utc < $3
      `;
      const eventsTodayResult = await this.dbPool.query(eventsTodayQuery, [
        userId,
        todayStart,
        todayEnd,
      ]);

      // Count events this week
      const eventsWeekQuery = `
        SELECT COUNT(*) as count FROM events
        WHERE user_id = $1
          AND start_ts_utc >= $2
          AND start_ts_utc < $3
      `;
      const eventsWeekResult = await this.dbPool.query(eventsWeekQuery, [
        userId,
        todayStart,
        weekEnd,
      ]);

      // Count reminders today
      const remindersTodayQuery = `
        SELECT COUNT(*) as count FROM reminders
        WHERE user_id = $1
          AND status IN ('pending', 'active')
          AND due_ts_utc >= $2
          AND due_ts_utc < $3
      `;
      const remindersTodayResult = await this.dbPool.query(remindersTodayQuery, [
        userId,
        todayStart,
        todayEnd,
      ]);

      return {
        eventsToday: parseInt(eventsTodayResult.rows[0].count, 10),
        eventsThisWeek: parseInt(eventsWeekResult.rows[0].count, 10),
        remindersToday: parseInt(remindersTodayResult.rows[0].count, 10),
      };
    } catch (error) {
      logger.error('Failed to get summary stats', { userId, error });
      return {
        eventsToday: 0,
        eventsThisWeek: 0,
        remindersToday: 0,
      };
    }
  }
}

// Export singleton instance
export const morningSummaryService = new MorningSummaryService();
export default morningSummaryService;
