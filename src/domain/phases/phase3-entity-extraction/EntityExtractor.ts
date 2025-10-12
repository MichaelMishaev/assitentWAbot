/**
 * Entity Extractor
 *
 * Extracts structured entities from user text:
 * - Dates and times (relative and absolute)
 * - Event titles
 * - Locations
 * - Contact names
 * - Durations
 * - Priorities
 *
 * This phase runs AFTER intent classification (Phase 1) and multi-event detection (Phase 2).
 * It enhances the entities that AI models provide with structured parsing.
 */

import { DateTime } from 'luxon';
import logger from '../../../utils/logger.js';
import { parseHebrewDate } from '../../../utils/hebrewDateParser.js';

export interface ExtractedEntities {
  // Core entities
  title?: string;
  date?: Date;
  time?: string; // HH:mm format
  dateText?: string; // Original text representation

  // Location
  location?: string;

  // People
  contactNames?: string[];

  // Time-related
  duration?: number; // minutes
  startTime?: Date;
  endTime?: Date;

  // Priority/urgency
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  // Additional context
  notes?: string;
  tags?: string[];

  // Confidence scores (0-1)
  confidence: {
    title: number;
    date: number;
    time: number;
    location: number;
  };
}

export class EntityExtractor {
  /**
   * Extract all entities from text
   */
  extractEntities(text: string, intent: string, timezone: string = 'Asia/Jerusalem'): ExtractedEntities {
    const entities: ExtractedEntities = {
      confidence: {
        title: 0,
        date: 0,
        time: 0,
        location: 0
      }
    };

    // Extract based on intent type
    switch (intent) {
      case 'create_event':
      case 'create_reminder':
        this.extractTitleDateLocation(text, entities, timezone);
        this.extractContactNames(text, entities);
        this.extractDuration(text, entities);
        this.extractPriority(text, entities);
        break;

      case 'search_event':
      case 'list_events':
        this.extractSearchTerms(text, entities, timezone);
        break;

      case 'update_event':
      case 'update_reminder':
        this.extractUpdateFields(text, entities, timezone);
        break;

      case 'delete_event':
      case 'delete_reminder':
        this.extractDeleteTarget(text, entities, timezone);
        break;

      default:
        // Generic extraction for unknown intents
        this.extractTitleDateLocation(text, entities, timezone);
    }

    return entities;
  }

  /**
   * Extract title, date, and location from event/reminder creation text
   */
  private extractTitleDateLocation(text: string, entities: ExtractedEntities, timezone: string): void {
    // Extract date/time first (more specific patterns)
    this.extractDateTime(text, entities, timezone);

    // Extract location (common patterns)
    this.extractLocation(text, entities);

    // Extract title (everything that's not date/location)
    this.extractTitle(text, entities);
  }

  /**
   * Extract date and time from text
   */
  private extractDateTime(text: string, entities: ExtractedEntities, timezone: string): void {
    const lowerText = text.toLowerCase();

    // Time patterns (must be before date to avoid conflicts)
    const timePatterns = [
      /(?:בשעה|ב-|ל|לשעה|ב)\s*(\d{1,2}):(\d{2})/gi,  // "בשעה 14:30"
      /(?:בשעה|ב-|ל)\s*(\d{1,2})\s*(?:בבוקר|בערב|אחרי הצהריים)?/gi,  // "בשעה 3 אחרי הצהריים"
    ];

    for (const pattern of timePatterns) {
      const match = pattern.exec(text);
      if (match) {
        let hour = parseInt(match[1]);
        const minute = match[2] ? parseInt(match[2]) : 0;

        // Handle AM/PM
        if (lowerText.includes('אחרי הצהריים') || lowerText.includes('בערב')) {
          if (hour < 12) hour += 12;
        } else if (lowerText.includes('בבוקר') && hour > 12) {
          hour = hour % 12;
        }

        entities.time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        entities.confidence.time = 0.95;
        entities.dateText = match[0];
        break;
      }
    }

    // Relative date patterns (Hebrew)
    const relativeDatePatterns = [
      { pattern: /\bהיום\b/i, days: 0, confidence: 0.99 },
      { pattern: /\bמחר\b/i, days: 1, confidence: 0.99 },
      { pattern: /\bמחרתיים\b/i, days: 2, confidence: 0.99 },
      { pattern: /\bשלשום\b/i, days: -2, confidence: 0.99 },
      { pattern: /\bעוד שבוע\b/i, days: 7, confidence: 0.95 },
      { pattern: /\bשבוע הבא\b/i, days: 7, confidence: 0.95 },
      { pattern: /\bבשבוע הבא\b/i, days: 7, confidence: 0.95 },
      { pattern: /\bחודש הבא\b/i, days: 30, confidence: 0.90 },
    ];

    for (const { pattern, days, confidence } of relativeDatePatterns) {
      if (pattern.test(text)) {
        const now = DateTime.now().setZone(timezone);
        entities.date = now.plus({ days }).toJSDate();
        entities.confidence.date = confidence;
        if (!entities.dateText) {
          const match = text.match(pattern);
          entities.dateText = match ? match[0] : '';
        }
        break;
      }
    }

    // Day of week patterns (next occurrence)
    const dayPatterns = [
      { pattern: /\bיום ראשון\b/i, weekday: 7, name: 'ראשון' },
      { pattern: /\bיום שני\b/i, weekday: 1, name: 'שני' },
      { pattern: /\bיום שלישי\b/i, weekday: 2, name: 'שלישי' },
      { pattern: /\bיום רביעי\b/i, weekday: 3, name: 'רביעי' },
      { pattern: /\bיום חמישי\b/i, weekday: 4, name: 'חמישי' },
      { pattern: /\bיום שישי\b/i, weekday: 5, name: 'שישי' },
      { pattern: /\bשבת\b/i, weekday: 6, name: 'שבת' },
    ];

    for (const { pattern, weekday, name } of dayPatterns) {
      if (pattern.test(text)) {
        const now = DateTime.now().setZone(timezone);
        const targetWeekday = weekday;
        let daysUntil = (targetWeekday - now.weekday + 7) % 7;
        if (daysUntil === 0) daysUntil = 7; // Next week if same day

        entities.date = now.plus({ days: daysUntil }).toJSDate();
        entities.confidence.date = 0.95;
        if (!entities.dateText) {
          entities.dateText = `יום ${name}`;
        }
        break;
      }
    }

    // Absolute date patterns (DD/MM or DD/MM/YYYY)
    const absoluteDatePattern = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;
    const absoluteMatch = text.match(absoluteDatePattern);
    if (absoluteMatch) {
      const day = parseInt(absoluteMatch[1]);
      const month = parseInt(absoluteMatch[2]);
      let year = absoluteMatch[3] ? parseInt(absoluteMatch[3]) : DateTime.now().year;
      if (year < 100) year += 2000; // Handle 2-digit years

      const dt = DateTime.fromObject({ year, month, day }, { zone: timezone });
      if (dt.isValid) {
        entities.date = dt.toJSDate();
        entities.confidence.date = 0.98;
        if (!entities.dateText) {
          entities.dateText = absoluteMatch[0];
        }
      }
    }

    // Try Hebrew date parser as fallback
    if (!entities.date && text.length > 0) {
      const hebrewResult = parseHebrewDate(text);
      if (hebrewResult.success && hebrewResult.date) {
        entities.date = hebrewResult.date;
        entities.confidence.date = 0.85; // Good confidence for Hebrew parser
        if (!entities.dateText) {
          entities.dateText = text; // Store original text
        }
      }
    }

    // Combine date and time if both exist
    if (entities.date && entities.time) {
      const [hour, minute] = entities.time.split(':').map(n => parseInt(n));
      const dt = DateTime.fromJSDate(entities.date).setZone(timezone);
      entities.startTime = dt.set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
      entities.date = entities.startTime; // Update date to include time
    }
  }

  /**
   * Extract location from text
   */
  private extractLocation(text: string, entities: ExtractedEntities): void {
    // Location keywords
    const locationPatterns = [
      /\bב(?:מ)?([א-ת\s]+?)(?:\s+בשעה|\s+ב-|\s+ל|\s*$)/gi,  // "במשרד", "בבית חולים"
      /\bמיקום:\s*([א-ת\s]+)/gi,  // "מיקום: תל אביב"
      /\bב-([א-ת\s]+?)(?:\s+בשעה|\s+ב-|\s+ל|\s*$)/gi,  // "ב-רמת גן"
    ];

    for (const pattern of locationPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const location = match[1].trim();
        // Filter out common false positives
        const stopWords = ['שעה', 'יום', 'שבוע', 'חודש', 'בוקר', 'ערב', 'צהריים'];
        if (!stopWords.some(word => location.includes(word)) && location.length > 2) {
          entities.location = location;
          entities.confidence.location = 0.85;
          break;
        }
      }
    }
  }

  /**
   * Extract title from text (what's left after removing date/location/contacts)
   */
  private extractTitle(text: string, entities: ExtractedEntities): void {
    let title = text;

    // Remove command prefixes
    const commandPrefixes = [
      /^קבע\s+/i,
      /^צור\s+/i,
      /^תזכיר\s+/i,
      /^הוסף\s+/i,
      /^יצירת\s+/i,
    ];

    for (const prefix of commandPrefixes) {
      title = title.replace(prefix, '');
    }

    // Remove date/time expressions
    if (entities.dateText) {
      title = title.replace(entities.dateText, '');
    }

    // Remove location expressions
    if (entities.location) {
      title = title.replace(new RegExp(`ב(?:מ)?${entities.location}`, 'gi'), '');
    }

    // Remove contact expressions (עם X)
    title = title.replace(/\bעם\s+[א-ת\s]+/gi, '');

    // Clean up
    title = title.trim().replace(/\s+/g, ' ');

    if (title.length > 0) {
      entities.title = title;
      entities.confidence.title = 0.90;
    }
  }

  /**
   * Extract contact names from text
   */
  private extractContactNames(text: string, entities: ExtractedEntities): void {
    // Pattern: "עם X" or "עם X ו-Y"
    const contactPatterns = [
      /\bעם\s+([א-ת]+(?:\s+[א-ת]+)?)/gi,
      /\bפגישה\s+(?:עם\s+)?([א-ת]+)/gi,
    ];

    const names: string[] = [];
    for (const pattern of contactPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          // Split by conjunction
          const parts = match[1].split(/\s+ו-?\s+/);
          names.push(...parts);
        }
      }
    }

    if (names.length > 0) {
      entities.contactNames = [...new Set(names)]; // Remove duplicates
    }
  }

  /**
   * Extract duration from text
   */
  private extractDuration(text: string, entities: ExtractedEntities): void {
    // Duration patterns
    const durationPatterns = [
      { pattern: /(\d+)\s*שעות?/i, multiplier: 60 },
      { pattern: /(\d+)\s*דקות?/i, multiplier: 1 },
      { pattern: /חצי\s*שעה/i, value: 30 },
      { pattern: /רבע\s*שעה/i, value: 15 },
    ];

    for (const { pattern, multiplier, value } of durationPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (value !== undefined) {
          entities.duration = value;
        } else if (multiplier) {
          entities.duration = parseInt(match[1]) * multiplier;
        }
        break;
      }
    }
  }

  /**
   * Extract priority/urgency from text
   */
  private extractPriority(text: string, entities: ExtractedEntities): void {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('דחוף') || lowerText.includes('מיידי') || lowerText.includes('חשוב מאוד')) {
      entities.priority = 'urgent';
    } else if (lowerText.includes('חשוב') || lowerText.includes('!')) {
      entities.priority = 'high';
    } else if (lowerText.includes('לא דחוף') || lowerText.includes('רגיל')) {
      entities.priority = 'normal';
    }
  }

  /**
   * Extract search terms for queries
   */
  private extractSearchTerms(text: string, entities: ExtractedEntities, timezone: string): void {
    // Extract date range if specified
    this.extractDateTime(text, entities, timezone);

    // Extract title/search term
    let searchTerm = text;

    // Remove query prefixes
    const queryPrefixes = [
      /^מה\s+יש\s+לי\s*/i,
      /^הצג\s*/i,
      /^תראה\s*/i,
      /^רשימה\s+של\s*/i,
      /^חפש\s*/i,
    ];

    for (const prefix of queryPrefixes) {
      searchTerm = searchTerm.replace(prefix, '');
    }

    // Remove date expressions
    if (entities.dateText) {
      searchTerm = searchTerm.replace(entities.dateText, '');
    }

    searchTerm = searchTerm.trim();
    if (searchTerm.length > 0) {
      entities.title = searchTerm;
      entities.confidence.title = 0.85;
    }
  }

  /**
   * Extract fields to update from update commands
   */
  private extractUpdateFields(text: string, entities: ExtractedEntities, timezone: string): void {
    // Extract what to update (new values)
    this.extractDateTime(text, entities, timezone);
    this.extractLocation(text, entities);

    // Extract what to search for (event to update)
    // Pattern: "עדכן X ל-Y" - X is search term, Y is new value
    const updatePattern = /(?:עדכן|שנה)\s+(.+?)\s+(?:ל-?|לשעה|למיקום)/i;
    const match = text.match(updatePattern);
    if (match) {
      entities.title = match[1].trim();
      entities.confidence.title = 0.90;
    }
  }

  /**
   * Extract target for deletion
   */
  private extractDeleteTarget(text: string, entities: ExtractedEntities, timezone: string): void {
    // Extract date if specified
    this.extractDateTime(text, entities, timezone);

    // Extract event title to delete
    let target = text;

    // Remove delete prefixes
    const deletePrefixes = [
      /^(?:מחק|בטל|תמחק|תבטל)\s*/i,
      /^(?:מחיקת|ביטול)\s*/i,
    ];

    for (const prefix of deletePrefixes) {
      target = target.replace(prefix, '');
    }

    // Remove date expressions
    if (entities.dateText) {
      target = target.replace(entities.dateText, '');
    }

    target = target.trim();
    if (target.length > 0) {
      entities.title = target;
      entities.confidence.title = 0.85;
    }
  }

  /**
   * Calculate overall confidence score
   */
  getOverallConfidence(entities: ExtractedEntities): number {
    const { confidence } = entities;
    const weights = {
      title: 0.4,
      date: 0.3,
      time: 0.2,
      location: 0.1
    };

    return (
      confidence.title * weights.title +
      confidence.date * weights.date +
      confidence.time * weights.time +
      confidence.location * weights.location
    );
  }
}
