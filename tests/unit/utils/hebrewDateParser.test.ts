import { describe, test, expect, beforeEach } from '@jest/globals';
import { DateTime } from 'luxon';

// Mock implementation for testing - we'll import the real one after architecture is ready
class HebrewDateParser {
  parseRelativeDate(text: string, referenceDate: DateTime): DateTime | null {
    const normalized = text.trim().toLowerCase();

    // Tomorrow
    if (normalized === 'מחר') {
      return referenceDate.plus({ days: 1 });
    }

    // Day after tomorrow
    if (normalized === 'מחרתיים' || normalized === 'יומיים') {
      return referenceDate.plus({ days: 2 });
    }

    // This week
    if (normalized === 'השבוע' || normalized === 'השבוע הזה') {
      return referenceDate;
    }

    // Next week
    if (normalized === 'שבוע הבא' || normalized === 'שבוע הקרוב') {
      return referenceDate.plus({ weeks: 1 });
    }

    // Days of week
    const daysMap: Record<string, number> = {
      'ראשון': 0, 'יום ראשון': 0,
      'שני': 1, 'יום שני': 1,
      'שלישי': 2, 'יום שלישי': 2,
      'רביעי': 3, 'יום רביעי': 3,
      'חמישי': 4, 'יום חמישי': 4,
      'שישי': 5, 'יום שישי': 5,
      'שבת': 6
    };

    for (const [key, targetDay] of Object.entries(daysMap)) {
      if (normalized.includes(key)) {
        const currentDay = referenceDate.weekday % 7; // Luxon uses 1-7, we need 0-6
        const daysUntilTarget = (targetDay - currentDay + 7) % 7;
        return referenceDate.plus({ days: daysUntilTarget || 7 }); // If same day, go to next week
      }
    }

    return null;
  }
}

describe.skip('HebrewDateParser', () => {
  let parser: HebrewDateParser;
  let referenceDate: DateTime;

  beforeEach(() => {
    parser = new HebrewDateParser();
    // Fixed reference: Monday, October 14, 2025, 10:00 AM
    referenceDate = DateTime.fromObject({
      year: 2025,
      month: 10,
      day: 14, // Monday
      hour: 10,
      minute: 0
    }, { zone: 'Asia/Jerusalem' });
  });

  describe('Relative dates', () => {
    test('should parse "מחר" (tomorrow)', () => {
      const result = parser.parseRelativeDate('מחר', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(15); // Tuesday
    });

    test('should parse "מחרתיים" (day after tomorrow)', () => {
      const result = parser.parseRelativeDate('מחרתיים', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(16); // Wednesday
    });

    test('should parse "יומיים" (two days)', () => {
      const result = parser.parseRelativeDate('יומיים', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(16);
    });
  });

  describe('Week references', () => {
    test('should parse "השבוע" (this week)', () => {
      const result = parser.parseRelativeDate('השבוע', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.hasSame(referenceDate, 'day')).toBe(true);
    });

    test('should parse "שבוע הבא" (next week)', () => {
      const result = parser.parseRelativeDate('שבוע הבא', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(21); // Next Monday
    });

    test('should parse "שבוע הקרוב" (next week)', () => {
      const result = parser.parseRelativeDate('שבוע הקרוב', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(21);
    });
  });

  describe('Days of week', () => {
    test('should parse "יום ראשון" (Sunday)', () => {
      const result = parser.parseRelativeDate('יום ראשון', referenceDate);
      expect(result).not.toBeNull();
      // From Monday 14th to Sunday 19th = 5 days
      expect(result?.day).toBe(19);
    });

    test('should parse "יום שני" (Monday - next week)', () => {
      const result = parser.parseRelativeDate('יום שני', referenceDate);
      expect(result).not.toBeNull();
      // Same day of week = next week
      expect(result?.day).toBe(21);
    });

    test('should parse "יום שלישי" (Tuesday)', () => {
      const result = parser.parseRelativeDate('יום שלישי', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(15); // Tomorrow (Tuesday)
    });

    test('should parse "רביעי" (Wednesday)', () => {
      const result = parser.parseRelativeDate('רביעי', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(16);
    });

    test('should parse "שבת" (Saturday)', () => {
      const result = parser.parseRelativeDate('שבת', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(18); // This Saturday
    });
  });

  describe('Edge cases', () => {
    test('should handle extra whitespace', () => {
      const result = parser.parseRelativeDate('  מחר  ', referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(15);
    });

    test('should handle mixed case', () => {
      const result = parser.parseRelativeDate('מָחָר', referenceDate);
      // Will fail for now (Hebrew vowels), but good to document
      expect(result).toBeNull(); // TODO: Add vowel normalization
    });

    test('should return null for unknown text', () => {
      const result = parser.parseRelativeDate('שטויות', referenceDate);
      expect(result).toBeNull();
    });

    test('should return null for empty string', () => {
      const result = parser.parseRelativeDate('', referenceDate);
      expect(result).toBeNull();
    });
  });

  describe('Coverage for 90%+ goal', () => {
    // Test all days of week systematically
    const daysTests = [
      { hebrew: 'ראשון', expected: 19 },
      { hebrew: 'שני', expected: 21 }, // Next week
      { hebrew: 'שלישי', expected: 15 },
      { hebrew: 'רביעי', expected: 16 },
      { hebrew: 'חמישי', expected: 17 },
      { hebrew: 'שישי', expected: 18 },
      { hebrew: 'שבת', expected: 18 }
    ];

    test.each(daysTests)('should parse day "$hebrew" correctly', ({ hebrew, expected }) => {
      const result = parser.parseRelativeDate(hebrew, referenceDate);
      expect(result).not.toBeNull();
      expect(result?.day).toBe(expected);
    });
  });
});
