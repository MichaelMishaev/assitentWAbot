/**
 * Phase 10: Voice Message Support
 *
 * Normalizes voice transcriptions to improve accuracy:
 * - Convert Hebrew number words to digits ("ארבע עשר" → "14")
 * - Fix common transcription errors ("שבעה" vs "שבע")
 * - Handle missing spaces ("ביוםשני" → "ביום שני")
 * - Detect low confidence transcriptions
 *
 * Priority: #11
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';

export class VoiceNormalizerPhase extends BasePhase {
  readonly name = 'voice-normalizer';
  readonly order = 0; // Run FIRST, before intent detection
  readonly description = 'Normalize voice transcriptions';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    // Check if message is from voice
    return (
      context.originalMessage.content.isVoice === true ||
      context.getMetadata('isVoiceMessage') === true
    );
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const originalText = context.processedText;
      let normalizedText = originalText;

      // Apply normalizations
      normalizedText = this.convertHebrewNumbers(normalizedText);
      normalizedText = this.fixCommonTranscriptionErrors(normalizedText);
      normalizedText = this.addMissingSpaces(normalizedText);
      normalizedText = this.normalizeTimeExpressions(normalizedText);

      // Calculate confidence
      const confidence = this.estimateTranscriptionConfidence(normalizedText);

      // Update context
      context.processedText = normalizedText;
      context.entities.isVoiceMessage = true;
      context.entities.transcriptionConfidence = confidence;

      const changes = originalText !== normalizedText;

      if (changes) {
        logger.info('Voice text normalized', {
          original: originalText.substring(0, 50),
          normalized: normalizedText.substring(0, 50),
          confidence
        });
      }

      // Warn if low confidence
      if (confidence < 0.7) {
        context.addWarning('איכות ההקלטה לא ברורה. אנא וודא שהפרטים נכונים.');
      }

      return this.success({
        normalized: changes,
        confidence,
        originalLength: originalText.length,
        normalizedLength: normalizedText.length
      });

    } catch (error) {
      logger.error('Voice normalization failed', { error });
      return this.success({ normalized: false }, ['Voice normalization failed']);
    }
  }

  /**
   * Convert Hebrew number words to digits
   */
  private convertHebrewNumbers(text: string): string {
    const numberMap: Record<string, string> = {
      // Units (1-10)
      'אפס': '0',
      'אחד': '1',
      'אחת': '1',
      'שניים': '2',
      'שתיים': '2',
      'שלוש': '3',
      'שלושה': '3',
      'ארבע': '4',
      'ארבעה': '4',
      'חמש': '5',
      'חמישה': '5',
      'חמישי': '5',
      'שש': '6',
      'שישה': '6',
      'שבע': '7',
      'שבעה': '7',
      'שמונה': '8',
      'תשע': '9',
      'תשעה': '9',
      'עשר': '10',
      'עשרה': '10',

      // Teens (11-19)
      'אחד עשר': '11',
      'אחת עשרה': '11',
      'שנים עשר': '12',
      'שתים עשרה': '12',
      'שלוש עשרה': '13',
      'שלושה עשר': '13',
      'ארבע עשרה': '14',
      'ארבעה עשר': '14',
      'חמש עשרה': '15',
      'חמישה עשר': '15',
      'שש עשרה': '16',
      'שישה עשר': '16',
      'שבע עשרה': '17',
      'שבעה עשר': '17',
      'שמונה עשרה': '18',
      'תשע עשרה': '19',
      'תשעה עשר': '19',

      // Tens (20-90)
      'עשרים': '20',
      'שלושים': '30',
      'ארבעים': '40',
      'חמישים': '50',
      'שישים': '60',
      'שבעים': '70',
      'שמונים': '80',
      'תשעים': '90'
    };

    let result = text;

    // Sort by length (longer phrases first)
    const sortedKeys = Object.keys(numberMap).sort((a, b) => b.length - a.length);

    for (const hebrewNum of sortedKeys) {
      const regex = new RegExp(`\\b${hebrewNum}\\b`, 'gi');
      result = result.replace(regex, numberMap[hebrewNum]);
    }

    return result;
  }

  /**
   * Fix common transcription errors
   */
  private fixCommonTranscriptionErrors(text: string): string {
    const corrections: Record<string, string> = {
      // Common misheard words
      'קבע פגיעה': 'קבע פגישה',
      'קבה פגישה': 'קבע פגישה',
      'קבא פגישה': 'קבע פגישה',
      'פגישה עד': 'פגישה עם',
      'ביום שלי': 'ביום שני',
      'ביום רביע': 'ביום רביעי',
      'בשעה שלוש': 'בשעה 3',
      'בשעה ארבע': 'בשעה 4',
      'בשעה חמש': 'בשעה 5',
      'בשעה שש': 'בשעה 6',
      'בשעה שבע': 'בשעה 7',
      'בשעה שמונה': 'בשעה 8',
      'בשעה תשע': 'בשעה 9',
      'בשעה עשר': 'בשעה 10',

      // Time expressions
      'ב 10': 'ב-10',
      'ב 11': 'ב-11',
      'ב 12': 'ב-12',
      'ב 13': 'ב-13',
      'ב 14': 'ב-14',
      'ב 15': 'ב-15',
      'ב 16': 'ב-16',

      // Date expressions
      'ביום השני': 'ביום שני',
      'ביום השלישי': 'ביום שלישי',
      'ביום הרביעי': 'ביום רביעי',
      'ביום החמישי': 'ביום חמישי',
      'ביום השישי': 'ביום שישי',

      // Location prepositions
      'ב משרד': 'במשרד',
      'ב בית': 'בבית',
      'ב תל אביב': 'בתל אביב'
    };

    let result = text;

    for (const [wrong, correct] of Object.entries(corrections)) {
      const regex = new RegExp(wrong, 'gi');
      result = result.replace(regex, correct);
    }

    return result;
  }

  /**
   * Add missing spaces (common in transcription)
   */
  private addMissingSpaces(text: string): string {
    // Add space before "ב" prefix if missing
    let result = text.replace(/([א-ת])ב([א-ת])/g, '$1 ב$2');

    // Add space before "ו" conjunction if missing
    result = result.replace(/([א-ת])ו([א-ת])/g, '$1 ו$2');

    // Add space before "ל" prefix if missing
    result = result.replace(/([א-ת])ל([א-ת])/g, '$1 ל$2');

    return result;
  }

  /**
   * Normalize time expressions
   */
  private normalizeTimeExpressions(text: string): string {
    let result = text;

    // "בשעה X" → "בשעה X:00" if no minutes
    result = result.replace(/בשעה (\d{1,2})(?![:\d])/gi, 'בשעה $1:00');

    // "X בבוקר" → "X:00 בבוקר"
    result = result.replace(/(\d{1,2}) בבוקר/gi, '$1:00 בבוקר');

    // "X אחרי הצהריים" → "X:00 אחרי הצהריים"
    result = result.replace(/(\d{1,2}) אחרי הצהריים/gi, '$1:00 אחרי הצהריים');

    // "X בערב" → "X:00 בערב"
    result = result.replace(/(\d{1,2}) בערב/gi, '$1:00 בערב');

    return result;
  }

  /**
   * Estimate transcription confidence
   */
  private estimateTranscriptionConfidence(text: string): number {
    let confidence = 1.0;

    // Penalize for very short messages
    if (text.length < 10) {
      confidence -= 0.2;
    }

    // Penalize for lack of spaces (sign of bad transcription)
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 3) {
      confidence -= 0.1;
    }

    // Penalize for non-standard characters
    const nonHebrewEnglish = text.replace(/[א-תa-zA-Z0-9\s:,.\-״״]/g, '');
    if (nonHebrewEnglish.length > 0) {
      confidence -= 0.1;
    }

    // Penalize for very long words (likely concatenated)
    const words = text.split(/\s+/);
    const hasLongWords = words.some(word => word.length > 20);
    if (hasLongWords) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Convert time context (בבוקר/אחרי הצהריים/בערב) to 24h format
   */
  convertTimeContext(hour: number, context: string): number {
    if (/בבוקר|morning/i.test(context)) {
      // Morning: keep as-is (already 0-12)
      return hour <= 12 ? hour : hour - 12;
    }

    if (/אחרי הצהריים|afternoon/i.test(context)) {
      // Afternoon: add 12 if needed
      return hour < 12 ? hour + 12 : hour;
    }

    if (/בערב|evening|night/i.test(context)) {
      // Evening: add 12 if before 6 PM
      return hour < 12 ? hour + 12 : hour;
    }

    return hour;
  }
}
