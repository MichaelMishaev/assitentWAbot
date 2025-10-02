import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { redis } from '../config/redis';
import logger from '../utils/logger';
import { User } from '../types';

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
   * Register a new user
   */
  async registerUser(phone: string, name: string, pin: string): Promise<User> {
    try {
      // Check if user already exists
      const existingUser = await this.getUserByPhone(phone);
      if (existingUser) {
        throw new Error('User already exists');
      }

      // Validate PIN (4 digits)
      if (!/^\d{4}$/.test(pin)) {
        throw new Error('PIN must be exactly 4 digits');
      }

      // Hash the PIN
      const passwordHash = await bcrypt.hash(pin, SALT_ROUNDS);

      // Insert new user with default values
      const result = await pool.query(
        `INSERT INTO users (phone, name, password_hash, locale, timezone, calendar_provider)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, phone, username, password_hash as "passwordHash", name, locale, timezone,
                   prefs_jsonb as "prefsJsonb", calendar_provider as "calendarProvider",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [phone, name, passwordHash, 'he', 'Asia/Jerusalem', 'LOCAL']
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
   * Login user with phone and PIN
   * Returns user on success, null on invalid credentials, throws error on lockout
   */
  async loginUser(phone: string, pin: string): Promise<User | null> {
    try {
      // Check if user is locked out
      const isLockedOut = await this.checkLockout(phone);
      if (isLockedOut) {
        logger.warn('Login attempt on locked account', { phone });
        throw new Error('Account is temporarily locked due to too many failed attempts. Please try again in 5 minutes.');
      }

      // Get user
      const user = await this.getUserByPhone(phone);
      if (!user) {
        logger.warn('Login attempt for non-existent user', { phone });
        return null;
      }

      // Verify PIN
      const isValidPin = await bcrypt.compare(pin, user.passwordHash);
      if (!isValidPin) {
        const attempts = await this.incrementFailedAttempts(phone);
        logger.warn('Invalid PIN attempt', { phone, attempts });

        if (attempts >= MAX_FAILED_ATTEMPTS) {
          throw new Error(`יותר מדי ניסיונות כושלים. החשבון נעול ל-5 דקות.`);
        }

        // Throw error with remaining attempts info
        const remaining = MAX_FAILED_ATTEMPTS - attempts;
        throw new Error(`PIN שגוי. נותרו ${remaining} ניסיונות.`);
      }

      // Successful login - clear failed attempts
      await this.clearFailedAttempts(phone);
      logger.info('User logged in successfully', { userId: user.id, phone });

      return user;
    } catch (error) {
      logger.error('Error during login', { phone, error });
      throw error;
    }
  }
}

export default new AuthService();
