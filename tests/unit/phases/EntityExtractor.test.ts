import { describe, test, expect, beforeEach } from '@jest/globals';
import { EntityExtractor, ExtractedEntities } from '../../../src/domain/phases/phase3-entity-extraction/EntityExtractor.js';
import { DateTime } from 'luxon';

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;
  const timezone = 'Asia/Jerusalem';

  beforeEach(() => {
    extractor = new EntityExtractor();
  });

  describe('Complete Event Extraction (create_event)', () => {
    test('should extract full event details', () => {
      const text = 'פגישה עם רופא שיניים ביום שלישי בשעה 15:00 במשרד';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.title).toContain('פגישה');
      expect(result.time).toBe('15:00');
      expect(result.location).toBe('משרד');
      expect(result.confidence.time).toBeGreaterThan(0.9);
    });

    test('should extract event with contact name', () => {
      const text = 'פגישה עם דני ביום רביעי בשעה 14:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.contactNames).toContain('דני');
      expect(result.time).toBe('14:00');
    });

    test('should extract multiple contact names', () => {
      const text = 'פגישה עם דני ו-מיכל מחר בשעה 10:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.contactNames).toContain('דני');
      expect(result.contactNames).toContain('מיכל');
      expect(result.contactNames?.length).toBe(2);
    });
  });

  describe('Date/Time Extraction', () => {
    test('should extract relative date "היום"', () => {
      const text = 'פגישה היום בשעה 15:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeDefined();
      expect(result.time).toBe('15:00');
      expect(result.confidence.date).toBeGreaterThan(0.9);
    });

    test('should extract relative date "מחר"', () => {
      const text = 'פגישה מחר בשעה 10:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      const tomorrow = DateTime.now().setZone(timezone).plus({ days: 1 });
      expect(result.date).toBeDefined();
      expect(DateTime.fromJSDate(result.date!).day).toBe(tomorrow.day);
    });

    test('should extract relative date "מחרתיים"', () => {
      const text = 'פגישה מחרתיים בשעה 16:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      const dayAfterTomorrow = DateTime.now().setZone(timezone).plus({ days: 2 });
      expect(result.date).toBeDefined();
      expect(DateTime.fromJSDate(result.date!).day).toBe(dayAfterTomorrow.day);
    });

    test('should extract day of week "יום ראשון"', () => {
      const text = 'פגישה יום ראשון בשעה 09:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeDefined();
      const dt = DateTime.fromJSDate(result.date!).setZone(timezone);
      expect(dt.weekday % 7).toBe(0); // Sunday
    });

    test('should extract day of week "יום שלישי"', () => {
      const text = 'פגישה יום שלישי בשעה 14:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeDefined();
      const dt = DateTime.fromJSDate(result.date!).setZone(timezone);
      expect(dt.weekday % 7).toBe(2); // Tuesday
    });

    test('should extract absolute date DD/MM', () => {
      const text = 'פגישה ב-15/10 בשעה 12:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeDefined();
      const dt = DateTime.fromJSDate(result.date!).setZone(timezone);
      expect(dt.day).toBe(15);
      expect(dt.month).toBe(10);
    });

    test('should extract absolute date DD/MM/YYYY', () => {
      const text = 'פגישה ב-20/12/2025 בשעה 18:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeDefined();
      const dt = DateTime.fromJSDate(result.date!).setZone(timezone);
      expect(dt.day).toBe(20);
      expect(dt.month).toBe(12);
      expect(dt.year).toBe(2025);
    });

    test('should extract "שבוע הבא"', () => {
      const text = 'פגישה שבוע הבא בשעה 10:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      const nextWeek = DateTime.now().setZone(timezone).plus({ days: 7 });
      expect(result.date).toBeDefined();
      expect(Math.abs(DateTime.fromJSDate(result.date!).diff(nextWeek, 'days').days)).toBeLessThan(7);
    });
  });

  describe('Time Format Extraction', () => {
    test('should extract HH:MM format "בשעה 14:30"', () => {
      const text = 'פגישה מחר בשעה 14:30';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.time).toBe('14:30');
    });

    test('should extract time without minutes "בשעה 15"', () => {
      const text = 'פגישה מחר בשעה 15';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.time).toBe('15:00');
    });

    test('should handle AM/PM "3 אחרי הצהריים"', () => {
      const text = 'פגישה מחר בשעה 3 אחרי הצהריים';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.time).toBe('15:00'); // 3 PM = 15:00
    });

    test('should handle "בבוקר" (morning)', () => {
      const text = 'פגישה מחר בשעה 8 בבוקר';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.time).toBe('08:00');
    });

    test('should handle "בערב" (evening)', () => {
      const text = 'פגישה מחר בשעה 8 בערב';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.time).toBe('20:00'); // 8 PM = 20:00
    });

    test('should combine date and time into startTime', () => {
      const text = 'פגישה מחר בשעה 14:00';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.startTime).toBeDefined();
      const dt = DateTime.fromJSDate(result.startTime!).setZone(timezone);
      expect(dt.hour).toBe(14);
      expect(dt.minute).toBe(0);
    });
  });

  describe('Location Extraction', () => {
    test('should extract location "במשרד"', () => {
      const text = 'פגישה מחר בשעה 10 במשרד';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.location).toBe('משרד');
    });

    test('should extract location "ב-תל אביב"', () => {
      const text = 'פגישה מחר ב-תל אביב';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.location).toContain('תל אביב');
    });

    test('should extract location "במ רמת גן"', () => {
      const text = 'פגישה מחר במ רמת גן';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.location).toContain('רמת גן');
    });

    test('should NOT extract time as location', () => {
      const text = 'פגישה מחר בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.location).toBeUndefined();
      expect(result.time).toBe('10:00');
    });
  });

  describe('Title Extraction', () => {
    test('should extract title after removing date/time/location', () => {
      const text = 'פגישה עם רופא שיניים מחר בשעה 15:00 במשרד';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.title).toBeDefined();
      expect(result.title).toContain('פגישה');
      expect(result.title).not.toContain('מחר');
      expect(result.title).not.toContain('15:00');
    });

    test('should remove command prefix "קבע"', () => {
      const text = 'קבע פגישה עם דני מחר';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.title).toBeDefined();
      expect(result.title).not.toContain('קבע');
    });

    test('should remove command prefix "תזכיר"', () => {
      const text = 'תזכיר לי להתקשר לאמא מחר';
      const result = extractor.extractEntities(text, 'create_reminder', timezone);

      expect(result.title).toBeDefined();
      expect(result.title).not.toContain('תזכיר');
    });
  });

  describe('Duration Extraction', () => {
    test('should extract "שעה" (1 hour)', () => {
      const text = 'פגישה מחר שעה בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.duration).toBe(60); // minutes
    });

    test('should extract "2 שעות"', () => {
      const text = 'פגישה מחר 2 שעות בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.duration).toBe(120); // minutes
    });

    test('should extract "30 דקות"', () => {
      const text = 'פגישה מחר 30 דקות בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.duration).toBe(30);
    });

    test('should extract "חצי שעה"', () => {
      const text = 'פגישה מחר חצי שעה בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.duration).toBe(30);
    });

    test('should extract "רבע שעה"', () => {
      const text = 'פגישה מחר רבע שעה בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.duration).toBe(15);
    });
  });

  describe('Priority Extraction', () => {
    test('should extract "דחוף" as urgent', () => {
      const text = 'פגישה דחופה מחר בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.priority).toBe('urgent');
    });

    test('should extract "חשוב" as high', () => {
      const text = 'פגישה חשובה מחר בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.priority).toBe('high');
    });

    test('should extract "!" as high', () => {
      const text = 'פגישה מחר בשעה 10!';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.priority).toBe('high');
    });

    test('should extract "לא דחוף" as normal', () => {
      const text = 'פגישה לא דחופה מחר בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.priority).toBe('normal');
    });
  });

  describe('Search Query Extraction (search_event)', () => {
    test('should extract search term from "מה יש לי מחר"', () => {
      const text = 'מה יש לי מחר';
      const result = extractor.extractEntities(text, 'search_event', timezone);

      expect(result.date).toBeDefined();
      const tomorrow = DateTime.now().setZone(timezone).plus({ days: 1 });
      expect(DateTime.fromJSDate(result.date!).day).toBe(tomorrow.day);
    });

    test('should extract search term from "מתי הפגישה עם דני"', () => {
      const text = 'מתי הפגישה עם דני';
      const result = extractor.extractEntities(text, 'search_event', timezone);

      expect(result.title).toContain('הפגישה עם דני');
    });

    test('should remove query prefix "מה יש לי"', () => {
      const text = 'מה יש לי היום';
      const result = extractor.extractEntities(text, 'search_event', timezone);

      expect(result.title).not.toContain('מה יש לי');
    });

    test('should remove query prefix "הצג"', () => {
      const text = 'הצג את הפגישות מחר';
      const result = extractor.extractEntities(text, 'list_events', timezone);

      expect(result.title).not.toContain('הצג');
    });
  });

  describe('Update/Delete Target Extraction', () => {
    test('should extract update target from "עדכן פגישה עם דני"', () => {
      const text = 'עדכן פגישה עם דני לשעה 16:00';
      const result = extractor.extractEntities(text, 'update_event', timezone);

      expect(result.title).toContain('פגישה עם דני');
      expect(result.time).toBe('16:00');
    });

    test('should extract delete target from "מחק פגישה עם רופא"', () => {
      const text = 'מחק פגישה עם רופא';
      const result = extractor.extractEntities(text, 'delete_event', timezone);

      expect(result.title).toContain('פגישה עם רופא');
    });

    test('should remove delete prefix "תבטל"', () => {
      const text = 'תבטל את הפגישה מחר';
      const result = extractor.extractEntities(text, 'delete_event', timezone);

      expect(result.title).not.toContain('תבטל');
      expect(result.date).toBeDefined();
    });
  });

  describe('Confidence Scoring', () => {
    test('should return high confidence for complete event', () => {
      const text = 'פגישה עם דני מחר בשעה 14:00 במשרד';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      const overallConfidence = extractor.getOverallConfidence(result);
      expect(overallConfidence).toBeGreaterThan(0.85);
    });

    test('should return lower confidence for missing fields', () => {
      const text = 'פגישה';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      const overallConfidence = extractor.getOverallConfidence(result);
      expect(overallConfidence).toBeLessThan(0.5);
    });

    test('should calculate weighted confidence correctly', () => {
      const entities: ExtractedEntities = {
        title: 'פגישה',
        date: new Date(),
        time: '10:00',
        location: 'משרד',
        confidence: {
          title: 0.9,
          date: 0.95,
          time: 0.95,
          location: 0.85
        }
      };

      const overallConfidence = extractor.getOverallConfidence(entities);

      // Weighted: title(0.4) + date(0.3) + time(0.2) + location(0.1)
      // = 0.9*0.4 + 0.95*0.3 + 0.95*0.2 + 0.85*0.1
      // = 0.36 + 0.285 + 0.19 + 0.085 = 0.92
      expect(overallConfidence).toBeCloseTo(0.92, 2);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty text', () => {
      const text = '';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result).toBeDefined();
      expect(result.confidence.title).toBe(0);
    });

    test('should handle text with only whitespace', () => {
      const text = '   ';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result).toBeDefined();
    });

    test('should handle multiple spaces between words', () => {
      const text = 'פגישה    מחר    בשעה    10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeDefined();
      expect(result.time).toBe('10:00');
    });

    test('should handle mixed Hebrew and English', () => {
      const text = 'Meeting עם דני מחר בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.title).toContain('Meeting');
      expect(result.contactNames).toContain('דני');
    });

    test('should NOT extract date from gibberish', () => {
      const text = 'blah blah blah';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeUndefined();
    });
  });

  describe('Intent-Specific Behavior', () => {
    test('should extract differently for create_event', () => {
      const text = 'פגישה מחר בשעה 10';
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.title).toBeDefined();
      expect(result.date).toBeDefined();
      expect(result.time).toBe('10:00');
    });

    test('should extract differently for create_reminder', () => {
      const text = 'תזכיר לי מחר בשעה 10 להתקשר';
      const result = extractor.extractEntities(text, 'create_reminder', timezone);

      expect(result.title).toBeDefined();
      expect(result.title).toContain('להתקשר');
    });

    test('should extract differently for search_event', () => {
      const text = 'מה יש לי מחר';
      const result = extractor.extractEntities(text, 'search_event', timezone);

      expect(result.date).toBeDefined();
    });

    test('should handle unknown intent as generic', () => {
      const text = 'פגישה מחר בשעה 10';
      const result = extractor.extractEntities(text, 'unknown_intent', timezone);

      expect(result.title).toBeDefined();
      expect(result.date).toBeDefined();
    });
  });

  describe('Coverage - All Day Names', () => {
    const dayTests = [
      { hebrew: 'יום ראשון', day: 0 },
      { hebrew: 'יום שני', day: 1 },
      { hebrew: 'יום שלישי', day: 2 },
      { hebrew: 'יום רביעי', day: 3 },
      { hebrew: 'יום חמישי', day: 4 },
      { hebrew: 'יום שישי', day: 5 },
      { hebrew: 'שבת', day: 6 }
    ];

    test.each(dayTests)('should extract day $hebrew correctly', ({ hebrew, day }) => {
      const text = `פגישה ${hebrew} בשעה 10:00`;
      const result = extractor.extractEntities(text, 'create_event', timezone);

      expect(result.date).toBeDefined();
      const dt = DateTime.fromJSDate(result.date!).setZone(timezone);
      expect(dt.weekday % 7).toBe(day);
    });
  });
});
