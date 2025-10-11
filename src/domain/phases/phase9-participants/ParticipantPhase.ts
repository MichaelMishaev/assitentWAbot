/**
 * Phase 9: Multi-Participant Events
 *
 * Detects multiple participants in events:
 * - "פגישה עם דוד ומשה"
 * - "קולנוע עם המשפחה"
 * - "ישיבה עם הצוות"
 *
 * Asks for clarification: together or separate events?
 *
 * Priority: #10
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';
import { pluginManager } from '../../../plugins/PluginManager.js';

interface Participant {
  name: string;
  role: 'primary' | 'companion';
  phone?: string;
}

export class ParticipantPhase extends BasePhase {
  readonly name = 'participant-detector';
  readonly order = 9;
  readonly description = 'Detect multiple participants in events';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    // Only run for event creation
    return context.intent === 'create_event';
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const participants = this.detectParticipants(context.processedText);

      if (participants.length === 0) {
        return this.success({ hasParticipants: false });
      }

      if (participants.length === 1) {
        // Single participant - just store it
        context.entities.participants = participants;
        return this.success({ hasParticipants: true, count: 1 });
      }

      // Multiple participants - need clarification
      // Ask: together or separate events?
      context.needsClarification = true;
      context.clarificationQuestion = this.generateClarificationQuestion(participants);
      context.entities.participants = participants;

      logger.info('Multiple participants detected', {
        count: participants.length,
        participants: participants.map(p => p.name)
      });

      return this.success({
        hasParticipants: true,
        count: participants.length,
        needsClarification: true
      });

    } catch (error) {
      logger.error('Participant detection failed', { error });
      return this.success({ hasParticipants: false }, ['Failed to detect participants']);
    }
  }

  /**
   * Detect participants from text
   */
  private detectParticipants(text: string): Participant[] {
    const participants: Participant[] = [];

    // Pattern 1: "עם X ו-Y" (with X and Y)
    const withPattern = /עם\s+([א-ת\s,ו-]+)/i;
    const withMatch = text.match(withPattern);

    if (withMatch) {
      const namesText = withMatch[1];

      // Split by "ו" or "," (and, or comma)
      const names = namesText
        .split(/\s*[ו,]\s*/)
        .map(name => name.trim())
        .filter(name => name.length > 1);

      for (let i = 0; i < names.length; i++) {
        const name = this.cleanName(names[i]);
        if (name) {
          participants.push({
            name,
            role: i === 0 ? 'primary' : 'companion'
          });
        }
      }

      return participants;
    }

    // Pattern 2: "דוד ומשה" (David and Moshe) - no "עם"
    const conjunctionPattern = /([א-ת]+)\s+ו([א-ת]+)/i;
    const conjMatch = text.match(conjunctionPattern);

    if (conjMatch) {
      const name1 = this.cleanName(conjMatch[1]);
      const name2 = this.cleanName(conjMatch[2]);

      if (name1 && name2) {
        participants.push({ name: name1, role: 'primary' });
        participants.push({ name: name2, role: 'companion' });
      }
    }

    // Pattern 3: "עם המשפחה" / "עם הצוות" (with family/team)
    const groupPattern = /עם\s+(המשפחה|הצוות|החברים|הקבוצה)/i;
    const groupMatch = text.match(groupPattern);

    if (groupMatch) {
      participants.push({
        name: groupMatch[1],
        role: 'primary'
      });
    }

    return participants;
  }

  /**
   * Clean participant name
   */
  private cleanName(name: string): string | null {
    // Remove common prefixes
    const cleaned = name
      .replace(/^(ה|ד"ר|מר|גב'|רב)\s+/i, '')
      .trim();

    // Filter out stop words
    const stopWords = ['עם', 'את', 'של', 'על', 'אל'];
    if (stopWords.includes(cleaned)) {
      return null;
    }

    // Minimum length
    if (cleaned.length < 2) {
      return null;
    }

    return cleaned;
  }

  /**
   * Generate clarification question
   */
  private generateClarificationQuestion(participants: Participant[]): string {
    const names = participants.map(p => p.name).join(', ');

    return `זיהיתי כמה משתתפים: ${names}\n\n` +
      `איך תרצה שאני אארגן את זה?\n` +
      `1. אירוע אחד משותף לכולם\n` +
      `2. אירועים נפרדים לכל אחד\n\n` +
      `השב במספר (1 או 2)`;
  }

  /**
   * Handle clarification response
   */
  handleClarificationResponse(context: PhaseContext, response: string): 'together' | 'separate' | null {
    const trimmed = response.trim();

    if (trimmed === '1' || /יחד|משותף|אחד/i.test(trimmed)) {
      return 'together';
    }

    if (trimmed === '2' || /נפרד|נפרדים|כל אחד/i.test(trimmed)) {
      return 'separate';
    }

    return null;
  }

  /**
   * Save participants to database
   */
  async saveParticipants(eventId: string, participants: Participant[]): Promise<boolean> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        throw new Error('Database plugin not available');
      }

      // Insert each participant
      for (const participant of participants) {
        const sql = `INSERT INTO event_participants (event_id, name, role, phone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, name) DO NOTHING`;

        await db.execute(sql, {
          userId: '',
          messageId: '',
          timestamp: new Date(),
          metadata: {
            eventId,
            name: participant.name,
            role: participant.role,
            phone: participant.phone || null
          },
          logger
        });
      }

      logger.info('Participants saved', { eventId, count: participants.length });
      return true;

    } catch (error) {
      logger.error('Failed to save participants', { error });
      return false;
    }
  }

  /**
   * Get participants for an event
   */
  async getEventParticipants(eventId: string): Promise<Participant[]> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        return [];
      }

      const result = await db.execute(
        `SELECT name, role, phone
         FROM event_participants
         WHERE event_id = $1
         ORDER BY role DESC, name ASC`,
        { userId: '', messageId: '', timestamp: new Date(), metadata: { eventId }, logger }
      );

      return result || [];

    } catch (error) {
      logger.error('Failed to get participants', { error });
      return [];
    }
  }

  /**
   * Format participants for display
   */
  formatParticipants(participants: Participant[]): string {
    if (participants.length === 0) {
      return '';
    }

    if (participants.length === 1) {
      return `עם ${participants[0].name}`;
    }

    const names = participants.map(p => p.name);
    const lastPerson = names.pop();
    return `עם ${names.join(', ')} ו${lastPerson}`;
  }
}
