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

      // CRITICAL: Clear any existing participants from Phase 3 (AI extraction)
      // Phase 9 is the AUTHORITATIVE source for participant detection
      if (context.entities.participants) {
        logger.warn('Clearing existing participants from previous phase', {
          existing: context.entities.participants.map((p: any) => p.name || p),
          text: context.processedText.substring(0, 100)
        });
      }

      if (participants.length === 0) {
        // IMPORTANT: Clear participants even if none detected (overwrite Phase 3's mistakes)
        context.entities.participants = undefined;
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

    logger.info('Phase 9 detecting participants', {
      text: text.substring(0, 150),
      textLength: text.length
    });

    // Pattern 1: "עם X ו-Y" (with X and Y)
    // CRITICAL FIX #1: More restrictive name capture - only Hebrew letters (no spaces or ו inside names!)
    // CRITICAL FIX #2: Explicit AND connector: look for " ו" or " ו-" between names (space before ו)
    // This prevents matching "יהודית" as "יה ו דית" (the ו is PART of the name, not a connector!)
    //
    // Examples:
    // ✅ "עם יהודית" → single name "יהודית" (ו is part of name)
    // ✅ "עם יוסי ודני" → two names "יוסי", "דני" (space before ו indicates AND)
    // ✅ "עם מיכאל, שרה ודן" → three names (comma and ו connectors)
    //
    // Pattern explanation:
    // 1. First name: [א-תa-zA-Z]+ (letters only, no spaces or ו!)
    // 2. Optional additional names: (?:\s+(?:ו-?|,)\s*([א-תa-zA-Z]+))* (space + connector + name)
    // 3. Stop at: date/time keywords, location prepositions, or end of string
    const withPattern = /עם\s+([א-תa-zA-Z]+(?:\s+(?:ו-?|,)\s*[א-תa-zA-Z]+)*)(?:\s+(?:ל?היום|מחר|ב?שעה|ל?שעה|ב-?\d{1,2}(?::|\s)|בשבוע|בחודש|בתאריך|ב[א-ת]{2,}|ל[א-ת]{2,})|$)/i;
    const withMatch = text.match(withPattern);

    if (withMatch) {
      logger.info('Pattern 1 matched', {
        fullMatch: withMatch[0],
        capturedGroup: withMatch[1],
        index: withMatch.index
      });
    }

    if (withMatch) {
      const namesText = withMatch[1];

      // Split by explicit connectors: " ו" (space before ו) or ","
      // This ensures "יהודית" stays intact (ו inside name has no space before it)
      const names = namesText
        .split(/\s+(?:ו-?|,)\s*/)  // Match " ו", " ו-", " , " (space required before ו!)
        .map(name => name.trim())
        .filter(name => name.length > 1);

      logger.info('Detected participant names after split', {
        rawNamesText: namesText,
        splitNames: names,
        count: names.length
      });

      for (let i = 0; i < names.length; i++) {
        const name = this.cleanName(names[i]);
        if (name) {
          participants.push({
            name,
            role: i === 0 ? 'primary' : 'companion'
          });
        }
      }

      logger.info('Pattern 1 extracted participants', {
        count: participants.length,
        names: participants.map(p => p.name)
      });
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

    logger.info('Phase 9 participant detection complete', {
      participantCount: participants.length,
      participants: participants.map(p => ({ name: p.name, role: p.role }))
    });

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
