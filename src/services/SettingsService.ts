import { Pool } from 'pg';
import { pool } from '../config/database';
import logger from '../utils/logger';

export interface UserSettings {
  locale: string;
  timezone: string;
}

export class SettingsService {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettings> {
    try {
      const query = `
        SELECT locale, timezone FROM users
        WHERE id = $1
      `;

      const result = await this.dbPool.query(query, [userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return {
        locale: result.rows[0].locale,
        timezone: result.rows[0].timezone,
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
}

// Export singleton instance
export const settingsService = new SettingsService();
export default settingsService;
