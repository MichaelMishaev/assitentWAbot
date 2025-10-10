import db from '../config/database.js';
import logger from '../utils/logger.js';
import { NLPIntent } from './NLPService.js';

interface NLPComparison {
  userMessage: string;
  userId: string;
  gptIntent: NLPIntent;
  geminiIntent: NLPIntent;
  gptResponseTime: number;
  geminiResponseTime: number;
  intentMatch: boolean;
  confidenceDiff: number;
  timestamp: Date;
}

export class NLPComparisonLogger {
  private static instance: NLPComparisonLogger;

  private constructor() {}

  static getInstance(): NLPComparisonLogger {
    if (!NLPComparisonLogger.instance) {
      NLPComparisonLogger.instance = new NLPComparisonLogger();
    }
    return NLPComparisonLogger.instance;
  }

  /**
   * Log comparison between GPT and Gemini responses
   */
  async logComparison(comparison: NLPComparison): Promise<void> {
    try {
      await db.query(
        `INSERT INTO nlp_comparisons (
          user_message,
          user_id,
          gpt_intent,
          gemini_intent,
          gpt_response_time,
          gemini_response_time,
          intent_match,
          confidence_diff,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          comparison.userMessage,
          comparison.userId,
          JSON.stringify(comparison.gptIntent),
          JSON.stringify(comparison.geminiIntent),
          comparison.gptResponseTime,
          comparison.geminiResponseTime,
          comparison.intentMatch,
          comparison.confidenceDiff,
          comparison.timestamp
        ]
      );

      logger.info('NLP comparison logged', {
        userMessage: comparison.userMessage,
        intentMatch: comparison.intentMatch,
        gptTime: comparison.gptResponseTime,
        geminiTime: comparison.geminiResponseTime,
        confidenceDiff: comparison.confidenceDiff
      });
    } catch (error) {
      logger.error('Failed to log NLP comparison', { error, comparison });
    }
  }

  /**
   * Compare two NLP responses and calculate metrics
   */
  compareResponses(
    userMessage: string,
    userId: string,
    gptIntent: NLPIntent,
    geminiIntent: NLPIntent,
    gptTime: number,
    geminiTime: number
  ): NLPComparison {
    const intentMatch = gptIntent.intent === geminiIntent.intent;
    const confidenceDiff = Math.abs(gptIntent.confidence - geminiIntent.confidence);

    return {
      userMessage,
      userId,
      gptIntent,
      geminiIntent,
      gptResponseTime: gptTime,
      geminiResponseTime: geminiTime,
      intentMatch,
      confidenceDiff,
      timestamp: new Date()
    };
  }

  /**
   * Get comparison statistics
   */
  async getStats(limit: number = 100): Promise<{
    totalComparisons: number;
    intentMatchRate: number;
    avgConfidenceDiff: number;
    avgGptTime: number;
    avgGeminiTime: number;
    gptFasterPercent: number;
  }> {
    try {
      const result = await db.query(
        `SELECT
          COUNT(*) as total,
          AVG(CASE WHEN intent_match THEN 1 ELSE 0 END) as match_rate,
          AVG(confidence_diff) as avg_confidence_diff,
          AVG(gpt_response_time) as avg_gpt_time,
          AVG(gemini_response_time) as avg_gemini_time,
          AVG(CASE WHEN gpt_response_time < gemini_response_time THEN 1 ELSE 0 END) as gpt_faster_rate
        FROM (
          SELECT
            intent_match,
            confidence_diff,
            gpt_response_time,
            gemini_response_time
          FROM nlp_comparisons
          ORDER BY created_at DESC
          LIMIT $1
        ) recent_comparisons`,
        [limit]
      );

      const row = result.rows[0];

      return {
        totalComparisons: parseInt(row.total) || 0,
        intentMatchRate: (parseFloat(row.match_rate) || 0) * 100,
        avgConfidenceDiff: parseFloat(row.avg_confidence_diff) || 0,
        avgGptTime: parseFloat(row.avg_gpt_time) || 0,
        avgGeminiTime: parseFloat(row.avg_gemini_time) || 0,
        gptFasterPercent: (parseFloat(row.gpt_faster_rate) || 0) * 100
      };
    } catch (error) {
      logger.error('Failed to get NLP comparison stats', { error });
      return {
        totalComparisons: 0,
        intentMatchRate: 0,
        avgConfidenceDiff: 0,
        avgGptTime: 0,
        avgGeminiTime: 0,
        gptFasterPercent: 0
      };
    }
  }

  /**
   * Get mismatched intents for analysis
   */
  async getMismatches(limit: number = 20): Promise<Array<{
    userMessage: string;
    gptIntent: string;
    geminiIntent: string;
    gptConfidence: number;
    geminiConfidence: number;
    timestamp: Date;
  }>> {
    try {
      const result = await db.query(
        `SELECT
          user_message,
          gpt_intent,
          gemini_intent,
          created_at
        FROM nlp_comparisons
        WHERE intent_match = false
        ORDER BY created_at DESC
        LIMIT $1`,
        [limit]
      );

      return result.rows.map(row => ({
        userMessage: row.user_message,
        gptIntent: JSON.parse(row.gpt_intent).intent,
        geminiIntent: JSON.parse(row.gemini_intent).intent,
        gptConfidence: JSON.parse(row.gpt_intent).confidence,
        geminiConfidence: JSON.parse(row.gemini_intent).confidence,
        timestamp: row.created_at
      }));
    } catch (error) {
      logger.error('Failed to get NLP mismatches', { error });
      return [];
    }
  }
}

export const nlpComparisonLogger = NLPComparisonLogger.getInstance();
