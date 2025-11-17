/**
 * Language Detection Utility
 *
 * Detects if a message is in an unsupported language.
 * Only runs AFTER NLP fails to avoid false positives.
 *
 * Supported: Hebrew, English (and mixed)
 * Detected: Russian, Arabic, and other languages
 */

export interface LanguageDetectionResult {
  language: 'supported' | 'russian' | 'arabic' | 'other' | 'unknown';
  confidence: number;
  percentages: {
    hebrew: number;
    english: number;
    russian: number;
    arabic: number;
  };
}

/**
 * Detect language using Unicode character ranges
 * Fast, free, no external dependencies
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  // Count characters by script
  const hebrew = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const english = (text.match(/[a-zA-Z]/g) || []).length;
  const russian = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;

  const total = hebrew + english + russian + arabic;

  // No detectable script - likely numbers/punctuation only
  if (total === 0) {
    return {
      language: 'unknown',
      confidence: 0,
      percentages: { hebrew: 0, english: 0, russian: 0, arabic: 0 }
    };
  }

  // Calculate percentages
  const hebrewPercent = hebrew / total;
  const englishPercent = english / total;
  const russianPercent = russian / total;
  const arabicPercent = arabic / total;

  // Support Hebrew/English mix (common in Israel)
  // Examples: "פגישה עם John", "meeting מחר"
  if (hebrewPercent >= 0.3 || englishPercent >= 0.3) {
    return {
      language: 'supported',
      confidence: Math.max(hebrewPercent, englishPercent),
      percentages: {
        hebrew: hebrewPercent,
        english: englishPercent,
        russian: russianPercent,
        arabic: arabicPercent
      }
    };
  }

  // Detect Russian (>70% threshold to avoid false positives)
  if (russianPercent >= 0.7) {
    return {
      language: 'russian',
      confidence: russianPercent,
      percentages: {
        hebrew: hebrewPercent,
        english: englishPercent,
        russian: russianPercent,
        arabic: arabicPercent
      }
    };
  }

  // Detect Arabic (>70% threshold)
  if (arabicPercent >= 0.7) {
    return {
      language: 'arabic',
      confidence: arabicPercent,
      percentages: {
        hebrew: hebrewPercent,
        english: englishPercent,
        russian: russianPercent,
        arabic: arabicPercent
      }
    };
  }

  // Other unsupported language
  return {
    language: 'other',
    confidence: 0.5,
    percentages: {
      hebrew: hebrewPercent,
      english: englishPercent,
      russian: russianPercent,
      arabic: arabicPercent
    }
  };
}

/**
 * Check if we should skip language detection
 * Returns true for special cases where language detection would cause issues
 */
export function shouldSkipLanguageDetection(text: string, hasQuotedMessage: boolean, isVoiceMessage: boolean): boolean {
  // Skip for commands
  if (text.startsWith('/')) {
    return true;
  }

  // Skip for quick actions (reply-to-message)
  if (hasQuotedMessage) {
    return true;
  }

  // Skip for voice transcriptions (often have errors)
  if (isVoiceMessage) {
    return true;
  }

  return false;
}

/**
 * Get error message in user's language
 */
export function getUnsupportedLanguageMessage(language: string): string {
  switch (language) {
    case 'russian':
      return '🌐 Извините, я понимаю только иврит и английский 🇮🇱🇺🇸\n\n' +
             'К сожалению, русский язык пока не поддерживается.\n\n' +
             'Sorry, I only understand Hebrew and English.\n' +
             'Russian is not supported yet.';

    case 'arabic':
      return '🌐 عذرًا، أنا أفهم العبرية والإنجليزية فقط 🇮🇱🇺🇸\n\n' +
             'للأسف، اللغة العربية غير مدعومة حاليًا.\n\n' +
             'Sorry, I only understand Hebrew and English.\n' +
             'Arabic is not supported yet.';

    case 'other':
    default:
      return '🌐 Sorry, I only understand Hebrew 🇮🇱 and English 🇺🇸\n\n' +
             'מצטער, אני מבין רק עברית 🇮🇱 ואנגלית 🇺🇸\n\n' +
             'Please try again in Hebrew or English.';
  }
}
