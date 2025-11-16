import bcrypt from 'bcrypt';
import { pool } from '../config/database.js';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { User } from '../types/index.js';

const SALT_ROUNDS = 10;
const LOCKOUT_DURATION_SECONDS = 300; // 5 minutes
const MAX_FAILED_ATTEMPTS = 3;
const FAILED_ATTEMPTS_KEY_PREFIX = 'auth:failed:';

export class AuthService {
  /**
   * Get user by phone number
   */
  async getUserByPhone(phone: string): Promise<User | null> {
    try {
      const result = await pool.query(
        'SELECT id, phone, username, password_hash as "passwordHash", name, locale, timezone, prefs_jsonb as "prefsJsonb", calendar_provider as "calendarProvider", created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE phone = $1',
        [phone]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as User;
    } catch (error) {
      logger.error('Error fetching user by phone', { phone, error });
      throw error;
    }
  }

  /**
   * Check if user is locked out due to failed login attempts
   */
  async checkLockout(phone: string): Promise<boolean> {
    try {
      const key = `${FAILED_ATTEMPTS_KEY_PREFIX}${phone}`;
      const attempts = await redis.get(key);

      if (!attempts) {
        return false;
      }

      const failedAttempts = parseInt(attempts, 10);
      return failedAttempts >= MAX_FAILED_ATTEMPTS;
    } catch (error) {
      logger.error('Error checking lockout status', { phone, error });
      // Fail open - don't lock out on Redis errors
      return false;
    }
  }

  /**
   * Increment failed login attempts and return current count
   */
  async incrementFailedAttempts(phone: string): Promise<number> {
    try {
      const key = `${FAILED_ATTEMPTS_KEY_PREFIX}${phone}`;
      const attempts = await redis.incr(key);

      // Set expiry only on first failed attempt
      if (attempts === 1) {
        await redis.expire(key, LOCKOUT_DURATION_SECONDS);
      }

      logger.warn('Failed login attempt', { phone, attempts });
      return attempts;
    } catch (error) {
      logger.error('Error incrementing failed attempts', { phone, error });
      // Return 0 on error to not block user
      return 0;
    }
  }

  /**
   * Clear failed login attempts (on successful login)
   */
  async clearFailedAttempts(phone: string): Promise<void> {
    try {
      const key = `${FAILED_ATTEMPTS_KEY_PREFIX}${phone}`;
      await redis.del(key);
    } catch (error) {
      logger.error('Error clearing failed attempts', { phone, error });
      // Non-critical error, continue
    }
  }

  /**
   * Register a new user (no PIN required)
   */
  async registerUser(phone: string, name: string): Promise<User> {
    try {
      // Check if user already exists
      const existingUser = await this.getUserByPhone(phone);
      if (existingUser) {
        throw new Error('User already exists');
      }

      // Generate a dummy password hash (not used, but DB requires it)
      const passwordHash = await bcrypt.hash(phone, SALT_ROUNDS);

      // Default preferences with morning notifications ENABLED
      const defaultPrefs = {
        morningNotification: {
          enabled: true,
          time: '08:00', // 8:00 AM Israel time
          days: [0, 1, 2, 3, 4, 5, 6], // All days (Sunday-Saturday)
          includeMemos: true
        }
      };

      // Insert new user with default values including morning notifications
      const result = await pool.query(
        `INSERT INTO users (phone, name, password_hash, locale, timezone, calendar_provider, prefs_jsonb)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, phone, username, password_hash as "passwordHash", name, locale, timezone,
                   prefs_jsonb as "prefsJsonb", calendar_provider as "calendarProvider",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [phone, name, passwordHash, 'he', 'Asia/Jerusalem', 'LOCAL', JSON.stringify(defaultPrefs)]
      );

      const user = result.rows[0] as User;
      logger.info('User registered successfully', { userId: user.id, phone });

      return user;
    } catch (error) {
      logger.error('Error registering user', { phone, error });
      throw error;
    }
  }

  /**
   * Login user (auto-login by phone only)
   * Returns user on success, null if user doesn't exist
   */
  async loginUser(phone: string): Promise<User | null> {
    try {
      // Get user
      const user = await this.getUserByPhone(phone);
      if (!user) {
        logger.warn('Login attempt for non-existent user', { phone });
        return null;
      }

      // Auto-login successful
      logger.info('User logged in successfully', { userId: user.id, phone });

      return user;
    } catch (error) {
      logger.error('Error during login', { phone, error });
      throw error;
    }
  }
}

export default new AuthService();
