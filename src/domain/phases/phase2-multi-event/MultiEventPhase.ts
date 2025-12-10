/**
 * Phase 2: Multi-Event/Reminder Detection (ENHANCED)
 *
 * Detects when user wants to create multiple items in one message:
 * - Multiple events: "פגישה ביום שני ו ביום שלישי" → 2 events
 * - Multiple reminders: "תזכיר לי ב8 לעשות X ותזכיר ב9 לעשות Y" → 2 reminders
 * - Multiple time-based reminders: "תזכיר לי מחר בשעה 8...9...9:30...10..." → N reminders
 *
 * NEW: Detects multiple time expressions in reminder messages (BUG FIX for user 972536268162)
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';

interface DetectedItem {
  type: 'event' | 'reminder';
  text: string;
  timeExpression?: string; // For reminders with time
  taskDescription?: string; // What to remind about
}

export class MultiEventPhase extends BasePhase {
  readonly name = 'multi-event-detector';
  readonly order = 2;
  readonly description = 'Detect multiple events/reminders in single message';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    return !context.entities.isMultiEvent;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const text = context.processedText;
      const intent = context.intent;

      // NEW: Detect multiple reminders with different times
      if (intent === 'create_reminder') {
        const multiReminder = this.detectMultiReminder(text);
        if (multiReminder.isMulti) {
          return this.handleMultiReminder(context, multiReminder.items);
        }
      }

      // Original: Detect multiple events
      const isMultiEvent = this.detectMultiEvent(text);
      if (isMultiEvent) {
        const events = this.splitEvents(text);
        return this.handleMultiEvent(context, events);
      }

      return this.success({ isMultiEvent: false });

    } catch (error) {
      logger.error('Multi-event detection failed', { error });
      return this.success({ isMultiEvent: false }, ['Multi-event detection failed']);
    }
  }

  /**
   * NEW: Detect multiple reminders in one message
   * Pattern: "תזכיר לי מחר בשעה 8 לעשות X, בשעה 9 לעשות Y, בשעה 10 לעשות Z"
   */
  private detectMultiReminder(text: string): { isMulti: boolean; items: DetectedItem[] } {
    const items: DetectedItem[] = [];

    // Pattern 1: Multiple explicit time expressions with tasks
    // "ב8 לעשות X", "בשעה 9 לעשות Y", "9:30 לעשות Z"
    const timeTaskPatterns = [
      /(?:בשעה\s+|ב-?|ל)(\d{1,2}(?::\d{2})?)\s*(?:בבוקר|בערב|בצהריים)?\s+(.*?)(?=\s*(?:בשעה|ב-?\d|ל\d|\d{1,2}:\d{2}|$))/gi,
      /(\d{1,2}:\d{2})\s+(.*?)(?=\s*(?:\d{1,2}:\d{2}|$))/gi
    ];

    for (const pattern of timeTaskPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const timeExpr = match[1];
        const task = match[2]?.trim();

        if (timeExpr && task && task.length > 5) { // Minimum task length
          items.push({
            type: 'reminder',
            text: `${timeExpr} ${task}`,
            timeExpression: timeExpr,
            taskDescription: task
          });
        }
      }
    }

    // Pattern 2: Newline-separated reminders
    // "8 בבוקר לבדוק X\n9 לגבי Y\n9:30 תזכורת Z"
    const lines = text.split(/\n+/);
    if (lines.length >= 3) {
      const timeLinePattern = /^(?:בשעה\s+|ב-?)?(\d{1,2}(?::\d{2})?)\s*(?:בבוקר|בערב|בצהריים)?\s+(.*)/i;

      let lineMatches = 0;
      const lineItems: DetectedItem[] = [];

      for (const line of lines) {
        const match = line.match(timeLinePattern);
        if (match) {
          const timeExpr = match[1];
          const task = match[2]?.trim();

          if (task && task.length > 5) {
            lineMatches++;
            lineItems.push({
              type: 'reminder',
              text: line.trim(),
              timeExpression: timeExpr,
              taskDescription: task
            });
          }
        }
      }

      // If we found 3+ lines with time+task, it's multi-reminder
      if (lineMatches >= 3) {
        return { isMulti: true, items: lineItems };
      }
    }

    // If we found 2+ time-task pairs, it's multi-reminder
    const isMulti = items.length >= 2;

    return { isMulti, items };
  }

  /**
   * Handle multiple reminders detected
   */
  private handleMultiReminder(context: PhaseContext, items: DetectedItem[]): PhaseResult {
    context.entities.isMultiEvent = true;
    context.entities.isMultiReminder = true;
    context.entities.splitItems = items;

    logger.info('🔔 Multiple reminders detected!', {
      count: items.length,
      times: items.map(i => i.timeExpression),
      text: context.processedText.substring(0, 100)
    });

    // Add helpful metadata for router
    context.setMetadata('multiReminderCount', items.length);
    context.setMetadata('multiReminderNeedsConfirmation', true);

    return this.success({
      isMultiReminder: true,
      reminderCount: items.length,
      items,
      message: `זיהיתי ${items.length} תזכורות. האם תרצה שאיצור את כולן?`
    });
  }

  /**
   * Original: Detect if message contains multiple events
   */
  private detectMultiEvent(text: string): boolean {
    const multiEventPatterns = [
      /ו.*פגישה/i,
      /גם.*אירוע/i,
      /בנוסף/i,
      /ועוד/i,
      /שתי.*פגישות/i,
      /שני.*אירועים/i,
    ];

    const hasMultiPattern = multiEventPatterns.some(pattern => pattern.test(text));
    if (!hasMultiPattern) {
      return false;
    }

    const isDuration = /משעה.*עד/i.test(text) || /מ-.*עד/i.test(text);
    if (isDuration) {
      return false;
    }

    const dateReferences = this.countDateReferences(text);
    if (dateReferences >= 2) {
      return true;
    }

    return false;
  }

  /**
   * Handle multiple events detected
   */
  private handleMultiEvent(context: PhaseContext, events: Array<Partial<any>>): PhaseResult {
    context.entities.isMultiEvent = true;
    context.entities.splitEvents = events;

    logger.info('Multi-event detected', {
      count: events.length,
      text: context.processedText.substring(0, 100)
    });

    return this.success({
      isMultiEvent: true,
      eventCount: events.length,
      events
    });
  }

  /**
   * Count date references in text
   */
  private countDateReferences(text: string): number {
    const datePatterns = [
      /יום ראשון/gi,
      /יום שני/gi,
      /יום שלישי/gi,
      /יום רביעי/gi,
      /יום חמישי/gi,
      /יום שישי/gi,
      /שבת/gi,
      /מחר/gi,
      /מחרתיים/gi,
      /\d{1,2}\/\d{1,2}/g
    ];

    let count = 0;
    for (const pattern of datePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  }

  /**
   * Split text into multiple event descriptions
   */
  private splitEvents(text: string): Array<Partial<any>> {
    const events: Array<Partial<any>> = [];
    const parts = text.split(/\sו\s|\sגם\s|\sבנוסף\s/i);

    for (const part of parts) {
      if (part.trim().length > 0) {
        events.push({
          text: part.trim()
        });
      }
    }

    return events.length > 1 ? events : [];
  }
}
