import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Message stored in Redis
 */
export interface RedisMessage {
  timestamp: string;
  messageId: string;
  userId: string;
  phone: string;
  direction: 'incoming' | 'outgoing';
  messageText: string;
  messageType?: string;
  conversationState?: string;
  intent?: {
    intent: string;
    confidence: number;
    entities?: any;
  };
  processingTime?: number;
  error?: string;
  metadata?: any;
  status?: 'pending' | 'fixed';  // For bug tracking
  fixedAt?: string;
  fixedBy?: string;
  commitHash?: string;
}

/**
 * Redis-based message logger with instant persistence
 * No buffering - messages are saved immediately to survive crashes
 */
class RedisMessageLogger {
  private readonly MESSAGE_LIST_KEY = 'user_messages';
  private readonly BUG_PENDING_KEY = 'bugs:pending';
  private readonly BUG_FIXED_KEY = 'bugs:fixed';

  /**
   * Log incoming message from user
   * Instantly saved to Redis (no buffering)
   */
  async logIncomingMessage(data: {
    messageId: string;
    userId: string;
    phone: string;
    messageText: string;
    messageType?: string;
    conversationState?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      const message: RedisMessage = {
        timestamp: new Date().toISOString(),
        messageId: data.messageId,
        userId: data.userId,
        phone: data.phone,
        direction: 'incoming',
        messageText: data.messageText,
        messageType: data.messageType || 'text',
        conversationState: data.conversationState,
        metadata: data.metadata,
        // If message starts with #, mark as pending bug
        status: data.messageText.trim().startsWith('#') ? 'pending' : undefined,
      };

      // Save to main messages list
      await redis.lpush(this.MESSAGE_LIST_KEY, JSON.stringify(message));

      // If it's a bug report, also save to pending bugs list for quick access
      if (message.status === 'pending') {
        await redis.lpush(this.BUG_PENDING_KEY, JSON.stringify(message));
        logger.info('Bug report logged', { userId: data.userId, text: data.messageText });
      }
    } catch (error) {
      logger.error('Failed to log incoming message to Redis', { userId: data.userId, error });
    }
  }

  /**
   * Log outgoing message to user (bot response)
   */
  async logOutgoingMessage(data: {
    messageId: string;
    userId: string;
    phone: string;
    messageText: string;
    conversationState?: string;
    processingTime?: number;
    metadata?: any;
  }): Promise<void> {
    try {
      const message: RedisMessage = {
        timestamp: new Date().toISOString(),
        messageId: data.messageId,
        userId: data.userId,
        phone: data.phone,
        direction: 'outgoing',
        messageText: data.messageText,
        conversationState: data.conversationState,
        processingTime: data.processingTime,
        metadata: data.metadata,
      };

      await redis.lpush(this.MESSAGE_LIST_KEY, JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to log outgoing message to Redis', { userId: data.userId, error });
    }
  }

  /**
   * Log error in message processing
   */
  async logError(data: {
    messageId: string;
    userId: string;
    phone: string;
    error: string;
  }): Promise<void> {
    try {
      const message: RedisMessage = {
        timestamp: new Date().toISOString(),
        messageId: data.messageId,
        userId: data.userId,
        phone: data.phone,
        direction: 'incoming',
        messageText: '[ERROR]',
        error: data.error,
      };

      await redis.lpush(this.MESSAGE_LIST_KEY, JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to log error to Redis', { userId: data.userId, error });
    }
  }

  /**
   * Get all pending bug reports (status !== 'fixed')
   * This is what Claude Code will use to find bugs to fix
   */
  async getPendingBugs(): Promise<RedisMessage[]> {
    try {
      const messages = await redis.lrange(this.MESSAGE_LIST_KEY, 0, -1);
      const bugs = messages
        .map(m => {
          try {
            return JSON.parse(m);
          } catch {
            return null;
          }
        })
        .filter((m): m is RedisMessage =>
          m !== null &&
          m.direction === 'incoming' &&
          m.messageText.trim().startsWith('#') &&
          m.status === 'pending'
        );

      return bugs;
    } catch (error) {
      logger.error('Failed to get pending bugs from Redis', { error });
      return [];
    }
  }

  /**
   * Mark a bug as fixed (called by Claude Code after fixing)
   */
  async markBugFixed(bugText: string, options?: {
    commitHash?: string;
    fixedBy?: string;
  }): Promise<boolean> {
    try {
      const messages = await redis.lrange(this.MESSAGE_LIST_KEY, 0, -1);

      // Find the bug message
      const index = messages.findIndex(m => {
        try {
          const parsed = JSON.parse(m);
          return parsed.messageText === bugText && parsed.status === 'pending';
        } catch {
          return false;
        }
      });

      if (index === -1) {
        logger.warn('Bug not found to mark as fixed', { bugText });
        return false;
      }

      // Update the message
      const bugMessage = JSON.parse(messages[index]);
      const updatedMessage: RedisMessage = {
        ...bugMessage,
        status: 'fixed',
        fixedAt: new Date().toISOString(),
        fixedBy: options?.fixedBy || 'claude-code',
        commitHash: options?.commitHash,
      };

      // Update in main list
      await redis.lset(this.MESSAGE_LIST_KEY, index, JSON.stringify(updatedMessage));

      // Move from pending to fixed
      await redis.lrem(this.BUG_PENDING_KEY, 1, JSON.stringify(bugMessage));
      await redis.lpush(this.BUG_FIXED_KEY, JSON.stringify(updatedMessage));

      logger.info('Bug marked as fixed', {
        bugText,
        fixedAt: updatedMessage.fixedAt,
        commitHash: options?.commitHash
      });

      return true;
    } catch (error) {
      logger.error('Failed to mark bug as fixed', { bugText, error });
      return false;
    }
  }

  /**
   * Get all messages (for debugging/analytics)
   */
  async getAllMessages(limit: number = 100): Promise<RedisMessage[]> {
    try {
      const messages = await redis.lrange(this.MESSAGE_LIST_KEY, 0, limit - 1);
      return messages
        .map(m => {
          try {
            return JSON.parse(m);
          } catch {
            return null;
          }
        })
        .filter((m): m is RedisMessage => m !== null);
    } catch (error) {
      logger.error('Failed to get messages from Redis', { error });
      return [];
    }
  }

  /**
   * Get messages for a specific user
   */
  async getUserMessages(userId: string, limit: number = 50): Promise<RedisMessage[]> {
    try {
      const messages = await this.getAllMessages(1000);
      return messages
        .filter(m => m.userId === userId)
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to get user messages', { userId, error });
      return [];
    }
  }

  /**
   * Search messages by text
   */
  async searchMessages(searchText: string, limit: number = 50): Promise<RedisMessage[]> {
    try {
      const messages = await this.getAllMessages(1000);
      return messages
        .filter(m => m.messageText.toLowerCase().includes(searchText.toLowerCase()))
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to search messages', { searchText, error });
      return [];
    }
  }

  /**
   * Get bug history (all bugs - pending and fixed)
   */
  async getBugHistory(): Promise<RedisMessage[]> {
    try {
      const messages = await redis.lrange(this.MESSAGE_LIST_KEY, 0, -1);
      return messages
        .map(m => {
          try {
            return JSON.parse(m);
          } catch {
            return null;
          }
        })
        .filter((m): m is RedisMessage =>
          m !== null &&
          m.messageText.trim().startsWith('#')
        );
    } catch (error) {
      logger.error('Failed to get bug history', { error });
      return [];
    }
  }

  /**
   * Clean old messages (keep last N messages)
   */
  async cleanOldMessages(keepLast: number = 10000): Promise<void> {
    try {
      await redis.ltrim(this.MESSAGE_LIST_KEY, 0, keepLast - 1);
      logger.info('Cleaned old messages from Redis', { keepLast });
    } catch (error) {
      logger.error('Failed to clean old messages', { error });
    }
  }
}

// Export singleton instance
export const redisMessageLogger = new RedisMessageLogger();
export default redisMessageLogger;
