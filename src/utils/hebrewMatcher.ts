/**
 * Hebrew Fuzzy Matching Utility
 *
 * Provides flexible matching for Hebrew text, handling:
 * - Partial title matches
 * - Token-based matching
 * - Common Hebrew prefixes/suffixes
 * - Case-insensitive matching
 */

/**
 * Common Hebrew words to ignore in matching (stop words)
 */
const HEBREW_STOP_WORDS = new Set([
  'את', 'עם', 'של', 'ב', 'ל', 'מ', 'ה', 'ו', 'אל', 'על', 'כ', 'ש',
  'זה', 'זאת', 'הוא', 'היא', 'אני', 'אתה', 'את',
  'the', 'a', 'an', 'with', 'for', 'to', 'in', 'on', 'at'
]);

/**
 * Normalize Hebrew text for matching
 * - Convert to lowercase
 * - Remove punctuation
 * - Remove extra whitespace
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"״׳\-_]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Tokenize text into significant words
 * - Split by whitespace
 * - Remove stop words
 * - Filter out very short tokens
 */
function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter(token => token.length >= 2) // Ignore single characters
    .filter(token => !HEBREW_STOP_WORDS.has(token));
}

/**
 * Check if two Hebrew texts match with fuzzy logic
 *
 * Matching strategies:
 * 1. Exact match (case-insensitive)
 * 2. One text contains the other
 * 3. Significant token overlap (at least 50% of search tokens)
 *
 * @param searchText - The text to search for (from NLP/user)
 * @param targetText - The text to search in (from database)
 * @returns Match score (0-1), where 1 is perfect match
 */
export function fuzzyMatch(searchText: string, targetText: string): number {
  if (!searchText || !targetText) return 0;

  const searchNorm = normalizeText(searchText);
  const targetNorm = normalizeText(targetText);

  // Check if normalized texts are empty (e.g., only spaces or punctuation)
  if (!searchNorm || !targetNorm) return 0;

  // Strategy 1: Exact match
  if (searchNorm === targetNorm) return 1.0;

  // Strategy 2: Contains (substring match)
  if (targetNorm.includes(searchNorm) && searchNorm.length > 0) return 0.9;
  if (searchNorm.includes(targetNorm) && targetNorm.length > 0) return 0.9;

  // Strategy 3: Token-based matching
  const searchTokens = tokenize(searchText);
  const targetTokens = tokenize(targetText);

  if (searchTokens.length === 0 || targetTokens.length === 0) return 0;

  // Count matching tokens
  let matchingTokens = 0;
  for (const searchToken of searchTokens) {
    // Check if any target token contains this search token or vice versa
    if (targetTokens.some(t => t.includes(searchToken) || searchToken.includes(t))) {
      matchingTokens++;
    }
  }

  // Calculate match ratio
  const matchRatio = matchingTokens / searchTokens.length;

  // Require at least 50% token overlap
  if (matchRatio >= 0.5) {
    return 0.5 + (matchRatio * 0.4); // Score between 0.5-0.9
  }

  return 0;
}

/**
 * Check if search text matches target text with minimum threshold
 *
 * @param searchText - The text to search for
 * @param targetText - The text to search in
 * @param threshold - Minimum match score (default 0.5)
 * @returns true if match score >= threshold
 */
export function isMatch(searchText: string, targetText: string, threshold: number = 0.5): boolean {
  return fuzzyMatch(searchText, targetText) >= threshold;
}

/**
 * Filter array of items by fuzzy matching on a text field
 *
 * @param items - Array of items to filter
 * @param searchText - Text to search for
 * @param getTextField - Function to extract text field from item
 * @param threshold - Minimum match score (default 0.5)
 * @returns Filtered array sorted by match score (best first)
 */
export function filterByFuzzyMatch<T>(
  items: T[],
  searchText: string,
  getTextField: (item: T) => string,
  threshold: number = 0.5
): T[] {
  if (!searchText) return items;

  // Calculate match scores for all items
  const itemsWithScores = items
    .map(item => ({
      item,
      score: fuzzyMatch(searchText, getTextField(item))
    }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score); // Sort by score descending

  return itemsWithScores.map(({ item }) => item);
}

/**
 * Example usage:
 *
 * fuzzyMatch("פגישה עם אשתי", "פגישה עם אשתי ל") // → 0.9 (high match)
 * fuzzyMatch("אשתי", "פגישה עם אשתי") // → 0.9 (contains)
 * fuzzyMatch("דני", "פגישה עם דני") // → 0.9 (contains)
 * fuzzyMatch("פגישה דני", "פגישה חשובה עם דני") // → 0.7 (token overlap)
 *
 * isMatch("פגישה עם אשתי", "פגישה עם אשתי ל") // → true
 * isMatch("xyz", "פגישה עם דני") // → false
 *
 * const events = [
 *   { title: "פגישה עם דני" },
 *   { title: "פגישה עם אשתי" },
 *   { title: "קניות בסופר" }
 * ];
 * filterByFuzzyMatch(events, "פגישה", e => e.title)
 * // → [{ title: "פגישה עם דני" }, { title: "פגישה עם אשתי" }]
 */
