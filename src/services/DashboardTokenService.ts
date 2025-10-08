import { redis } from '../config/redis.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

export interface DashboardToken {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export class DashboardTokenService {
  private readonly PREFIX = 'dashboard:token:';
  private readonly EXPIRY_SECONDS = 15 * 60; // 15 minutes

  /**
   * Generate a new dashboard token for a user
   */
  async generateToken(userId: string): Promise<string> {
    try {
      const token = uuidv4().replace(/-/g, '');
      const key = `${this.PREFIX}${token}`;

      const data: DashboardToken = {
        token,
        userId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.EXPIRY_SECONDS * 1000),
      };

      // Store in Redis with expiry
      await redis.setex(key, this.EXPIRY_SECONDS, JSON.stringify(data));

      logger.info('Dashboard token generated', { userId, token: token.substring(0, 8) + '...' });
      return token;
    } catch (error) {
      logger.error('Failed to generate dashboard token', { userId, error });
      throw new Error('Failed to generate dashboard token');
    }
  }

  /**
   * Validate and retrieve token data
   */
  async validateToken(token: string): Promise<DashboardToken | null> {
    try {
      const key = `${this.PREFIX}${token}`;
      const data = await redis.get(key);

      if (!data) {
        logger.warn('Invalid or expired dashboard token', { token: token.substring(0, 8) + '...' });
        return null;
      }

      const tokenData: DashboardToken = JSON.parse(data);

      // Check if expired (double-check)
      if (new Date() > new Date(tokenData.expiresAt)) {
        await this.revokeToken(token);
        return null;
      }

      return tokenData;
    } catch (error) {
      logger.error('Failed to validate dashboard token', { token: token.substring(0, 8) + '...', error });
      return null;
    }
  }

  /**
   * Revoke a token (delete from Redis)
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const key = `${this.PREFIX}${token}`;
      await redis.del(key);
      logger.info('Dashboard token revoked', { token: token.substring(0, 8) + '...' });
    } catch (error) {
      logger.error('Failed to revoke dashboard token', { token: token.substring(0, 8) + '...', error });
    }
  }

  /**
   * Get remaining time for a token (in seconds)
   */
  async getTokenTTL(token: string): Promise<number> {
    try {
      const key = `${this.PREFIX}${token}`;
      const ttl = await redis.ttl(key);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      logger.error('Failed to get token TTL', { token: token.substring(0, 8) + '...', error });
      return 0;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      const pattern = `${this.PREFIX}*`;
      const keys = await redis.keys(pattern);

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const tokenData: DashboardToken = JSON.parse(data);
          if (tokenData.userId === userId) {
            await redis.del(key);
          }
        }
      }

      logger.info('All dashboard tokens revoked for user', { userId });
    } catch (error) {
      logger.error('Failed to revoke all user tokens', { userId, error });
    }
  }
}

export const dashboardTokenService = new DashboardTokenService();
