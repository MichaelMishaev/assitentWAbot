import { NLPService, NLPIntent } from './NLPService.js';
import { GeminiNLPService } from './GeminiNLPService.js';
import { nlpComparisonLogger } from './NLPComparisonLogger.js';
import logger from '../utils/logger.js';

interface Contact {
  id: string;
  userId: string;
  name: string;
  relation?: string | null;
  aliases: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Dual NLP Service - Runs GPT and Gemini in parallel for A/B testing
 *
 * Strategy:
 * 1. User sends message
 * 2. GPT responds immediately (primary, user sees this)
 * 3. Gemini runs in background (shadow testing, no user impact)
 * 4. Comparison logged to database for analysis
 *
 * Zero impact on user experience!
 */
export class DualNLPService {
  private gptService: NLPService;
  private geminiService: GeminiNLPService | null = null;
  private comparisonEnabled: boolean;

  constructor() {
    this.gptService = new NLPService();

    // Only enable Gemini if API key is set
    const geminiApiKey = process.env.GEMINI_API_KEY;
    this.comparisonEnabled = !!geminiApiKey;

    if (this.comparisonEnabled) {
      try {
        this.geminiService = new GeminiNLPService();
        logger.info('DualNLPService: Gemini comparison enabled');
      } catch (error) {
        logger.warn('DualNLPService: Gemini comparison disabled', { error });
        this.comparisonEnabled = false;
      }
    } else {
      logger.info('DualNLPService: Gemini comparison disabled (no API key)');
    }
  }

  /**
   * Parse intent using GPT (primary) and Gemini (shadow)
   * Returns GPT result immediately, Gemini runs in background
   */
  async parseIntent(
    userMessage: string,
    userContacts: Contact[],
    userTimezone: string = 'Asia/Jerusalem',
    conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>,
    userId?: string
  ): Promise<NLPIntent> {
    // Always use GPT as primary (user sees this immediately)
    const gptStartTime = Date.now();
    const gptIntent = await this.gptService.parseIntent(
      userMessage,
      userContacts,
      userTimezone,
      conversationHistory
    );
    const gptEndTime = Date.now();
    const gptResponseTime = gptEndTime - gptStartTime;

    // If comparison enabled, run Gemini in background (async, no await)
    if (this.comparisonEnabled && this.geminiService && userId) {
      this.runGeminiComparison(
        userMessage,
        userContacts,
        userTimezone,
        conversationHistory,
        userId,
        gptIntent,
        gptResponseTime
      ).catch(error => {
        logger.error('Background Gemini comparison failed', { error });
      });
    }

    // Return GPT result immediately (user doesn't wait for Gemini)
    return gptIntent;
  }

  /**
   * Run Gemini comparison in background (async, no blocking)
   */
  private async runGeminiComparison(
    userMessage: string,
    userContacts: Contact[],
    userTimezone: string,
    conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> | undefined,
    userId: string,
    gptIntent: NLPIntent,
    gptResponseTime: number
  ): Promise<void> {
    if (!this.geminiService) return;

    try {
      const geminiStartTime = Date.now();
      const geminiIntent = await this.geminiService.parseIntent(
        userMessage,
        userContacts,
        userTimezone,
        conversationHistory
      );
      const geminiEndTime = Date.now();
      const geminiResponseTime = geminiEndTime - geminiStartTime;

      // Compare and log results
      const comparison = nlpComparisonLogger.compareResponses(
        userMessage,
        userId,
        gptIntent,
        geminiIntent,
        gptResponseTime,
        geminiResponseTime
      );

      await nlpComparisonLogger.logComparison(comparison);

      // Log to console if there's a mismatch (for quick debugging)
      if (!comparison.intentMatch) {
        logger.warn('NLP intent mismatch detected', {
          userMessage,
          gptIntent: gptIntent.intent,
          geminiIntent: geminiIntent.intent,
          gptConfidence: gptIntent.confidence,
          geminiConfidence: geminiIntent.confidence
        });
      }
    } catch (error) {
      logger.error('Gemini comparison failed', { error, userMessage });
    }
  }

  /**
   * Test both services
   */
  async testConnections(): Promise<{ gpt: boolean; gemini: boolean }> {
    const gptOk = await this.gptService.testConnection();
    const geminiOk = this.geminiService
      ? await this.geminiService.testConnection()
      : false;

    return { gpt: gptOk, gemini: geminiOk };
  }

  /**
   * Check if comparison is enabled
   */
  isComparisonEnabled(): boolean {
    return this.comparisonEnabled;
  }
}
