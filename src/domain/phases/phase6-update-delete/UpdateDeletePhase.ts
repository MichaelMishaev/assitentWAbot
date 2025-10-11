/**
 * Phase 6: Update/Delete Improvements
 *
 * Smart event matching for update/delete operations:
 * - "מחק פגישה" → finds "פגישה עם דוד"
 * - "עדכן רופא" → finds "רופא שיניים"
 * - Handles multiple matches with clarification
 * - Uses fuzzy matching for typos
 *
 * Priority: #8
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';
import { pluginManager } from '../../../plugins/PluginManager.js';
import { FuzzyMatcher } from '../../../shared/utils/FuzzyMatcher.js';

interface EventMatch {
  id: string;
  title: string;
  date: Date;
  score: number; // Match confidence (0-1)
}

export class UpdateDeletePhase extends BasePhase {
  readonly name = 'update-delete-matcher';
  readonly order = 6;
  readonly description = 'Smart event matching for update/delete operations';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    // Only run for update/delete intents
    return context.intent === 'update_event' || context.intent === 'delete_event';
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const searchQuery = context.entities.title || context.processedText;

      if (!searchQuery || searchQuery.length < 2) {
        context.needsClarification = true;
        context.clarificationQuestion = 'איזה אירוע תרצה לעדכן/למחוק?';
        return this.success({ needsMoreInfo: true });
      }

      // Search for matching events
      const matches = await this.findMatchingEvents(context.userId, searchQuery, context.entities.date);

      if (matches.length === 0) {
        context.addWarning(`לא מצאתי אירוע המתאים ל: "${searchQuery}"`);
        context.needsClarification = true;
        context.clarificationQuestion = 'לא מצאתי אירוע כזה. אתה בטוח שהוא קיים?';
        return this.success({ matches: [] });
      }

      if (matches.length === 1) {
        // Perfect! Single match
        context.entities.eventId = matches[0].id;
        context.setMetadata('matchedEvent', matches[0]);

        logger.info('Found single event match', {
          eventId: matches[0].id,
          title: matches[0].title,
          score: matches[0].score
        });

        return this.success({
          matchFound: true,
          eventId: matches[0].id,
          confidence: matches[0].score
        });
      }

      // Multiple matches - need clarification
      context.needsClarification = true;
      context.clarificationQuestion = this.generateClarificationQuestion(matches);
      context.setMetadata('matchCandidates', matches);

      logger.info('Multiple event matches found', {
        count: matches.length,
        query: searchQuery
      });

      return this.success({
        multipleMatches: true,
        count: matches.length,
        matches
      });

    } catch (error) {
      logger.error('Update/Delete matching failed', { error });
      return this.success({ error: true }, ['Failed to find matching events']);
    }
  }

  /**
   * Find events matching the query
   */
  private async findMatchingEvents(
    userId: string,
    query: string,
    dateFilter?: Date
  ): Promise<EventMatch[]> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        throw new Error('Database plugin not available');
      }

      // Get user's upcoming events (next 30 days)
      let sql = `
        SELECT id, title, start_time as date
        FROM events
        WHERE user_id = $1
          AND start_time >= NOW()
          AND start_time <= NOW() + INTERVAL '30 days'
        ORDER BY start_time ASC
      `;

      const params: any = { userId, messageId: '', timestamp: new Date(), metadata: {}, logger };

      const events = await db.execute(sql, params);

      if (!events || events.length === 0) {
        return [];
      }

      // Calculate match scores using fuzzy matching
      const matches: EventMatch[] = events
        .map((event: any): EventMatch => {
          // Try different matching strategies
          const exactMatch = event.title.toLowerCase().includes(query.toLowerCase());
          const fuzzyScore = FuzzyMatcher.similarity(query, event.title);
          const keywordScore = FuzzyMatcher.keywordSimilarity(query, event.title);

          // Combined score (weighted)
          let score = 0;
          if (exactMatch) {
            score = 1.0; // Perfect substring match
          } else {
            score = Math.max(fuzzyScore * 0.7, keywordScore * 0.8);
          }

          return {
            id: event.id,
            title: event.title,
            date: event.date,
            score
          };
        })
        .filter((match: EventMatch) => match.score >= 0.6) // Minimum threshold
        .sort((a: EventMatch, b: EventMatch) => b.score - a.score) // Sort by confidence
        .slice(0, 5); // Max 5 results

      return matches;

    } catch (error) {
      logger.error('Failed to search events', { error });
      return [];
    }
  }

  /**
   * Generate clarification question for multiple matches
   */
  private generateClarificationQuestion(matches: EventMatch[]): string {
    let question = 'מצאתי כמה אירועים:\n\n';

    matches.forEach((match, index) => {
      const dateStr = match.date.toLocaleDateString('he-IL', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
      question += `${index + 1}. ${match.title} (${dateStr})\n`;
    });

    question += '\nאיזה אירוע התכוונת? השב במספר (1-' + matches.length + ')';

    return question;
  }

  /**
   * Handle user's clarification response (selecting from list)
   */
  handleClarificationResponse(context: PhaseContext, response: string): boolean {
    const matches = context.getMetadata('matchCandidates') as EventMatch[] | undefined;

    if (!matches || matches.length === 0) {
      return false;
    }

    // Try to parse as number
    const index = parseInt(response.trim()) - 1;

    if (index >= 0 && index < matches.length) {
      const selectedMatch = matches[index];
      context.entities.eventId = selectedMatch.id;
      context.setMetadata('matchedEvent', selectedMatch);
      context.needsClarification = false;

      logger.info('User selected event from clarification', {
        eventId: selectedMatch.id,
        title: selectedMatch.title
      });

      return true;
    }

    return false;
  }
}
