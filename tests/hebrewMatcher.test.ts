/**
 * Hebrew Fuzzy Matcher - Comprehensive Test Suite
 *
 * Tests all logical operations, edge cases, and Hebrew variations
 */

import { fuzzyMatch, isMatch, filterByFuzzyMatch } from '../src/utils/hebrewMatcher';

describe('Hebrew Fuzzy Matcher', () => {

  // ==========================================
  // EXACT MATCH TESTS (Score: 1.0)
  // ==========================================

  describe('Exact Matches', () => {
    test('identical Hebrew text', () => {
      expect(fuzzyMatch('פגישה עם דני', 'פגישה עם דני')).toBe(1.0);
    });

    test('identical with different case (Hebrew has no case, but testing)', () => {
      expect(fuzzyMatch('HELLO', 'hello')).toBe(1.0);
    });

    test('identical after normalization (punctuation removed)', () => {
      expect(fuzzyMatch('פגישה, עם דני!', 'פגישה עם דני')).toBeGreaterThanOrEqual(0.9);
    });

    test('identical with extra spaces', () => {
      expect(fuzzyMatch('פגישה  עם   דני', 'פגישה עם דני')).toBe(1.0);
    });
  });

  // ==========================================
  // SUBSTRING MATCH TESTS (Score: 0.9)
  // ==========================================

  describe('Substring Matches', () => {
    test('search text is substring of target', () => {
      const score = fuzzyMatch('פגישה', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    test('target contains search text', () => {
      const score = fuzzyMatch('דני', 'פגישה עם דני במשרד');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    test('search text with extra characters', () => {
      const score = fuzzyMatch('פגישה עם אשתי', 'פגישה עם אשתי ל');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    test('target has extra prefix', () => {
      const score = fuzzyMatch('דני', 'אירוע עם דני');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    test('target has extra suffix', () => {
      const score = fuzzyMatch('פגישה עם אמא', 'פגישה עם אמא בבית');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ==========================================
  // TOKEN-BASED MATCH TESTS (Score: 0.5-0.9)
  // ==========================================

  describe('Token-Based Matches', () => {
    test('50% token overlap', () => {
      const score = fuzzyMatch('פגישה חשובה', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('all search tokens present', () => {
      const score = fuzzyMatch('פגישה דני', 'פגישה חשובה עם דני במשרד');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('partial token match', () => {
      const score = fuzzyMatch('פגיש', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('multiple tokens match', () => {
      const score = fuzzyMatch('דני פגישה', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // STOP WORDS TESTS
  // ==========================================

  describe('Hebrew Stop Words Filtering', () => {
    test('filters common Hebrew prepositions', () => {
      // "עם" (with) should be filtered
      const score = fuzzyMatch('פגישה דני', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('filters "את" (object marker)', () => {
      const score = fuzzyMatch('פגישה דני', 'פגישה את דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('filters "של" (of)', () => {
      const score = fuzzyMatch('אירוע אמא', 'אירוע של אמא');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('filters multiple stop words', () => {
      const score = fuzzyMatch('פגישה דני', 'פגישה עם את דני של');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('filters English stop words', () => {
      const score = fuzzyMatch('meeting danny', 'meeting with danny');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // REAL-WORLD USER SCENARIOS
  // ==========================================

  describe('Real User Delete Scenarios', () => {
    test('user says "תבטל את הפגישה עם אשתי" - event is "פגישה עם אשתי ל"', () => {
      const score = fuzzyMatch('פגישה עם אשתי', 'פגישה עם אשתי ל');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('user says "מחק האירוע עם דני" - event is "פגישה חשובה עם דני"', () => {
      const score = fuzzyMatch('דני', 'פגישה חשובה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('user says "מחק את הפגישה" - event is "פגישה עם הבוס"', () => {
      const score = fuzzyMatch('פגישה', 'פגישה עם הבוס');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('user says "בטל אירוע אמא" - event is "אירוע עם אמא ביום שישי"', () => {
      const score = fuzzyMatch('אירוע אמא', 'אירוע עם אמא ביום שישי');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('user says "תזרוק את זה עם אבא" - event is "פגישה עם אבא"', () => {
      const score = fuzzyMatch('אבא', 'פגישה עם אבא');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // NO MATCH SCENARIOS
  // ==========================================

  describe('Non-Matches', () => {
    test('completely different text', () => {
      const score = fuzzyMatch('xyz', 'פגישה עם דני');
      expect(score).toBeLessThan(0.5);
    });

    test('no common tokens', () => {
      const score = fuzzyMatch('אירוע חשוב', 'פגישה עם דני');
      expect(score).toBeLessThan(0.5);
    });

    test('random English vs Hebrew', () => {
      const score = fuzzyMatch('random text', 'פגישה עם דני');
      expect(score).toBeLessThan(0.5);
    });

    test('numbers only', () => {
      const score = fuzzyMatch('123', 'פגישה עם דני');
      expect(score).toBeLessThan(0.5);
    });
  });

  // ==========================================
  // EDGE CASES
  // ==========================================

  describe('Edge Cases', () => {
    test('empty search text', () => {
      expect(fuzzyMatch('', 'פגישה עם דני')).toBe(0);
    });

    test('empty target text', () => {
      expect(fuzzyMatch('פגישה', '')).toBe(0);
    });

    test('both empty', () => {
      expect(fuzzyMatch('', '')).toBe(0);
    });

    test('only stop words', () => {
      const score = fuzzyMatch('את עם של', 'ב על כ');
      expect(score).toBeLessThan(0.5);
    });

    test('single character (filtered out)', () => {
      expect(fuzzyMatch('א', 'פגישה עם דני')).toBe(0);
    });

    test('only spaces', () => {
      expect(fuzzyMatch('   ', 'פגישה עם דני')).toBe(0);
    });

    test('special characters only', () => {
      expect(fuzzyMatch('!@#$%', 'פגישה עם דני')).toBe(0);
    });

    test('very long text', () => {
      const longText = 'פגישה '.repeat(100) + 'דני';
      const score = fuzzyMatch('דני', longText);
      expect(score).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // isMatch() HELPER TESTS
  // ==========================================

  describe('isMatch Helper Function', () => {
    test('returns true for high score', () => {
      expect(isMatch('פגישה', 'פגישה עם דני', 0.5)).toBe(true);
    });

    test('returns false for low score', () => {
      expect(isMatch('xyz', 'פגישה עם דני', 0.5)).toBe(false);
    });

    test('custom threshold 0.9', () => {
      expect(isMatch('פגישה', 'פגישה עם דני', 0.9)).toBe(true);
      // Both tokens "פגישה" and "דני" are found, so this is a strong match (100% overlap)
      expect(isMatch('פגישה דני', 'פגישה חשובה עם דני במשרד', 0.9)).toBe(true);
    });

    test('custom threshold 0.3', () => {
      expect(isMatch('פגישה', 'אירוע חשוב פגישה', 0.3)).toBe(true);
    });
  });

  // ==========================================
  // filterByFuzzyMatch() ARRAY TESTS
  // ==========================================

  describe('filterByFuzzyMatch Array Function', () => {
    const events = [
      { id: 1, title: 'פגישה עם דני' },
      { id: 2, title: 'פגישה עם אשתי ל' },
      { id: 3, title: 'אירוע חשוב במשרד' },
      { id: 4, title: 'פגישה חשובה עם הבוס' },
      { id: 5, title: 'קניות בסופר' }
    ];

    test('filters and sorts by match score', () => {
      const results = filterByFuzzyMatch(events, 'פגישה', e => e.title, 0.5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('פגישה');
    });

    test('returns single exact match', () => {
      const results = filterByFuzzyMatch(events, 'קניות בסופר', e => e.title, 0.9);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(5);
    });

    test('returns multiple matches sorted', () => {
      const results = filterByFuzzyMatch(events, 'פגישה', e => e.title, 0.5);
      expect(results.length).toBeGreaterThanOrEqual(3);
      // First result should have highest score
      expect(results[0].title).toMatch(/פגישה/);
    });

    test('returns no matches for unrelated search', () => {
      const results = filterByFuzzyMatch(events, 'xyz', e => e.title, 0.5);
      expect(results).toHaveLength(0);
    });

    test('finds by contact name only', () => {
      const results = filterByFuzzyMatch(events, 'דני', e => e.title, 0.5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(1);
    });

    test('finds by partial title', () => {
      const results = filterByFuzzyMatch(events, 'אשתי', e => e.title, 0.5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(2);
    });

    test('empty search returns all items', () => {
      const results = filterByFuzzyMatch(events, '', e => e.title, 0.5);
      expect(results).toHaveLength(events.length);
    });

    test('higher threshold filters more strictly', () => {
      const loose = filterByFuzzyMatch(events, 'פגישה חשובה', e => e.title, 0.3);
      const strict = filterByFuzzyMatch(events, 'פגישה חשובה', e => e.title, 0.9);
      expect(loose.length).toBeGreaterThanOrEqual(strict.length);
    });
  });

  // ==========================================
  // PUNCTUATION & NORMALIZATION TESTS
  // ==========================================

  describe('Punctuation & Normalization', () => {
    test('handles Hebrew punctuation ״׳', () => {
      const score = fuzzyMatch('״פגישה״', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('handles question marks', () => {
      const score = fuzzyMatch('פגישה?', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('handles exclamation marks', () => {
      const score = fuzzyMatch('פגישה!', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('handles commas', () => {
      const score = fuzzyMatch('פגישה, דני', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('handles periods', () => {
      const score = fuzzyMatch('פגישה. דני.', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('handles dashes and underscores', () => {
      const score = fuzzyMatch('פגישה-דני', 'פגישה עם דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // MIXED LANGUAGE TESTS
  // ==========================================

  describe('Mixed Hebrew/English', () => {
    test('Hebrew with English name', () => {
      const score = fuzzyMatch('פגישה Danny', 'פגישה עם Danny במשרד');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('English with Hebrew word', () => {
      const score = fuzzyMatch('meeting דני', 'meeting with דני');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('finds English name in Hebrew context', () => {
      const score = fuzzyMatch('Danny', 'פגישה עם Danny');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // FAMILY RELATIONS TESTS (Common Use Case)
  // ==========================================

  describe('Family Relations Matching', () => {
    test('finds by "אמא"', () => {
      const score = fuzzyMatch('אמא', 'פגישה עם אמא');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('finds by "אבא"', () => {
      const score = fuzzyMatch('אבא', 'אירוע עם אבא');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('finds by "אחות"', () => {
      const score = fuzzyMatch('אחות', 'פגישה עם אחות שלי');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('finds by "אח"', () => {
      const score = fuzzyMatch('אח', 'אירוע עם אח');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('finds by "סבתא"', () => {
      const score = fuzzyMatch('סבתא', 'ביקור אצל סבתא');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ==========================================
  // EVENT TYPES MATCHING
  // ==========================================

  describe('Event Types Matching', () => {
    const events = [
      { title: 'פגישה עם דני במשרד' },
      { title: 'יום הולדת של אמא' },
      { title: 'תור לרופא שיניים' },
      { title: 'פגישת עבודה חשובה' },
      { title: 'קניות שבועיות בסופר' }
    ];

    test('finds "פגישה" type events', () => {
      const results = filterByFuzzyMatch(events, 'פגישה', e => e.title, 0.5);
      expect(results.length).toBeGreaterThanOrEqual(1); // At least the exact "פגישה עם דני" match
    });

    test('finds "תור" (appointment) type events', () => {
      const results = filterByFuzzyMatch(events, 'תור', e => e.title, 0.5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test('finds "יום הולדת" (birthday) events', () => {
      const results = filterByFuzzyMatch(events, 'יום הולדת', e => e.title, 0.5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test('finds "עבודה" (work) related events', () => {
      const results = filterByFuzzyMatch(events, 'עבודה', e => e.title, 0.5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // PERFORMANCE TESTS
  // ==========================================

  describe('Performance', () => {
    test('handles 100 events in reasonable time', () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        title: `פגישה ${i} עם אדם ${i}`
      }));

      const start = Date.now();
      const results = filterByFuzzyMatch(events, 'פגישה', e => e.title, 0.5);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should take < 100ms
      expect(results.length).toBe(100);
    });

    test('handles 500 events', () => {
      const events = Array.from({ length: 500 }, (_, i) => ({
        id: i,
        title: `אירוע ${i}`
      }));

      const start = Date.now();
      const results = filterByFuzzyMatch(events, 'אירוע', e => e.title, 0.5);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // Should take < 500ms
      expect(results.length).toBe(500);
    });
  });

  // ==========================================
  // REGRESSION TESTS (Based on Bug Reports)
  // ==========================================

  describe('Regression Tests - Previously Reported Bugs', () => {
    test('Bug: "תבטל את הפגישה עם אשתי" didnt find "פגישה עם אשתי ל"', () => {
      const events = [{ title: 'פגישה עם אשתי ל' }];
      const results = filterByFuzzyMatch(events, 'פגישה עם אשתי', e => e.title, 0.5);
      expect(results.length).toBeGreaterThan(0);
    });

    test('Bug: "מחק האירוע עם דני" didnt find "פגישה חשובה עם דני"', () => {
      const events = [{ title: 'פגישה חשובה עם דני' }];
      const results = filterByFuzzyMatch(events, 'דני', e => e.title, 0.5);
      expect(results.length).toBeGreaterThan(0);
    });

    test('Bug: Partial name should match full title', () => {
      const events = [{ title: 'פגישה חשובה עם דני במשרד בתל אביב' }];
      const results = filterByFuzzyMatch(events, 'דני', e => e.title, 0.5);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
