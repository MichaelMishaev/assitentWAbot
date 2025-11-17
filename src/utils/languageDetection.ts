/**
 * Language Detection Utility
 *
 * Simple language detection for routing unknown user messages appropriately.
 * Used to detect if a message is in Hebrew, another language, or just gibberish/emoji.
 */

export type LanguageType = 'hebrew' | 'arabic' | 'english' | 'other' | 'gibberish';

/**
 * Detect the language of a text message
 *
 * @param text - The message text to analyze
 * @returns Language type classification
 *
 * @example
 * detectLanguage('שלום') // 'hebrew'
 * detectLanguage('hello') // 'english'
 * detectLanguage('مرحبا') // 'arabic'
 * detectLanguage('привет') // 'other' (Russian)
 * detectLanguage('👍') // 'gibberish'
 */
export function detectLanguage(text: string): LanguageType {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return 'gibberish';
  }

  // Unicode ranges for different scripts
  const hasHebrew = /[\u0590-\u05FF]/.test(trimmed);
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F]/.test(trimmed);
  const hasLatin = /[a-zA-Z]/.test(trimmed);
  const hasCyrillic = /[\u0400-\u04FF]/.test(trimmed);

  // Remove common non-letter characters to check if there's any real text
  const withoutSymbols = trimmed.replace(/[0-9\s\p{P}\p{S}]/gu, '');

  // If no letters remain after removing symbols, it's gibberish (emoji, numbers, punctuation only)
  if (withoutSymbols.length === 0) {
    return 'gibberish';
  }

  // Determine primary language based on script
  if (hasHebrew) {
    return 'hebrew';
  } else if (hasArabic) {
    return 'arabic';
  } else if (hasLatin) {
    return 'english';
  } else if (hasCyrillic) {
    return 'other'; // Russian, Ukrainian, etc.
  }

  // Has letters but not in any recognized script
  return 'other';
}

/**
 * Get human-readable language name
 *
 * @param languageType - The detected language type
 * @returns Display name in English
 */
export function getLanguageName(languageType: LanguageType): string {
  const names: Record<LanguageType, string> = {
    hebrew: 'Hebrew',
    arabic: 'Arabic',
    english: 'English',
    other: 'Other language',
    gibberish: 'Gibberish/Emoji'
  };

  return names[languageType];
}
