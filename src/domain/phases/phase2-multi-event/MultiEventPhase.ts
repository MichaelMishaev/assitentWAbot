/**
 * Phase 2: Multi-Event Detection
 *
 * Detects when user wants to create multiple events in one message:
 * - "פגישה ביום שני ו ביום שלישי" → 2 events
 * - "פגישה משעה 8 עד 10" → 1 event with duration (NOT multi-event)
 *
 * Priority: #6
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';

export class MultiEventPhase extends BasePhase {
  readonly name = 'multi-event-detector';
  readonly order = 2;
  readonly description = 'Detect multiple events in single message';
  readonly isRequired = false;

  /**
   * Only run if we haven't already detected multi-event
   */
  async shouldRun(context: PhaseContext): Promise<boolean> {
    return !context.entities.isMultiEvent;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const text = context.processedText;

      // Check for multi-event patterns
      const isMultiEvent = this.detectMultiEvent(text);

      if (isMultiEvent) {
        const events = this.splitEvents(text);

        context.entities.isMultiEvent = true;
        context.entities.splitEvents = events;

        logger.info('Multi-event detected', {
          count: events.length,
          text: text.substring(0, 100)
        });

        return this.success({
          isMultiEvent: true,
          eventCount: events.length,
          events
        });
      }

      return this.success({ isMultiEvent: false });

    } catch (error) {
      logger.error('Multi-event detection failed', { error });
      return this.success({ isMultiEvent: false }, ['Multi-event detection failed']);
    }
  }

  /**
   * Detect if message contains multiple events
   */
  private detectMultiEvent(text: string): boolean {
    // Patterns that indicate multiple events
    const multiEventPatterns = [
      /ו.*פגישה/i,        // "ו פגישה" (and meeting)
      /גם.*אירוע/i,       // "גם אירוע" (also event)
      /בנוסף/i,            // "בנוסף" (in addition)
      /ועוד/i,             // "ועוד" (and also)
      /שתי.*פגישות/i,     // "שתי פגישות" (two meetings)
      /שני.*אירועים/i,    // "שני אירועים" (two events)
    ];

    // Check for conjunction patterns
    const hasMultiPattern = multiEventPatterns.some(pattern => pattern.test(text));

    if (!hasMultiPattern) {
      return false;
    }

    // Make sure it's not just a duration
    // "משעה 8 עד 10" is NOT multi-event
    const isDuration = /משעה.*עד/i.test(text) || /מ-.*עד/i.test(text);
    if (isDuration) {
      return false;
    }

    // Count date references
    const dateReferences = this.countDateReferences(text);
    if (dateReferences >= 2) {
      return true;
    }

    return false;
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
      /\d{1,2}\/\d{1,2}/g  // DD/MM format
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
    // This is a simplified version
    // In production, this would use more sophisticated NLP

    const events: Array<Partial<any>> = [];

    // Try to split by conjunction
    const parts = text.split(/\sו\s|\sגם\s|\sבנוסף\s/i);

    for (const part of parts) {
      if (part.trim().length > 0) {
        events.push({
          text: part.trim()
          // Entity extraction happens in Phase 3
        });
      }
    }

    return events.length > 1 ? events : [];
  }
}
