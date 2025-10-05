import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';

export interface MessageLog {
  id: string;
  userId: string;
  phone: string;
  messageType: 'incoming' | 'outgoing';
  content: string;
  intent?: string;
  conversationState?: string;
  confidence?: number;
  processingTime?: number;
  hasError: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface MessageAnalytics {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  errorRate: number;
  avgProcessingTime: number;
  topIntents: Array<{ intent: string; count: number }>;
  topStates: Array<{ state: string; count: number }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
  dailyDistribution: Array<{ date: string; count: number }>;
}

export class MessageLogger {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Log an incoming message from user
   */
  async logIncomingMessage(
    userId: string,
    phone: string,
    content: string,
    options?: {
      intent?: string;
      conversationState?: string;
      confidence?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO message_logs (
          user_id, phone, message_type, content, intent,
          conversation_state, confidence, has_error, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      await this.dbPool.query(query, [
        userId,
        phone,
        'incoming',
        content,
        options?.intent || null,
        options?.conversationState || null,
        options?.confidence || null,
        false,
        JSON.stringify(options?.metadata || {}),
      ]);
    } catch (error) {
      // Don't throw - logging failures shouldn't break the app
      logger.error('Failed to log incoming message', { userId, error });
    }
  }

  /**
   * Log an outgoing message to user
   */
  async logOutgoingMessage(
    userId: string,
    phone: string,
    content: string,
    options?: {
      conversationState?: string;
      processingTime?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO message_logs (
          user_id, phone, message_type, content,
          conversation_state, processing_time, has_error, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await this.dbPool.query(query, [
        userId,
        phone,
        'outgoing',
        content,
        options?.conversationState || null,
        options?.processingTime || null,
        false,
        JSON.stringify(options?.metadata || {}),
      ]);
    } catch (error) {
      logger.error('Failed to log outgoing message', { userId, error });
    }
  }

  /**
   * Log an error during message processing
   */
  async logMessageError(
    userId: string,
    phone: string,
    content: string,
    errorMessage: string,
    options?: {
      intent?: string;
      conversationState?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO message_logs (
          user_id, phone, message_type, content, intent,
          conversation_state, has_error, error_message, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      await this.dbPool.query(query, [
        userId,
        phone,
        'incoming',
        content,
        options?.intent || null,
        options?.conversationState || null,
        true,
        errorMessage,
        JSON.stringify(options?.metadata || {}),
      ]);
    } catch (error) {
      logger.error('Failed to log message error', { userId, error });
    }
  }

  /**
   * Get messages for a specific user
   */
  async getUserMessages(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<MessageLog[]> {
    try {
      const query = `
        SELECT * FROM message_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.dbPool.query(query, [userId, limit, offset]);
      return result.rows.map(row => this.mapRowToLog(row));
    } catch (error) {
      logger.error('Failed to get user messages', { userId, error });
      return [];
    }
  }

  /**
   * Get conversation between user and bot (chronological)
   */
  async getConversation(
    userId: string,
    since?: Date,
    limit: number = 50
  ): Promise<MessageLog[]> {
    try {
      const query = since
        ? `
          SELECT * FROM message_logs
          WHERE user_id = $1 AND created_at >= $2
          ORDER BY created_at ASC
          LIMIT $3
        `
        : `
          SELECT * FROM message_logs
          WHERE user_id = $1
          ORDER BY created_at ASC
          LIMIT $2
        `;

      const params = since ? [userId, since, limit] : [userId, limit];
      const result = await this.dbPool.query(query, params);
      return result.rows.map(row => this.mapRowToLog(row));
    } catch (error) {
      logger.error('Failed to get conversation', { userId, error });
      return [];
    }
  }

  /**
   * Get analytics for a user or all users
   */
  async getAnalytics(
    userId?: string,
    since?: Date,
    until?: Date
  ): Promise<MessageAnalytics> {
    try {
      const baseQuery = userId
        ? 'WHERE user_id = $1'
        : 'WHERE 1=1';

      let paramIndex = userId ? 2 : 1;
      const params: any[] = userId ? [userId] : [];

      let dateFilter = '';
      if (since) {
        dateFilter += ` AND created_at >= $${paramIndex++}`;
        params.push(since);
      }
      if (until) {
        dateFilter += ` AND created_at <= $${paramIndex++}`;
        params.push(until);
      }

      // Total counts
      const countQuery = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN message_type = 'incoming' THEN 1 END) as incoming,
          COUNT(CASE WHEN message_type = 'outgoing' THEN 1 END) as outgoing,
          COUNT(CASE WHEN has_error = true THEN 1 END) as errors,
          AVG(CASE WHEN processing_time IS NOT NULL THEN processing_time END) as avg_processing_time
        FROM message_logs
        ${baseQuery}${dateFilter}
      `;

      const countResult = await this.dbPool.query(countQuery, params);
      const counts = countResult.rows[0];

      // Top intents
      const intentQuery = `
        SELECT intent, COUNT(*) as count
        FROM message_logs
        ${baseQuery}${dateFilter}
        AND intent IS NOT NULL
        GROUP BY intent
        ORDER BY count DESC
        LIMIT 10
      `;

      const intentResult = await this.dbPool.query(intentQuery, params);

      // Top states
      const stateQuery = `
        SELECT conversation_state, COUNT(*) as count
        FROM message_logs
        ${baseQuery}${dateFilter}
        AND conversation_state IS NOT NULL
        GROUP BY conversation_state
        ORDER BY count DESC
        LIMIT 10
      `;

      const stateResult = await this.dbPool.query(stateQuery, params);

      // Hourly distribution
      const hourlyQuery = `
        SELECT
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Jerusalem') as hour,
          COUNT(*) as count
        FROM message_logs
        ${baseQuery}${dateFilter}
        GROUP BY hour
        ORDER BY hour
      `;

      const hourlyResult = await this.dbPool.query(hourlyQuery, params);

      // Daily distribution (last 7 days)
      const dailyQuery = `
        SELECT
          DATE(created_at AT TIME ZONE 'Asia/Jerusalem') as date,
          COUNT(*) as count
        FROM message_logs
        ${baseQuery}${dateFilter}
        GROUP BY date
        ORDER BY date DESC
        LIMIT 7
      `;

      const dailyResult = await this.dbPool.query(dailyQuery, params);

      return {
        totalMessages: parseInt(counts.total),
        incomingMessages: parseInt(counts.incoming),
        outgoingMessages: parseInt(counts.outgoing),
        errorRate: counts.total > 0 ? (parseInt(counts.errors) / parseInt(counts.total)) * 100 : 0,
        avgProcessingTime: parseFloat(counts.avg_processing_time) || 0,
        topIntents: intentResult.rows.map(r => ({
          intent: r.intent,
          count: parseInt(r.count)
        })),
        topStates: stateResult.rows.map(r => ({
          state: r.conversation_state,
          count: parseInt(r.count)
        })),
        hourlyDistribution: hourlyResult.rows.map(r => ({
          hour: parseInt(r.hour),
          count: parseInt(r.count)
        })),
        dailyDistribution: dailyResult.rows.map(r => ({
          date: r.date,
          count: parseInt(r.count)
        }))
      };
    } catch (error) {
      logger.error('Failed to get analytics', { userId, error });
      return {
        totalMessages: 0,
        incomingMessages: 0,
        outgoingMessages: 0,
        errorRate: 0,
        avgProcessingTime: 0,
        topIntents: [],
        topStates: [],
        hourlyDistribution: [],
        dailyDistribution: []
      };
    }
  }

  /**
   * Search messages by content
   */
  async searchMessages(
    searchTerm: string,
    userId?: string,
    limit: number = 50
  ): Promise<MessageLog[]> {
    try {
      const query = userId
        ? `
          SELECT * FROM message_logs
          WHERE user_id = $1 AND content ILIKE $2
          ORDER BY created_at DESC
          LIMIT $3
        `
        : `
          SELECT * FROM message_logs
          WHERE content ILIKE $1
          ORDER BY created_at DESC
          LIMIT $2
        `;

      const params = userId
        ? [userId, `%${searchTerm}%`, limit]
        : [`%${searchTerm}%`, limit];

      const result = await this.dbPool.query(query, params);
      return result.rows.map(row => this.mapRowToLog(row));
    } catch (error) {
      logger.error('Failed to search messages', { searchTerm, userId, error });
      return [];
    }
  }

  /**
   * Get messages with errors
   */
  async getErrorMessages(
    userId?: string,
    limit: number = 50
  ): Promise<MessageLog[]> {
    try {
      const query = userId
        ? `
          SELECT * FROM message_logs
          WHERE user_id = $1 AND has_error = true
          ORDER BY created_at DESC
          LIMIT $2
        `
        : `
          SELECT * FROM message_logs
          WHERE has_error = true
          ORDER BY created_at DESC
          LIMIT $1
        `;

      const params = userId ? [userId, limit] : [limit];
      const result = await this.dbPool.query(query, params);
      return result.rows.map(row => this.mapRowToLog(row));
    } catch (error) {
      logger.error('Failed to get error messages', { userId, error });
      return [];
    }
  }

  /**
   * Clean old logs (keep last N days)
   */
  async cleanOldLogs(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = DateTime.now().minus({ days: daysToKeep }).toJSDate();

      const query = `
        DELETE FROM message_logs
        WHERE created_at < $1
        RETURNING id
      `;

      const result = await this.dbPool.query(query, [cutoffDate]);
      logger.info('Cleaned old message logs', { deleted: result.rowCount, daysToKeep });
      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to clean old logs', { daysToKeep, error });
      return 0;
    }
  }

  /**
   * Map database row to MessageLog
   */
  private mapRowToLog(row: any): MessageLog {
    return {
      id: row.id,
      userId: row.user_id,
      phone: row.phone,
      messageType: row.message_type,
      content: row.content,
      intent: row.intent,
      conversationState: row.conversation_state,
      confidence: row.confidence ? parseFloat(row.confidence) : undefined,
      processingTime: row.processing_time ? parseInt(row.processing_time) : undefined,
      hasError: row.has_error,
      errorMessage: row.error_message,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    };
  }
}

// Export singleton instance
export const messageLogger = new MessageLogger();
export default messageLogger;
