/**
 * Multilingual Onboarding Service
 *
 * Handles non-Hebrew messages from unknown users by using GPT-4o-mini
 * to respond in their language, explaining the bot is Hebrew-only.
 *
 * SMART APPROACH:
 * - Detects language of user's message
 * - GPT-4o-mini generates culturally appropriate response in that language
 * - Explains bot is Hebrew-only
 * - Provides Hebrew greeting examples to get started
 *
 * Cost: ~$0.001 per message (very cheap with gpt-4o-mini)
 * Latency: 500ms-1s
 */

import OpenAI from 'openai';
import logger from '../utils/logger.js';
import { redis } from '../config/redis.js';
import { detectLanguage, getLanguageName } from '../utils/languageDetection.js';

interface OnboardingResponse {
  message: string;
  languageDetected: string;
  cacheHit?: boolean;
  latencyMs?: number;
}

class MultilingualOnboardingService {
  private openai: OpenAI;
  private readonly CACHE_TTL = 604800; // 7 days (these responses are static)
  private readonly CACHE_PREFIX = 'onboarding:msg:';
  private readonly MODEL = 'gpt-4o-mini'; // Cheap & fast: $0.150 / 1M input tokens

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate onboarding message in user's language
   *
   * @param userMessage - The message sent by the unknown user
   * @returns Response explaining bot is Hebrew-only, in their language
   */
  async generateOnboardingMessage(userMessage: string): Promise<OnboardingResponse> {
    const startTime = Date.now();

    // Detect language
    const languageType = detectLanguage(userMessage);
    const languageName = getLanguageName(languageType);

    // Check cache first (based on detected language, not exact message)
    const cacheKey = `${this.CACHE_PREFIX}${languageType}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.info('Onboarding message cache hit', { languageType, languageName });
      return {
        message: cached,
        languageDetected: languageName,
        cacheHit: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // Generate response with GPT-4o-mini
    try {
      const prompt = this.buildPrompt(userMessage, languageType);

      const completion = await this.openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful multilingual assistant for a Hebrew-language WhatsApp bot.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      const responseMessage = completion.choices[0]?.message?.content?.trim() || this.getFallbackMessage(languageType);

      // Cache the response
      await redis.setex(cacheKey, this.CACHE_TTL, responseMessage);

      const latencyMs = Date.now() - startTime;

      logger.info('Generated onboarding message with GPT-4o-mini', {
        languageType,
        languageName,
        latencyMs,
        tokensUsed: completion.usage?.total_tokens,
      });

      return {
        message: responseMessage,
        languageDetected: languageName,
        cacheHit: false,
        latencyMs,
      };
    } catch (error: any) {
      logger.error('Failed to generate onboarding message with GPT-4o-mini', {
        error: error.message,
        languageType,
      });

      // Return fallback message
      return {
        message: this.getFallbackMessage(languageType),
        languageDetected: languageName,
        cacheHit: false,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build prompt for GPT-4o-mini based on detected language
   */
  private buildPrompt(userMessage: string, languageType: string): string {
    const languageInstructions: Record<string, string> = {
      arabic: 'Respond in Arabic',
      english: 'Respond in English',
      other: 'Respond in the same language as the user\'s message',
    };

    const instruction = languageInstructions[languageType] || 'Respond in English';

    return `${instruction}. Be friendly and concise (2-3 sentences max).

The user sent: "${userMessage}"

Explain that:
1. This WhatsApp bot only works in Hebrew (עברית)
2. To get started, they should send a Hebrew greeting like "שלום" or "היי"
3. The bot helps manage calendar events and reminders in Hebrew

Keep it warm, helpful, and concise.`;
  }

  /**
   * Fallback messages when GPT-4o-mini fails
   */
  private getFallbackMessage(languageType: string): string {
    const fallbacks: Record<string, string> = {
      arabic: 'مرحباً! 👋\n\nهذا البوت يعمل فقط باللغة العبرية.\nلبدء الاستخدام، أرسل رسالة بالعبرية مثل "שלום" أو "היי"',
      english: 'Hello! 👋\n\nThis bot only works in Hebrew.\nTo get started, please send a Hebrew greeting like "שלום" or "היי"',
      other: 'Hello! 👋\n\nThis bot only works in Hebrew (עברית).\nTo get started, please send a Hebrew greeting like "שלום" or "היי"',
      gibberish: '', // Don't respond to gibberish
      hebrew: '', // Should never reach here
    };

    return fallbacks[languageType] || fallbacks['english'];
  }
}

export const multilingualOnboardingService = new MultilingualOnboardingService();
