/**
 * API Call Logger - Comprehensive logging for ALL AI API calls
 *
 * Features:
 * - Logs every API call to local file
 * - Tracks: model, tokens, cost, response time, errors
 * - Auto-cleanup: Deletes logs older than 5 days
 * - Daily rotation: One file per day
 * - Crash loop detection: Alerts on high frequency
 *
 * Purpose:
 * - Debug unexpected API costs
 * - Detect crash loops early
 * - Audit API usage
 * - Cost investigation
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import logger from '../../utils/logger.js';

export interface ApiCallLog {
  timestamp: string;          // ISO 8601
  model: string;              // 'gpt-4.1-nano', 'gemini-2.5-flash-lite'
  operation: string;          // 'intent-classification', 'entity-extraction'
  userId: string;             // User ID
  messageId?: string;         // Message ID (if available)
  tokensInput?: number;       // Input tokens
  tokensOutput?: number;      // Output tokens
  tokensTotal?: number;       // Total tokens
  costUsd?: number;           // Estimated cost in USD
  responseTimeMs: number;     // Response time in ms
  success: boolean;           // Success or error
  errorMessage?: string;      // Error message if failed
  metadata?: Record<string, any>; // Additional context
}

export class ApiCallLogger {
  private logDir: string;
  private maxAgeDays: number;
  private cleanupIntervalMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    logDir: string = './logs/api-calls',
    maxAgeDays: number = 5,
    cleanupIntervalMs: number = 3600000 // 1 hour
  ) {
    this.logDir = logDir;
    this.maxAgeDays = maxAgeDays;
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  /**
   * Initialize logger (create directory, start cleanup)
   */
  async initialize(): Promise<void> {
    try {
      // Create log directory if doesn't exist
      await fs.mkdir(this.logDir, { recursive: true });
      logger.info('ApiCallLogger initialized', { logDir: this.logDir });

      // Start automatic cleanup
      this.startCleanup();

      // Run cleanup immediately
      await this.cleanup();
    } catch (error) {
      logger.error('Failed to initialize ApiCallLogger', { error });
    }
  }

  /**
   * Log an API call to daily file
   */
  async logCall(logEntry: ApiCallLog): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const logFile = path.join(this.logDir, `api-calls-${today}.jsonl`);

      // Format as single-line JSON (JSONL format)
      const logLine = JSON.stringify(logEntry) + '\n';

      // Append to file (create if doesn't exist)
      await fs.appendFile(logFile, logLine, 'utf-8');

      // Also log to console (debug level)
      logger.debug('API call logged', {
        model: logEntry.model,
        success: logEntry.success,
        cost: logEntry.costUsd,
        responseTime: logEntry.responseTimeMs
      });
    } catch (error) {
      logger.error('Failed to log API call', { error, logEntry });
    }
  }

  /**
   * Log successful API call
   */
  async logSuccess(
    model: string,
    operation: string,
    userId: string,
    tokensInput: number,
    tokensOutput: number,
    costUsd: number,
    responseTimeMs: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCall({
      timestamp: new Date().toISOString(),
      model,
      operation,
      userId,
      tokensInput,
      tokensOutput,
      tokensTotal: tokensInput + tokensOutput,
      costUsd,
      responseTimeMs,
      success: true,
      metadata
    });
  }

  /**
   * Log failed API call
   */
  async logError(
    model: string,
    operation: string,
    userId: string,
    errorMessage: string,
    responseTimeMs: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCall({
      timestamp: new Date().toISOString(),
      model,
      operation,
      userId,
      responseTimeMs,
      success: false,
      errorMessage,
      metadata
    });
  }

  /**
   * Get API call statistics for today
   */
  async getTodayStats(): Promise<{
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    totalCost: number;
    byModel: Record<string, { calls: number; cost: number }>;
    avgResponseTime: number;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `api-calls-${today}.jsonl`);

      if (!existsSync(logFile)) {
        return {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalCost: 0,
          byModel: {},
          avgResponseTime: 0
        };
      }

      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      let totalCalls = 0;
      let successfulCalls = 0;
      let failedCalls = 0;
      let totalCost = 0;
      let totalResponseTime = 0;
      const byModel: Record<string, { calls: number; cost: number }> = {};

      for (const line of lines) {
        try {
          const log = JSON.parse(line) as ApiCallLog;
          totalCalls++;

          if (log.success) {
            successfulCalls++;
            totalCost += log.costUsd || 0;
          } else {
            failedCalls++;
          }

          totalResponseTime += log.responseTimeMs;

          if (!byModel[log.model]) {
            byModel[log.model] = { calls: 0, cost: 0 };
          }
          byModel[log.model].calls++;
          byModel[log.model].cost += log.costUsd || 0;
        } catch (err) {
          // Skip malformed lines
        }
      }

      return {
        totalCalls,
        successfulCalls,
        failedCalls,
        totalCost,
        byModel,
        avgResponseTime: totalCalls > 0 ? totalResponseTime / totalCalls : 0
      };
    } catch (error) {
      logger.error('Failed to get today stats', { error });
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalCost: 0,
        byModel: {},
        avgResponseTime: 0
      };
    }
  }

  /**
   * Detect if API usage is abnormally high (crash loop detection)
   */
  async detectAnomalies(): Promise<{
    isAnomaly: boolean;
    reason?: string;
    stats?: any;
  }> {
    try {
      const stats = await this.getTodayStats();

      // ANOMALY 1: High error rate (>40% fails)
      if (stats.failedCalls > 0 && stats.failedCalls / stats.totalCalls > 0.4) {
        return {
          isAnomaly: true,
          reason: 'High error rate detected (>40% failures)',
          stats
        };
      }

      // ANOMALY 2: Extremely high call count (>100 in 1 hour)
      // (Requires hourly data - simplified check: >500 total today)
      if (stats.totalCalls > 500) {
        return {
          isAnomaly: true,
          reason: 'Abnormally high API call count (>500 today)',
          stats
        };
      }

      // ANOMALY 3: High cost (>$5 today)
      if (stats.totalCost > 5) {
        return {
          isAnomaly: true,
          reason: 'High API costs detected (>$5 today)',
          stats
        };
      }

      return { isAnomaly: false, stats };
    } catch (error) {
      logger.error('Failed to detect anomalies', { error });
      return { isAnomaly: false };
    }
  }

  /**
   * Start automatic cleanup (runs every hour)
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      await this.cleanup();
    }, this.cleanupIntervalMs);

    logger.info('API call log cleanup started', {
      intervalHours: this.cleanupIntervalMs / 3600000,
      maxAgeDays: this.maxAgeDays
    });
  }

  /**
   * Cleanup old log files (>5 days)
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const now = Date.now();
      const maxAgeMs = this.maxAgeDays * 24 * 60 * 60 * 1000;

      let deletedCount = 0;

      for (const file of files) {
        if (!file.startsWith('api-calls-') || !file.endsWith('.jsonl')) {
          continue; // Skip non-log files
        }

        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > maxAgeMs) {
          await fs.unlink(filePath);
          deletedCount++;
          logger.info('Deleted old API log file', {
            file,
            ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000))
          });
        }
      }

      if (deletedCount > 0) {
        logger.info('API log cleanup complete', {
          deletedFiles: deletedCount,
          maxAgeDays: this.maxAgeDays
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup API logs', { error });
    }
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('API call log cleanup stopped');
    }
  }

  /**
   * Get log file path for a specific date
   */
  getLogFilePath(date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    return path.join(this.logDir, `api-calls-${dateStr}.jsonl`);
  }

  /**
   * Read all logs for a specific date
   */
  async getLogsForDate(date: Date): Promise<ApiCallLog[]> {
    try {
      const logFile = this.getLogFilePath(date);

      if (!existsSync(logFile)) {
        return [];
      }

      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      const logs: ApiCallLog[] = [];
      for (const line of lines) {
        try {
          logs.push(JSON.parse(line));
        } catch (err) {
          // Skip malformed lines
        }
      }

      return logs;
    } catch (error) {
      logger.error('Failed to read logs for date', { error, date });
      return [];
    }
  }
}

/**
 * Singleton instance
 */
export const apiCallLogger = new ApiCallLogger();

// Auto-initialize on import
apiCallLogger.initialize().catch(error => {
  logger.error('Failed to initialize API call logger', { error });
});
