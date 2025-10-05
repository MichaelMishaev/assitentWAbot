import { redis } from '../config/redis.js';
import { ConversationState, Session } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * StateManager - Redis-based conversation state tracking for WhatsApp bot
 *
 * Manages user conversation states with:
 * - 30-day session expiry
 * - Per-state timeout configurations
 * - Automatic timeout handling
 */
export class StateManager {
  private readonly SESSION_PREFIX = 'session:';
  private readonly SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
  private readonly DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Timeout configurations per state (in milliseconds)
  private readonly STATE_TIMEOUTS: Partial<Record<ConversationState, number>> = {
    [ConversationState.IDLE]: 30 * 60 * 1000, // 30 minutes
    [ConversationState.MAIN_MENU]: 10 * 60 * 1000, // 10 minutes
    [ConversationState.ADDING_EVENT_NAME]: 5 * 60 * 1000,
    [ConversationState.ADDING_EVENT_DATE]: 5 * 60 * 1000,
    [ConversationState.ADDING_EVENT_TIME]: 5 * 60 * 1000,
    [ConversationState.ADDING_EVENT_LOCATION]: 5 * 60 * 1000,
    [ConversationState.ADDING_EVENT_CONFIRM]: 10 * 60 * 1000,
    [ConversationState.ADDING_REMINDER_TITLE]: 5 * 60 * 1000,
    [ConversationState.ADDING_REMINDER_DATETIME]: 5 * 60 * 1000,
    [ConversationState.ADDING_REMINDER_RECURRENCE]: 5 * 60 * 1000,
    [ConversationState.ADDING_REMINDER_CONFIRM]: 10 * 60 * 1000,
    [ConversationState.LISTING_EVENTS]: 5 * 60 * 1000,
    [ConversationState.DELETING_EVENT]: 5 * 60 * 1000,
    [ConversationState.ADDING_CONTACT]: 5 * 60 * 1000,
    [ConversationState.SETTINGS_MENU]: 10 * 60 * 1000,
    [ConversationState.DRAFT_MESSAGE]: 10 * 60 * 1000,
  };

  /**
   * Set conversation state for a user
   * @param userId - User identifier
   * @param state - New conversation state
   * @param context - Additional context data for the state
   */
  async setState(userId: string, state: ConversationState, context: any = {}): Promise<void> {
    try {
      const key = this.getSessionKey(userId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.SESSION_TTL * 1000);

      const session: Session = {
        userId,
        state,
        context,
        lastActivity: now,
        expiresAt,
      };

      await redis.setex(
        key,
        this.SESSION_TTL,
        JSON.stringify(session)
      );

      logger.debug('State set', { userId, state, context });
    } catch (error) {
      logger.error('Failed to set state', { userId, state, error });
      throw error;
    }
  }

  /**
   * Get conversation state for a user
   * Checks for timeout and handles it if needed
   * @param userId - User identifier
   * @returns Session object or null if not found/expired
   */
  async getState(userId: string): Promise<Session | null> {
    try {
      const key = this.getSessionKey(userId);
      const data = await redis.get(key);

      if (!data) {
        logger.debug('No session found', { userId });
        return null;
      }

      const session: Session = JSON.parse(data);

      // Convert date strings back to Date objects
      session.lastActivity = new Date(session.lastActivity);
      session.expiresAt = new Date(session.expiresAt);

      // Check for timeout
      const timeout = this.getTimeout(session.state);
      const timeSinceActivity = Date.now() - session.lastActivity.getTime();

      if (timeSinceActivity > timeout) {
        logger.info('Session timed out', {
          userId,
          state: session.state,
          timeSinceActivity: Math.floor(timeSinceActivity / 1000) + 's'
        });
        await this.handleTimeout(userId);
        return null;
      }

      logger.debug('State retrieved', { userId, state: session.state });
      return session;
    } catch (error) {
      logger.error('Failed to get state', { userId, error });
      throw error;
    }
  }

  /**
   * Clear conversation state for a user
   * @param userId - User identifier
   */
  async clearState(userId: string): Promise<void> {
    try {
      const key = this.getSessionKey(userId);
      await redis.del(key);
      logger.debug('State cleared', { userId });
    } catch (error) {
      logger.error('Failed to clear state', { userId, error });
      throw error;
    }
  }

  /**
   * Handle timeout for a user session
   * Sends timeout message and clears state
   * @param userId - User identifier
   */
  async handleTimeout(userId: string): Promise<void> {
    try {
      // TODO: Integrate with message provider to send timeout message
      // For now, just log the timeout event
      logger.info('Handling timeout', { userId });

      // Example timeout message (Hebrew):
      // "הפעולה בוטלה עקב חוסר פעילות. שלח /תפריט כדי להתחיל מחדש."
      // Translation: "Operation cancelled due to inactivity. Send /menu to start again."

      // TODO: When provider is integrated, use:
      // await messageProvider.sendMessage(userId, timeoutMessage);

      await this.clearState(userId);

      logger.info('Timeout handled successfully', { userId });
    } catch (error) {
      logger.error('Failed to handle timeout', { userId, error });
      throw error;
    }
  }

  /**
   * Get timeout duration for a specific state
   * @param state - Conversation state
   * @returns Timeout in milliseconds
   */
  private getTimeout(state: ConversationState): number {
    return this.STATE_TIMEOUTS[state] || this.DEFAULT_TIMEOUT;
  }

  /**
   * Generate Redis key for user session
   * @param userId - User identifier
   * @returns Redis key
   */
  private getSessionKey(userId: string): string {
    return `${this.SESSION_PREFIX}${userId}`;
  }

  /**
   * Get all active sessions (for monitoring/debugging)
   * @returns Array of active sessions
   */
  async getActiveSessions(): Promise<Session[]> {
    try {
      const pattern = `${this.SESSION_PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      const sessions: Session[] = [];

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const session: Session = JSON.parse(data);
          session.lastActivity = new Date(session.lastActivity);
          session.expiresAt = new Date(session.expiresAt);
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to get active sessions', { error });
      throw error;
    }
  }

  /**
   * Update context for existing session without changing state
   * @param userId - User identifier
   * @param contextUpdate - Context fields to update
   */
  async updateContext(userId: string, contextUpdate: Record<string, any>): Promise<void> {
    try {
      const session = await this.getState(userId);

      if (!session) {
        logger.warn('Cannot update context, no session found', { userId });
        return;
      }

      // Merge context
      const updatedContext = {
        ...session.context,
        ...contextUpdate,
      };

      await this.setState(userId, session.state, updatedContext);

      logger.debug('Context updated', { userId, contextUpdate });
    } catch (error) {
      logger.error('Failed to update context', { userId, error });
      throw error;
    }
  }

  /**
   * Add message to conversation history
   * Keeps last 10 messages for context
   * @param userId - User identifier
   * @param role - Message sender (user or assistant)
   * @param content - Message content
   */
  async addToHistory(userId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    try {
      const session = await this.getState(userId);

      if (!session) {
        logger.warn('Cannot add to history, no session found', { userId });
        return;
      }

      const history = session.conversationHistory || [];

      // Add new message
      history.push({
        role,
        content,
        timestamp: new Date()
      });

      // Keep only last 20 messages (increased from 10 for better context retention)
      // Research shows 15-20 messages optimal for multi-turn conversations
      const trimmedHistory = history.slice(-20);

      // Update session with new history
      const key = this.getSessionKey(userId);
      const updatedSession = {
        ...session,
        conversationHistory: trimmedHistory,
        lastActivity: new Date()
      };

      await redis.setex(
        key,
        this.SESSION_TTL,
        JSON.stringify(updatedSession)
      );

      logger.debug('Added to conversation history', { userId, role, messageLength: content.length });
    } catch (error) {
      logger.error('Failed to add to conversation history', { userId, error });
      throw error;
    }
  }

  /**
   * Get conversation history for a user
   * @param userId - User identifier
   * @returns Array of conversation messages
   */
  async getHistory(userId: string): Promise<Array<{ role: 'user' | 'assistant', content: string, timestamp: Date }>> {
    try {
      const session = await this.getState(userId);

      if (!session || !session.conversationHistory) {
        return [];
      }

      return session.conversationHistory;
    } catch (error) {
      logger.error('Failed to get conversation history', { userId, error });
      return [];
    }
  }
}

// Export singleton instance
export const stateManager = new StateManager();
export default stateManager;
