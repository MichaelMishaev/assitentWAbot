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
}

// Export singleton instance
export const settingsService = new SettingsService();
export default settingsService;
