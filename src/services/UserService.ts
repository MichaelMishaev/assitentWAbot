import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import { User } from '../types/index.js';

/**
 * UserService - Handles user-related operations
 * Created for morning notification feature and general user management
 */
export class UserService {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Get all users from the database
   * @returns Array of all users
   */
  async getAllUsers(): Promise<User[]> {
    try {
      const query = `
        SELECT
          id,
          phone,
          username,
          password_hash as "passwordHash",
          name,
          locale,
          timezone,
          prefs_jsonb as "prefsJsonb",
          calendar_provider as "calendarProvider",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM users
        ORDER BY created_at DESC
      `;

      const result = await this.dbPool.query(query);

      logger.info('Retrieved all users', { count: result.rows.length });
      return result.rows as User[];
    } catch (error) {
      logger.error('Failed to get all users', { error });
      throw error;
    }
  }

  /**
   * Get users with morning notifications enabled
   * @returns Array of users who have morning notifications enabled
   */
  async getUsersWithMorningNotifications(): Promise<User[]> {
    try {
      const query = `
        SELECT
          id,
          phone,
          username,
          password_hash as "passwordHash",
          name,
          locale,
          timezone,
          prefs_jsonb as "prefsJsonb",
          calendar_provider as "calendarProvider",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM users
        WHERE prefs_jsonb->'morningNotification'->>'enabled' = 'true'
        ORDER BY timezone, name
      `;

      const result = await this.dbPool.query(query);

      logger.info('Retrieved users with morning notifications enabled', {
        count: result.rows.length
      });

      return result.rows as User[];
    } catch (error) {
      logger.error('Failed to get users with morning notifications', { error });
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param userId User ID
   * @returns User or null if not found
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const query = `
        SELECT
          id,
          phone,
          username,
          password_hash as "passwordHash",
          name,
          locale,
          timezone,
          prefs_jsonb as "prefsJsonb",
          calendar_provider as "calendarProvider",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM users
        WHERE id = $1
      `;

      const result = await this.dbPool.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as User;
    } catch (error) {
      logger.error('Failed to get user by ID', { userId, error });
      throw error;
    }
  }

  /**
   * Get total user count
   * @returns Total number of users
   */
  async getUserCount(): Promise<number> {
    try {
      const query = 'SELECT COUNT(*) as count FROM users';
      const result = await this.dbPool.query(query);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to get user count', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const userService = new UserService();
export default userService;
