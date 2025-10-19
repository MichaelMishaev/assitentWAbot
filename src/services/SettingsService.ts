import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import { MenuDisplayMode, UserPreferences } from '../types/index.js';

export interface UserSettings {
  locale: string;
  timezone: string;
  prefsJsonb?: UserPreferences;
}

export class SettingsService {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettings> {
    try {
      const query = `
        SELECT locale, timezone, prefs_jsonb FROM users
        WHERE id = $1
      `;

      const result = await this.dbPool.query(query, [userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return {
        locale: result.rows[0].locale,
        timezone: result.rows[0].timezone,
        prefsJsonb: result.rows[0].prefs_jsonb || {},
      };
    } catch (error) {
      logger.error('Failed to get user settings', { userId, error });
      throw error;
    }
  }

  /**
   * Update locale
   */
  async updateLocale(userId: string, locale: string): Promise<void> {
    try {
      const query = `
        UPDATE users
        SET locale = $1
        WHERE id = $2
      `;

      await this.dbPool.query(query, [locale, userId]);
      logger.info('Locale updated', { userId, locale });
    } catch (error) {
      logger.error('Failed to update locale', { userId, locale, error });
      throw error;
    }
  }

  /**
   * Update timezone
   */
  async updateTimezone(userId: string, timezone: string): Promise<void> {
    try {
      const query = `
        UPDATE users
        SET timezone = $1
        WHERE id = $2
      `;

      await this.dbPool.query(query, [timezone, userId]);
      logger.info('Timezone updated', { userId, timezone });
    } catch (error) {
      logger.error('Failed to update timezone', { userId, timezone, error });
      throw error;
    }
  }

  /**
   * Get menu display mode preference
   */
  async getMenuDisplayMode(userId: string): Promise<MenuDisplayMode> {
    try {
      const settings = await this.getUserSettings(userId);
      return settings.prefsJsonb?.menuDisplayMode || 'adaptive';
    } catch (error) {
      logger.error('Failed to get menu display mode', { userId, error });
      return 'adaptive'; // Default fallback
    }
  }

  /**
   * Update menu display mode preference
   */
  async updateMenuDisplayMode(userId: string, mode: MenuDisplayMode): Promise<void> {
    try {
      const query = `
        UPDATE users
        SET prefs_jsonb = jsonb_set(
          COALESCE(prefs_jsonb, '{}'::jsonb),
          '{menuDisplayMode}',
          to_jsonb($1::text)
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;

      await this.dbPool.query(query, [mode, userId]);
      logger.info('Menu display mode updated', { userId, mode });
    } catch (error) {
      logger.error('Failed to update menu display mode', { userId, mode, error });
      throw error;
    }
  }

  /**
   * Get reminder lead time preference (minutes before event to send reminder)
   * @param userId User ID
   * @returns Lead time in minutes (default: 15)
   */
  async getReminderLeadTime(userId: string): Promise<number> {
    try {
      const settings = await this.getUserSettings(userId);
      const leadTime = settings.prefsJsonb?.reminderLeadTimeMinutes;

      // Validate and return
      if (typeof leadTime === 'number' && leadTime >= 0 && leadTime <= 120) {
        return leadTime;
      }

      // Default fallback
      logger.info('Using default reminder lead time', { userId, storedValue: leadTime });
      return 15; // Default: 15 minutes before
    } catch (error) {
      logger.error('Failed to get reminder lead time, using default', { userId, error });
      return 15; // Fallback on error
    }
  }

  /**
   * Update reminder lead time preference
   * @param userId User ID
   * @param minutes Minutes before event (0-120)
   * @throws Error if validation fails
   */
  async updateReminderLeadTime(userId: string, minutes: number): Promise<void> {
    // CRITICAL VALIDATION
    if (typeof minutes !== 'number' || isNaN(minutes)) {
      throw new Error('Reminder lead time must be a valid number');
    }

    if (minutes < 0) {
      throw new Error('Reminder lead time cannot be negative');
    }

    if (minutes > 120) {
      throw new Error('Reminder lead time cannot exceed 120 minutes (2 hours)');
    }

    // Round to integer to avoid float precision issues
    const validatedMinutes = Math.floor(minutes);

    try {
      const query = `
        UPDATE users
        SET prefs_jsonb = jsonb_set(
          COALESCE(prefs_jsonb, '{}'::jsonb),
          '{reminderLeadTimeMinutes}',
          to_jsonb($1::integer)
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;

      await this.dbPool.query(query, [validatedMinutes, userId]);
      logger.info('Reminder lead time updated', { userId, minutes: validatedMinutes });
    } catch (error) {
      logger.error('Failed to update reminder lead time', { userId, minutes: validatedMinutes, error });
      throw error;
    }
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
export default settingsService;
