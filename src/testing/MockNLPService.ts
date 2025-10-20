/**
 * Mock NLP Service for Testing (FREE - No API Calls!)
 *
 * Use this during tests to avoid AI API costs
 * Returns pre-defined responses based on message patterns
 */

import { NLPIntent } from '../services/NLPService.js';

export class MockNLPService {
  /**
   * Mock parseIntent - returns pre-defined intents based on keywords
   * NO API CALLS = $0 cost!
   */
  async parseIntent(
    userMessage: string,
    userContacts: any[],
    userTimezone: string = 'Asia/Jerusalem',
    conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
  ): Promise<NLPIntent> {

    const message = userMessage.toLowerCase();

    // ========================================
    // CREATE REMINDER PATTERNS
    // ========================================
    if (
      message.includes('תזכיר') ||
      message.includes('תזכורת') ||
      message.includes('תזכרי')
    ) {
      return {
        intent: 'create_reminder',
        confidence: 0.95,
        reminder: {
          title: this.extractReminderTitle(userMessage),
          dueDate: this.mockDate('tomorrow'),
          dateText: 'מחר'
        }
      };
    }

    // ========================================
    // CREATE EVENT PATTERNS
    // ========================================
    if (
      message.includes('תקבע') ||
      message.includes('פגישה') ||
      message.includes('אירוע') ||
      message.includes('meeting')
    ) {
      return {
        intent: 'create_event',
        confidence: 0.9,
        event: {
          title: this.extractEventTitle(userMessage),
          date: this.mockDate('next-week'),
          dateText: message.match(/\d{1,2}\.\d{1,2}/)?.[0] || 'השבוע הבא',
          location: this.extractLocation(userMessage),
          notes: this.extractNotes(userMessage)
        }
      };
    }

    // ========================================
    // SEARCH EVENT PATTERNS
    // ========================================
    if (
      message.includes('מתי') ||
      message.includes('איפה') ||
      message.includes('when') ||
      message.includes('search')
    ) {
      return {
        intent: 'search_event',
        confidence: 0.85,
        event: {
          title: this.extractSearchQuery(userMessage),
          dateText: ''
        }
      };
    }

    // ========================================
    // LIST ALL EVENTS PATTERNS
    // ========================================
    if (
      message.includes('כל האירועים') ||
      message.includes('הכל') ||
      message.includes('כל הפגישות') ||
      message.includes('list') ||
      message.includes('show all')
    ) {
      return {
        intent: 'list_events',
        confidence: 0.95,
        event: {
          title: '' // Empty title = list all
        }
      };
    }

    // ========================================
    // DELETE EVENT PATTERNS
    // ========================================
    if (
      message.includes('מחק') ||
      message.includes('בטל') ||
      message.includes('delete') ||
      message.includes('cancel')
    ) {
      return {
        intent: 'delete_event',
        confidence: 0.8,
        event: {
          title: this.extractSearchQuery(userMessage)
        }
      };
    }

    // ========================================
    // UNKNOWN / FALLBACK
    // ========================================
    return {
      intent: 'unknown',
      confidence: 0.3,
      clarificationNeeded: 'לא הבנתי. אפשר לנסח אחרת?'
    };
  }

  // ==========================================
  // HELPER METHODS FOR EXTRACTION
  // ==========================================

  private extractReminderTitle(message: string): string {
    // Remove trigger words
    let title = message
      .replace(/תזכיר לי/g, '')
      .replace(/תזכורת/g, '')
      .replace(/תזכרי/g, '')
      .replace(/הערות\s*-\s*.*/g, '') // Remove notes section
      .trim();

    // Extract before date patterns
    const dateMatch = title.match(/ביום|בשעה|ב-\d|מחר|עוד \d+ ימים/);
    if (dateMatch && dateMatch.index) {
      title = title.substring(0, dateMatch.index).trim();
    }

    return title || 'תזכורת';
  }

  private extractEventTitle(message: string): string {
    // Remove trigger words
    let title = message
      .replace(/תקבע לי אירוע/g, '')
      .replace(/תקבע אירוع/g, '')
      .replace(/פגישה עם/g, '')
      .replace(/פגישה/g, '')
      .replace(/אירוע/g, '')
      .trim();

    // Extract before date/time patterns
    const dateMatch = title.match(/לתאריך|ב-\d|בשעה|\d{1,2}\.\d{1,2}/);
    if (dateMatch && dateMatch.index) {
      title = title.substring(0, dateMatch.index).trim();
    }

    return title || 'אירוע';
  }

  private extractLocation(message: string): string | undefined {
    // Look for location keywords
    const locationMatch = message.match(/ב([א-ת\s]+)(?:\s|$)/);
    return locationMatch ? locationMatch[1].trim() : undefined;
  }

  private extractNotes(message: string): string | undefined {
    // Look for notes after "הערות -" pattern
    const notesMatch = message.match(/הערות\s*[-:]\s*(.+)/);
    return notesMatch ? notesMatch[1].trim() : undefined;
  }

  private extractSearchQuery(message: string): string {
    // Remove question words
    return message
      .replace(/מתי/g, '')
      .replace(/איפה/g, '')
      .replace(/יש לי/g, '')
      .replace(/when/gi, '')
      .replace(/where/gi, '')
      .trim();
  }

  private mockDate(when: 'tomorrow' | 'next-week' | 'today'): string {
    const now = new Date();

    switch (when) {
      case 'tomorrow':
        now.setDate(now.getDate() + 1);
        break;
      case 'next-week':
        now.setDate(now.getDate() + 7);
        break;
      case 'today':
      default:
        break;
    }

    return now.toISOString();
  }
}

// ==========================================
// USAGE EXAMPLE
// ==========================================

/*
// In your tests, replace real NLPService with MockNLPService:

// OLD (costs money):
const nlp = new NLPService();

// NEW (FREE):
const nlp = new MockNLPService();

// Works the same way:
const intent = await nlp.parseIntent('תזכיר לי לקנות חלב');
console.log(intent);
// { intent: 'create_reminder', confidence: 0.95, ... }
*/
