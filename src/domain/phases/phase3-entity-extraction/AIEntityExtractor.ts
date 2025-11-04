/**
 * AI-Powered Entity Extractor
 *
 * Uses GPT-4 Mini as primary model for Hebrew entity extraction
 * Falls back to regex patterns if AI fails
 */

import OpenAI from 'openai';
import logger from '../../../utils/logger.js';
import { DateTime } from 'luxon';

export interface AIExtractedEntities {
  title?: string;
  date?: Date;
  time?: string; // HH:mm format
  dateText?: string;
  location?: string;
  participants?: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  leadTimeMinutes?: number; // Minutes before event to send reminder
  notes?: string;
  confidence: {
    title: number;
    date: number;
    time: number;
    location: number;
    overall: number;
  };
}

export class AIEntityExtractor {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Extract entities using GPT-4 Mini only
   */
  async extract(text: string, intent: string, timezone: string = 'Asia/Jerusalem'): Promise<AIExtractedEntities> {
    try {
      // Use GPT-4 Mini (gpt-4o-mini) for extraction
      const result = await this.extractWithGPT4Mini(text, intent, timezone);
      return result;

    } catch (error) {
      logger.error('AI entity extraction failed', { error });

      // Return empty result with zero confidence
      return {
        confidence: {
          title: 0,
          date: 0,
          time: 0,
          location: 0,
          overall: 0,
        }
      };
    }
  }

  /**
   * Extract using GPT-4 Mini
   */
  private async extractWithGPT4Mini(text: string, intent: string, timezone: string): Promise<AIExtractedEntities> {
    const prompt = this.buildExtractionPrompt(text, intent, timezone);

    const startTime = Date.now();
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a Hebrew NLP expert specializing in calendar event extraction. Extract entities in JSON format only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const duration = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('GPT-4 Mini returned no content');
    }

    const parsed = JSON.parse(content);
    const result = this.parseAIResponse(parsed, timezone);

    logger.info('GPT-4 Mini extraction complete', {
      duration,
      confidence: result.confidence.overall.toFixed(2),
      hasTitle: !!result.title,
      hasDate: !!result.date,
      hasTime: !!result.time,
      hasParticipants: (result.participants?.length || 0) > 0,
    });

    return result;
  }

  /**
   * Build extraction prompt
   */
  private buildExtractionPrompt(text: string, intent: string, timezone: string): string {
    const now = DateTime.now().setZone(timezone);
    const today = now.toFormat('yyyy-MM-dd');
    const currentYear = now.year;

    return `Extract entities from this Hebrew text for a calendar bot.

Text: "${text}"
Intent: ${intent}
Today's date: ${today} (${now.toFormat('EEEE')})
Current year: ${currentYear}
Timezone: ${timezone}

Extract and return JSON with these fields:
{
  "title": "event title (without date/time/participants)",
  "date": "YYYY-MM-DD (convert relative dates like 'היום', 'מחר')",
  "time": "HH:MM (24-hour format, extract from 'לשעה X', 'בשעה X', 'ב-X')",
  "dateText": "original date text from input",
  "location": "location if mentioned",
  "participants": ["name1", "name2"] (extract from 'עם X', 'עם X ו-Y'),
  "priority": "low|normal|high|urgent",
  "leadTimeMinutes": "number - minutes BEFORE event to send reminder (e.g., 1440 for 'יום לפני', 60 for 'שעה לפני')",
  "notes": "additional context (DO NOT include 'תזכיר לי X לפני' - extract as leadTimeMinutes instead!)",
  "confidence": {
    "title": 0.0-1.0,
    "date": 0.0-1.0,
    "time": 0.0-1.0,
    "location": 0.0-1.0
  }
}

Rules:
1. Convert Hebrew relative dates: "היום"=today, "מחר"=tomorrow, "מחרתיים"=day after tomorrow
2. Convert Hebrew time words: "בערב"=19:00, "בבוקר"=09:00, "אחרי הצהריים"=14:00, "בלילה"=22:00
3. Extract participants from "עם X" patterns (e.g., "עם איתי" → ["איתי"])
4. Title should NOT include date, time, or participants
5. Return null for missing fields
6. Be confident when patterns are clear
7. **CRITICAL - Date Without Year:** If user provides date without year (e.g., "20.10", "20/10"):
   - First try using current year (${currentYear})
   - If that results in a PAST date, use NEXT year (${currentYear + 1})
   - Example: Today is ${today}. User says "10.10" → that's October 10
     * If using ${currentYear} would make it past (10-10-${currentYear} < ${today}), use ${currentYear + 1}
     * Always prefer future dates for events
8. **CRITICAL - Time Extraction:** ALWAYS extract time when present, even if on same line as date
   - Examples: "20.10 בשעה 15:00" → date: "2025-10-20", time: "15:00"
   - "פגישה 20.10 15:00" → date: "2025-10-20", time: "15:00"
   - "20.10 ב-15:00" → date: "2025-10-20", time: "15:00"
9. **CRITICAL - Lead Time Extraction:** If text contains "תזכיר לי X לפני", extract as leadTimeMinutes:
   - "תזכיר לי יום לפני" → leadTimeMinutes: 1440 (24 hours * 60 = 1440 minutes)
   - "תזכיר לי יומיים לפני" → leadTimeMinutes: 2880 (48 hours)
   - "תזכיר לי שעה לפני" → leadTimeMinutes: 60
   - "תזכיר לי שעתיים לפני" → leadTimeMinutes: 120
   - "תזכיר לי 3 שעות לפני" → leadTimeMinutes: 180 (3 × 60)
   - "תזכיר לי 6 שעות לפני" → leadTimeMinutes: 360 (6 × 60)
   - "תזכיר לי 12 שעות לפני" → leadTimeMinutes: 720 (12 × 60)
   - "תזכיר לי 30 דקות לפני" → leadTimeMinutes: 30
   - "תזכיר לי 15 דקות לפני" → leadTimeMinutes: 15
   - "תזכיר לי חצי שעה לפני" → leadTimeMinutes: 30
   - "תזכיר לי שבוע לפני" → leadTimeMinutes: 10080 (7 days * 24 * 60)
   - DO NOT put "תזכיר לי X לפני" in notes - extract it as leadTimeMinutes!
   - **PATTERN**: "X שעות לפני" = X × 60 minutes, "X דקות לפני" = X minutes, "X ימים לפני" = X × 1440 minutes
10. **CRITICAL - Event Context Reminder Date Calculation (BUG FIX #25):**
   - When text contains "תזכיר לי X לפני (בהקשר לאירוע: TITLE בתאריך DD.MM.YYYY בשעה HH:MM)"
   - Extract event date from context: "בתאריך 08.11.2025 בשעה 09:00" → date: "2025-11-08T09:00:00"
   - Extract leadTimeMinutes from "X לפני": "יום לפני" → leadTimeMinutes: 1440
   - DO NOT extract "יום לפני" as a date! Extract the event date from context instead!
   - Example: "תזכיר לי יום לפני (בהקשר לאירוע: טקס בתאריך 08.11.2025 בשעה 09:00)"
     → date: "2025-11-08T09:00:00", leadTimeMinutes: 1440
     → Reminder will be scheduled 1440 minutes (1 day) BEFORE the event date

Return ONLY valid JSON, no explanation.`;
  }

  /**
   * Parse AI response into structured format
   */
  private parseAIResponse(parsed: any, timezone: string): AIExtractedEntities {
    const result: AIExtractedEntities = {
      confidence: {
        title: parsed.confidence?.title || 0.5,
        date: parsed.confidence?.date || 0.5,
        time: parsed.confidence?.time || 0.5,
        location: parsed.confidence?.location || 0.5,
        overall: 0,
      }
    };

    // Title
    if (parsed.title && typeof parsed.title === 'string') {
      result.title = parsed.title.trim();
    }

    // Date
    if (parsed.date && typeof parsed.date === 'string') {
      let dt = DateTime.fromISO(parsed.date, { zone: timezone });
      if (dt.isValid) {
        // SAFETY CHECK: If date is in the past, auto-increment year
        // This catches cases where AI didn't follow the smart year detection rule
        const now = DateTime.now().setZone(timezone);

        // Only check date without time - if user specified a date, we assume they mean the future
        const dateOnly = dt.startOf('day');
        const todayStart = now.startOf('day');

        if (dateOnly < todayStart) {
          // Date is in the past - add one year
          dt = dt.plus({ years: 1 });
          logger.info('Auto-corrected past date to future', {
            original: parsed.date,
            corrected: dt.toFormat('yyyy-MM-dd'),
            reason: 'Date was in the past, assuming user meant next year'
          });
        }

        result.date = dt.toJSDate();
        result.dateText = parsed.dateText || parsed.date;
      }
    }

    // Time
    if (parsed.time && typeof parsed.time === 'string') {
      const timeMatch = parsed.time.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        result.time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;

        // Combine date + time if we have both
        if (result.date) {
          const [hour, minute] = result.time.split(':').map(Number);
          const dt = DateTime.fromJSDate(result.date)
            .setZone(timezone)
            .set({ hour, minute, second: 0, millisecond: 0 });
          result.date = dt.toJSDate();
        }
      }
    }

    // Location
    if (parsed.location && typeof parsed.location === 'string') {
      result.location = parsed.location.trim();
    }

    // Participants
    if (Array.isArray(parsed.participants) && parsed.participants.length > 0) {
      result.participants = parsed.participants
        .filter((p: any) => typeof p === 'string')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);
    }

    // Priority
    if (parsed.priority && ['low', 'normal', 'high', 'urgent'].includes(parsed.priority)) {
      result.priority = parsed.priority;
    }

    // Lead Time (BUG FIX: Extract from "תזכיר לי יום לפני")
    if (parsed.leadTimeMinutes && typeof parsed.leadTimeMinutes === 'number' && parsed.leadTimeMinutes > 0) {
      result.leadTimeMinutes = Math.floor(parsed.leadTimeMinutes);
      logger.info('Extracted leadTimeMinutes from AI', { leadTimeMinutes: result.leadTimeMinutes });
    }

    // Notes
    if (parsed.notes && typeof parsed.notes === 'string') {
      result.notes = parsed.notes.trim();
    }

    // Calculate overall confidence
    const confidenceValues = [
      result.confidence.title,
      result.confidence.date,
      result.confidence.time,
      result.confidence.location,
    ];
    result.confidence.overall = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;

    return result;
  }
}
