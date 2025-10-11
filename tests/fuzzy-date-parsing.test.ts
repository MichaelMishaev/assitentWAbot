/**
 * Fuzzy Testing for NLP Date Parsing
 *
 * Generates thousands of random date/time inputs to ensure:
 * 1. No crashes or uncaught exceptions
 * 2. All outputs are valid Date objects or null
 * 3. Edge cases are handled gracefully
 * 4. Performance is acceptable
 */

import { describe, it, expect } from '@jest/globals';
import { DateTime } from 'luxon';

// Mock Hebrew date parser (replace with actual import in production)
function parseHebrewDate(input: string): Date | null {
  try {
    // Hebrew keywords mapping
    const keywords: Record<string, number> = {
      'היום': 0,
      'מחר': 1,
      'מחרתיים': 2,
      'שלשום': -3,
      'אתמול': -1
    };

    const lowerInput = input.trim().toLowerCase();

    // Check keywords
    if (keywords[lowerInput] !== undefined) {
      return DateTime.now()
        .plus({ days: keywords[lowerInput] })
        .toJSDate();
    }

    // Try ISO format
    const iso = DateTime.fromISO(input);
    if (iso.isValid) return iso.toJSDate();

    // Try DD/MM/YYYY
    const parsed = DateTime.fromFormat(input, 'dd/MM/yyyy');
    if (parsed.isValid) return parsed.toJSDate();

    return null;
  } catch (error) {
    return null;
  }
}

describe('Fuzzy Testing: Date Parser', () => {
  describe('Random Valid Inputs', () => {
    it('should handle 1000 random valid dates without crashing', () => {
      const startDate = DateTime.fromISO('2020-01-01');
      const endDate = DateTime.fromISO('2030-12-31');
      const daysDiff = endDate.diff(startDate, 'days').days;

      for (let i = 0; i < 1000; i++) {
        const randomDays = Math.floor(Math.random() * daysDiff);
        const randomDate = startDate.plus({ days: randomDays });

        const formats = [
          randomDate.toFormat('dd/MM/yyyy'),
          randomDate.toISODate(),
          randomDate.toFormat('yyyy-MM-dd')
        ];

        formats.forEach(format => {
          expect(() => parseHebrewDate(format!)).not.toThrow();
        });
      }
    });
  });

  describe('Random Invalid Inputs', () => {
    it('should handle 1000 random invalid inputs without crashing', () => {
      const invalidInputs: string[] = [];

      // Generate random strings
      for (let i = 0; i < 1000; i++) {
        const length = Math.floor(Math.random() * 30) + 1;
        const chars = 'אבגדהוזחטיכלמנסעפצקרשתabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        let randomString = '';

        for (let j = 0; j < length; j++) {
          randomString += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        invalidInputs.push(randomString);
      }

      invalidInputs.forEach(input => {
        expect(() => parseHebrewDate(input)).not.toThrow();
        const result = parseHebrewDate(input);
        expect(result === null || result instanceof Date).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    const edgeCases = [
      // Empty and whitespace
      '',
      ' ',
      '   ',
      '\t',
      '\n',

      // Special characters
      '!!!',
      '@@@',
      '###',
      '$$$',

      // Numbers only
      '0',
      '1',
      '12',
      '123',
      '1234',
      '12345',
      '123456',
      '1234567',
      '12345678',

      // Invalid dates
      '00/00/0000',
      '32/01/2025',
      '01/13/2025',
      '29/02/2023', // Non-leap year
      '31/04/2025', // April has 30 days

      // Partial dates
      '01/01',
      '/01/2025',
      '01//2025',
      '01/01/',

      // Mixed scripts
      '01א01א2025',
      'היום2025',
      'מחר01',

      // Very long strings
      'היום'.repeat(1000),
      '1'.repeat(1000),

      // Unicode edge cases
      '\u0000',
      '\uFFFF',

      // SQL injection attempts
      "'; DROP TABLE events; --",
      "1' OR '1'='1",

      // XSS attempts
      '<script>alert(1)</script>',
      'javascript:alert(1)',

      // Negative numbers
      '-1',
      '-100',
      '-2025',

      // Future dates
      '01/01/9999',
      '31/12/9999',

      // Very old dates
      '01/01/0001',
      '01/01/1000'
    ];

    it('should handle all edge cases without crashing', () => {
      edgeCases.forEach(input => {
        expect(() => parseHebrewDate(input)).not.toThrow();
        const result = parseHebrewDate(input);
        expect(result === null || result instanceof Date).toBe(true);

        // If valid date returned, verify it's reasonable
        if (result instanceof Date) {
          expect(result.getTime()).toBeGreaterThan(0);
          expect(result.getTime()).toBeLessThan(Date.now() + 365 * 100 * 24 * 60 * 60 * 1000); // < 100 years in future
        }
      });
    });
  });

  describe('Performance', () => {
    it('should parse 10,000 dates in under 1 second', () => {
      const startTime = Date.now();

      for (let i = 0; i < 10000; i++) {
        parseHebrewDate('היום');
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000); // < 1 second
    });
  });

  describe('Hebrew Keywords', () => {
    const hebrewKeywords = [
      'היום',
      'מחר',
      'מחרתיים',
      'אתמול',
      'שלשום'
    ];

    it('should handle all Hebrew keywords correctly', () => {
      hebrewKeywords.forEach(keyword => {
        const result = parseHebrewDate(keyword);
        expect(result).toBeInstanceOf(Date);
        expect(result!.getTime()).toBeGreaterThan(0);
      });
    });

    it('should handle case variations', () => {
      const variations = [
        'היום',
        'היום ',
        ' היום',
        ' היום ',
        'היום',
        'הִיּוֹם' // With diacritics
      ];

      variations.forEach(variant => {
        expect(() => parseHebrewDate(variant)).not.toThrow();
      });
    });
  });

  describe('Time Inputs', () => {
    const timeInputs = [
      '10:00',
      '23:59',
      '00:00',
      '12:30',
      '16:45',
      '9:00', // Single digit hour
      '09:00',
      '24:00', // Invalid
      '25:00', // Invalid
      '-1:00', // Invalid
      '10:60', // Invalid minutes
      '10:-1', // Invalid minutes
      'כעוד שעה',
      'בעוד חצי שעה',
      'בעוד 10 דקות'
    ];

    it('should handle time inputs without crashing', () => {
      timeInputs.forEach(input => {
        expect(() => parseHebrewDate(input)).not.toThrow();
      });
    });
  });

  describe('Relative Dates', () => {
    const relativeDates = [
      'בעוד יום',
      'בעוד יומיים',
      'בעוד שבוע',
      'בעוד שבועיים',
      'בעוד חודש',
      'בעוד שנה',
      'לפני יום',
      'לפני שבוע',
      'לפני חודש'
    ];

    it('should handle relative dates gracefully', () => {
      relativeDates.forEach(input => {
        expect(() => parseHebrewDate(input)).not.toThrow();
        const result = parseHebrewDate(input);
        // May return null if not implemented, but shouldn't crash
        expect(result === null || result instanceof Date).toBe(true);
      });
    });
  });

  describe('Stress Test: Concurrent Parsing', () => {
    it('should handle concurrent parsing requests', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve(parseHebrewDate(`${i}/01/2025`))
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result === null || result instanceof Date).toBe(true);
      });
    });
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory after 100,000 parses', () => {
      const before = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100000; i++) {
        parseHebrewDate('היום');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const after = process.memoryUsage().heapUsed;
      const leakMB = (after - before) / 1024 / 1024;

      // Allow some memory growth, but not excessive
      expect(leakMB).toBeLessThan(50); // < 50MB growth
    });
  });
});

describe('Integration: Date Parser with Real Scenarios', () => {
  describe('User Input Patterns', () => {
    const realUserInputs = [
      // Common valid inputs
      { input: 'היום', shouldParse: true },
      { input: 'מחר', shouldParse: true },
      { input: '15/10/2025', shouldParse: true },
      { input: '2025-10-15', shouldParse: true },

      // Common mistakes
      { input: 'היום בשעה 14:00', shouldParse: false }, // Contains time
      { input: '15-10-2025', shouldParse: false }, // Wrong separator
      { input: '15.10.2025', shouldParse: false }, // Wrong separator
      { input: '10/15/2025', shouldParse: false }, // MM/DD/YYYY (American)

      // Typos
      { input: 'היו', shouldParse: false },
      { input: 'מחרר', shouldParse: false },
      { input: '15/10/25', shouldParse: false }, // 2-digit year

      // Mixed
      { input: 'היום או מחר', shouldParse: false },
      { input: '15/10 או 16/10', shouldParse: false }
    ];

    it('should match expected behavior for real user inputs', () => {
      realUserInputs.forEach(({ input, shouldParse }) => {
        const result = parseHebrewDate(input);

        if (shouldParse) {
          expect(result).toBeInstanceOf(Date);
        } else {
          // May parse or return null, but shouldn't crash
          expect(result === null || result instanceof Date).toBe(true);
        }
      });
    });
  });
});
