import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * RateLimiter - Multi-layer rate limiting service for WhatsApp bot
 *
 * Prevents WhatsApp bans by implementing:
 * - Per-user inbound message limits (30 msg/min)
 * - Per-user outbound message limits (20 msg/min)
 * - Global system-wide limits (5000 msg/hour)
 * - Quality tracking (message delivery and block detection)
 *
 * Uses Redis sorted sets for sliding window rate limiting
 * and Redis counters for global limits.
 */
export class RateLimiter {
  // Rate limit thresholds
  private readonly INBOUND_LIMIT = 30; // messages per minute
  private readonly INBOUND_WINDOW = 60; // seconds
  private readonly INBOUND_BAN_DURATION = 5 * 60; // 5 minutes in seconds

  private readonly OUTBOUND_LIMIT = 20; // messages per minute
  private readonly OUTBOUND_WINDOW = 60; // seconds

  private readonly GLOBAL_LIMIT = 5000; // messages per hour
  private readonly GLOBAL_WINDOW = 60 * 60; // 1 hour in seconds

  // Quality tracking thresholds
  private readonly BLOCK_RATE_THRESHOLD = 0.05; // 5%
  private readonly QUALITY_WINDOW = 24 * 60 * 60; // 24 hours in seconds

  // Redis key prefixes
  private readonly INBOUND_KEY_PREFIX = 'ratelimit:inbound:';
  private readonly OUTBOUND_KEY_PREFIX = 'ratelimit:outbound:';
  private readonly GLOBAL_KEY = 'ratelimit:global';
  private readonly BAN_KEY_PREFIX = 'ratelimit:ban:';
  private readonly QUALITY_KEY_PREFIX = 'quality:';

  /**
   * Check if user is within inbound message limit
   * Uses sliding window algorithm with Redis sorted sets
   * @param userId - User identifier
   * @returns true if within limit, false if limit exceeded
   */
  async checkInboundLimit(userId: string): Promise<boolean> {
    try {
      // Check if user is temporarily banned
      const banKey = this.getBanKey(userId);
      const isBanned = await redis.exists(banKey);

      if (isBanned) {
        const ttl = await redis.ttl(banKey);
        logger.warn('User is temporarily banned', {
          userId,
          remainingSeconds: ttl
        });
        return false;
      }

      const key = this.getInboundKey(userId);
      const now = Date.now();
      const windowStart = now - (this.INBOUND_WINDOW * 1000);

      // Remove old entries outside the sliding window
      await redis.zremrangebyscore(key, 0, windowStart);

      // Count messages in current window
      const count = await redis.zcard(key);

      if (count >= this.INBOUND_LIMIT) {
        logger.warn('Inbound rate limit exceeded', {
          userId,
          count,
          limit: this.INBOUND_LIMIT
        });

        // Apply temporary ban
        await redis.setex(
          banKey,
          this.INBOUND_BAN_DURATION,
          'banned'
        );

        logger.info('User temporarily banned', {
          userId,
          duration: this.INBOUND_BAN_DURATION
        });

        return false;
      }

      // Add current message to sorted set
      await redis.zadd(key, now, `${now}`);

      // Set expiry on the key (cleanup)
      await redis.expire(key, this.INBOUND_WINDOW * 2);

      logger.debug('Inbound limit check passed', {
        userId,
        count: count + 1,
        limit: this.INBOUND_LIMIT
      });

      return true;
    } catch (error) {
      logger.error('Failed to check inbound rate limit', { userId, error });
      // Fail open - allow the message in case of Redis errors
      return true;
    }
  }

  /**
   * Check if user is within outbound message limit
   * @param userId - User identifier
   * @returns true if within limit, false if limit exceeded (should queue)
   */
  async checkOutboundLimit(userId: string): Promise<boolean> {
    try {
      const key = this.getOutboundKey(userId);
      const now = Date.now();
      const windowStart = now - (this.OUTBOUND_WINDOW * 1000);

      // Remove old entries outside the sliding window
      await redis.zremrangebyscore(key, 0, windowStart);

      // Count messages in current window
      const count = await redis.zcard(key);

      if (count >= this.OUTBOUND_LIMIT) {
        logger.warn('Outbound rate limit exceeded', {
          userId,
          count,
          limit: this.OUTBOUND_LIMIT
        });
        return false;
      }

      // Add current message to sorted set
      await redis.zadd(key, now, `${now}`);

      // Set expiry on the key (cleanup)
      await redis.expire(key, this.OUTBOUND_WINDOW * 2);

      logger.debug('Outbound limit check passed', {
        userId,
        count: count + 1,
        limit: this.OUTBOUND_LIMIT
      });

      return true;
    } catch (error) {
      logger.error('Failed to check outbound rate limit', { userId, error });
      // Fail open - allow the message in case of Redis errors
      return true;
    }
  }

  /**
   * Check global system-wide message limit
   * Uses Redis counter with hourly reset
   * @returns true if within limit, false if limit exceeded (pause all sends)
   */
  async checkGlobalLimit(): Promise<boolean> {
    try {
      const key = this.GLOBAL_KEY;
      const now = Date.now();
      const currentHour = Math.floor(now / (this.GLOBAL_WINDOW * 1000));
      const hourKey = `${key}:${currentHour}`;

      // Get current count
      const countStr = await redis.get(hourKey);
      const count = countStr ? parseInt(countStr, 10) : 0;

      if (count >= this.GLOBAL_LIMIT) {
        logger.error('Global rate limit exceeded - pausing all sends', {
          count,
          limit: this.GLOBAL_LIMIT,
          hour: currentHour
        });

        // Alert admin (via error log that should be monitored)
        logger.error('CRITICAL: Global rate limit reached - potential WhatsApp ban risk', {
          count,
          limit: this.GLOBAL_LIMIT,
          timestamp: new Date().toISOString()
        });

        return false;
      }

      // Increment counter
      await redis.incr(hourKey);

      // Set expiry to cleanup old keys (2 hours to be safe)
      await redis.expire(hourKey, this.GLOBAL_WINDOW * 2);

      logger.debug('Global limit check passed', {
        count: count + 1,
        limit: this.GLOBAL_LIMIT,
        hour: currentHour
      });

      return true;
    } catch (error) {
      logger.error('Failed to check global rate limit', { error });
      // Fail closed for global limits - reject to be safe
      return false;
    }
  }

  /**
   * Track a message sent to a user
   * Used for quality metrics and block detection
   * @param userId - User identifier
   */
  async trackMessageSent(userId: string): Promise<void> {
    try {
      const key = this.getQualityKey(userId);
      const now = Date.now();

      // Increment sent counter
      await redis.hincrby(key, 'sent', 1);
      await redis.hset(key, 'lastInteraction', now);

      // Set expiry for automatic cleanup
      await redis.expire(key, this.QUALITY_WINDOW);

      logger.debug('Message sent tracked', { userId });
    } catch (error) {
      logger.error('Failed to track message sent', { userId, error });
      // Non-critical, continue
    }
  }

  /**
   * Track a message read by a user
   * Used for quality metrics
   * @param userId - User identifier
   */
  async trackMessageRead(userId: string): Promise<void> {
    try {
      const key = this.getQualityKey(userId);
      const now = Date.now();

      // Increment read counter
      await redis.hincrby(key, 'read', 1);
      await redis.hset(key, 'lastInteraction', now);

      // Set expiry for automatic cleanup
      await redis.expire(key, this.QUALITY_WINDOW);

      logger.debug('Message read tracked', { userId });
    } catch (error) {
      logger.error('Failed to track message read', { userId, error });
      // Non-critical, continue
    }
  }

  /**
   * Track when a user blocks the bot
   * Triggers alert if block rate exceeds threshold
   * @param userId - User identifier
   */
  async trackUserBlocked(userId: string): Promise<void> {
    try {
      const key = this.getQualityKey(userId);

      // Mark as blocked
      await redis.hset(key, 'blocked', '1');
      await redis.hset(key, 'blockedAt', Date.now());

      // Set expiry for automatic cleanup
      await redis.expire(key, this.QUALITY_WINDOW);

      logger.warn('User blocked the bot', { userId });

      // Check overall block rate
      await this.checkBlockRate();
    } catch (error) {
      logger.error('Failed to track user blocked', { userId, error });
    }
  }

  /**
   * Get quality metrics for a specific user
   * @param userId - User identifier
   * @returns Quality metrics object
   */
  async getQualityMetrics(userId: string): Promise<{
    sent: number;
    read: number;
    blocked: boolean;
    readRate: number;
  }> {
    try {
      const key = this.getQualityKey(userId);
      const data = await redis.hgetall(key);

      const sent = parseInt(data.sent || '0', 10);
      const read = parseInt(data.read || '0', 10);
      const blocked = data.blocked === '1';
      const readRate = sent > 0 ? read / sent : 0;

      return { sent, read, blocked, readRate };
    } catch (error) {
      logger.error('Failed to get quality metrics', { userId, error });
      return { sent: 0, read: 0, blocked: false, readRate: 0 };
    }
  }

  /**
   * Check overall block rate across all users
   * Alerts if rate exceeds threshold
   */
  private async checkBlockRate(): Promise<void> {
    try {
      const pattern = `${this.QUALITY_KEY_PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        return;
      }

      let totalUsers = 0;
      let blockedUsers = 0;

      for (const key of keys) {
        totalUsers++;
        const blocked = await redis.hget(key, 'blocked');
        if (blocked === '1') {
          blockedUsers++;
        }
      }

      const blockRate = totalUsers > 0 ? blockedUsers / totalUsers : 0;

      if (blockRate > this.BLOCK_RATE_THRESHOLD) {
        logger.error('CRITICAL: Block rate exceeds threshold', {
          blockRate: (blockRate * 100).toFixed(2) + '%',
          threshold: (this.BLOCK_RATE_THRESHOLD * 100) + '%',
          blockedUsers,
          totalUsers,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.info('Block rate check', {
          blockRate: (blockRate * 100).toFixed(2) + '%',
          blockedUsers,
          totalUsers
        });
      }
    } catch (error) {
      logger.error('Failed to check block rate', { error });
    }
  }

  /**
   * Get current rate limit status for a user
   * @param userId - User identifier
   * @returns Status object with current counts and limits
   */
  async getRateLimitStatus(userId: string): Promise<{
    inbound: { count: number; limit: number; banned: boolean };
    outbound: { count: number; limit: number };
  }> {
    try {
      const now = Date.now();
      const inboundWindowStart = now - (this.INBOUND_WINDOW * 1000);
      const outboundWindowStart = now - (this.OUTBOUND_WINDOW * 1000);

      // Check inbound
      const inboundKey = this.getInboundKey(userId);
      await redis.zremrangebyscore(inboundKey, 0, inboundWindowStart);
      const inboundCount = await redis.zcard(inboundKey);
      const banKey = this.getBanKey(userId);
      const isBanned = await redis.exists(banKey) === 1;

      // Check outbound
      const outboundKey = this.getOutboundKey(userId);
      await redis.zremrangebyscore(outboundKey, 0, outboundWindowStart);
      const outboundCount = await redis.zcard(outboundKey);

      return {
        inbound: {
          count: inboundCount,
          limit: this.INBOUND_LIMIT,
          banned: isBanned
        },
        outbound: {
          count: outboundCount,
          limit: this.OUTBOUND_LIMIT
        }
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', { userId, error });
      return {
        inbound: { count: 0, limit: this.INBOUND_LIMIT, banned: false },
        outbound: { count: 0, limit: this.OUTBOUND_LIMIT }
      };
    }
  }

  /**
   * Reset rate limits for a user (admin function)
   * @param userId - User identifier
   */
  async resetUserLimits(userId: string): Promise<void> {
    try {
      const inboundKey = this.getInboundKey(userId);
      const outboundKey = this.getOutboundKey(userId);
      const banKey = this.getBanKey(userId);
      const qualityKey = this.getQualityKey(userId);

      await redis.del(inboundKey);
      await redis.del(outboundKey);
      await redis.del(banKey);
      await redis.del(qualityKey);

      logger.info('User rate limits reset', { userId });
    } catch (error) {
      logger.error('Failed to reset user limits', { userId, error });
      throw error;
    }
  }

  // Redis key generators
  private getInboundKey(userId: string): string {
    return `${this.INBOUND_KEY_PREFIX}${userId}`;
  }

  private getOutboundKey(userId: string): string {
    return `${this.OUTBOUND_KEY_PREFIX}${userId}`;
  }

  private getBanKey(userId: string): string {
    return `${this.BAN_KEY_PREFIX}${userId}`;
  }

  private getQualityKey(userId: string): string {
    return `${this.QUALITY_KEY_PREFIX}${userId}`;
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
export default rateLimiter;
