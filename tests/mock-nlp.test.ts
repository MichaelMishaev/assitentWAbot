/**
 * Tests using Mock NLP Service (FREE - No API Costs!)
 *
 * Run these instead of real AI tests to save money
 */

import { describe, test, expect } from '@jest/globals';
import { MockNLPService } from '../src/testing/MockNLPService';

describe('Mock NLP Tests (FREE - No API Calls)', () => {
  const mockNLP = new MockNLPService();

  describe('Reminder Detection', () => {
    test('should detect "תזכורת" as create_reminder', async () => {
      const result = await mockNLP.parseIntent('תזכורת לקנות חלב מחר', [], 'Asia/Jerusalem');

      expect(result.intent).toBe('create_reminder');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.reminder?.title).toContain('קנות חלב');
    });

    test('should detect "תזכיר לי" as create_reminder', async () => {
      const result = await mockNLP.parseIntent('תזכיר לי לשלם חשמל', [], 'Asia/Jerusalem');

      expect(result.intent).toBe('create_reminder');
      expect(result.reminder?.title).toContain('שלם חשמל');
    });
  });

  describe('Event Creation', () => {
    test('should detect event with date and time', async () => {
      const result = await mockNLP.parseIntent(
        'תקבע לי אירוע של ריקודים לתאריך 1.11 בשעה 13:00',
        [],
        'Asia/Jerusalem'
      );

      expect(result.intent).toBe('create_event');
      expect(result.event?.title).toContain('ריקודים');
      expect(result.event?.dateText).toBe('1.11');
    });

    test('should extract notes from reminder', async () => {
      const result = await mockNLP.parseIntent(
        'תזכיר לי לבדוק טיסה. הערות - נוחת ב16:45',
        [],
        'Asia/Jerusalem'
      );

      expect(result.intent).toBe('create_reminder');
      expect(result.reminder?.title).toContain('בדוק טיסה');
    });
  });

  describe('Search Events', () => {
    test('should detect "מתי" as search', async () => {
      const result = await mockNLP.parseIntent('מתי יקיר', [], 'Asia/Jerusalem');

      expect(result.intent).toBe('search_event');
      expect(result.event?.title).toContain('יקיר');
    });
  });

  describe('List All Events', () => {
    test('should detect "כל האירועים שלי" as list_events', async () => {
      const result = await mockNLP.parseIntent('כל האירועים שלי', [], 'Asia/Jerusalem');

      expect(result.intent).toBe('list_events');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('should detect "הכל" as list_events', async () => {
      const result = await mockNLP.parseIntent('הכל', [], 'Asia/Jerusalem');

      expect(result.intent).toBe('list_events');
    });
  });

  describe('Delete Events', () => {
    test('should detect "מחק" as delete', async () => {
      const result = await mockNLP.parseIntent('מחק אירוע ריקודים', [], 'Asia/Jerusalem');

      expect(result.intent).toBe('delete_event');
      expect(result.event?.title).toContain('ריקודים');
    });
  });
});

// ==========================================
// COST COMPARISON
// ==========================================

/*
REAL AI TESTS:
  - 20 messages × 2 AI models = 40 API calls
  - Cost: ~$0.01-$0.02 per run
  - Time: ~30-60 seconds (waiting for AI)

MOCK AI TESTS:
  - 0 API calls
  - Cost: $0 (FREE!)
  - Time: ~1-2 seconds (instant)

Run 1000 times:
  - Real AI: $10-20
  - Mock AI: $0

💡 Use Mock AI for rapid development and CI/CD!
*/
