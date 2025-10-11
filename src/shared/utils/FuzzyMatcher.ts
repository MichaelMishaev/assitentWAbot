/**
 * Fuzzy Matcher Utility
 *
 * Provides fuzzy string matching using Levenshtein distance for:
 * - Finding events with partial/misspelled titles
 * - "מחק פגישה" → finds "פגישה עם דוד"
 * - "עדכן רופא" → finds "רופא שיניים"
 *
 * Uses normalized distance (0-1) where 1 = perfect match
 */

export class FuzzyMatcher {
  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create matrix
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate similarity score (0-1, where 1 = perfect match)
   */
  static similarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    // Normalize strings (lowercase, trim)
    const normalized1 = str1.toLowerCase().trim();
    const normalized2 = str2.toLowerCase().trim();

    if (normalized1 === normalized2) return 1;

    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);

    // Normalized similarity (1 - normalized distance)
    return 1 - distance / maxLength;
  }

  /**
   * Check if query matches target with fuzzy matching
   * @param query - Search query
   * @param target - Target string to match against
   * @param threshold - Minimum similarity score (0-1), default 0.6
   */
  static matches(query: string, target: string, threshold: number = 0.6): boolean {
    // Check exact substring match first (faster)
    if (target.toLowerCase().includes(query.toLowerCase())) {
      return true;
    }

    // Check fuzzy similarity
    const score = this.similarity(query, target);
    return score >= threshold;
  }

  /**
   * Find best matches from a list of candidates
   * @param query - Search query
   * @param candidates - List of candidate strings
   * @param threshold - Minimum similarity score (0-1), default 0.6
   * @param maxResults - Maximum number of results to return, default 5
   */
  static findBestMatches(
    query: string,
    candidates: string[],
    threshold: number = 0.6,
    maxResults: number = 5
  ): Array<{ value: string; score: number }> {
    const matches = candidates
      .map(candidate => ({
        value: candidate,
        score: this.similarity(query, candidate)
      }))
      .filter(match => match.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return matches;
  }

  /**
   * Check if query is contained in target (partial match)
   * More lenient than fuzzy matching
   */
  static containsPartial(query: string, target: string): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedTarget = target.toLowerCase().trim();

    // Split query into words
    const queryWords = normalizedQuery.split(/\s+/);

    // Check if all query words are in target
    return queryWords.every(word => normalizedTarget.includes(word));
  }

  /**
   * Extract keywords from a Hebrew string
   * Removes common Hebrew stop words
   */
  static extractKeywords(text: string): string[] {
    const stopWords = [
      'עם',
      'את',
      'של',
      'על',
      'אל',
      'לא',
      'כל',
      'יש',
      'אין',
      'היה',
      'הייתה',
      'זה',
      'זאת',
      'ב',
      'ל',
      'מ',
      'ה',
      'ו',
      'ש',
      'ד',
      'ר',
      'או',
      'גם',
      'אם',
      'כי',
      'מה',
      'מי',
      'איפה',
      'איך',
      'מתי',
      'למה'
    ];

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 1)
      .filter(word => !stopWords.includes(word));
  }

  /**
   * Calculate keyword-based similarity
   * Useful for longer texts
   */
  static keywordSimilarity(query: string, target: string): number {
    const queryKeywords = this.extractKeywords(query);
    const targetKeywords = this.extractKeywords(target);

    if (queryKeywords.length === 0 || targetKeywords.length === 0) {
      return 0;
    }

    // Count how many query keywords are in target
    const matches = queryKeywords.filter(keyword =>
      targetKeywords.some(targetKeyword => this.similarity(keyword, targetKeyword) >= 0.7)
    );

    return matches.length / queryKeywords.length;
  }
}
