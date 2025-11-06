import { StateManager } from '../services/StateManager.js';
import { AuthService } from '../services/AuthService.js';
import { EventService } from '../services/EventService.js';
import { ReminderService } from '../services/ReminderService.js';
import { ContactService } from '../services/ContactService.js';
import { SettingsService } from '../services/SettingsService.js';
import { dashboardTokenService } from '../services/DashboardTokenService.js';
import { proficiencyTracker } from '../services/ProficiencyTracker.js';
import { redisMessageLogger } from '../services/RedisMessageLogger.js';
import { IMessageProvider, IncomingMessage } from '../providers/IMessageProvider.js';
import { ConversationState } from '../types/index.js';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { safeParseDate } from '../utils/dateValidator.js';
import {
  formatEventComments,
  formatCommentAdded,
  formatCommentAddedWithPriority,
  formatCommentWithReminder,
  formatCommentDeleted,
  formatEventNotFound,
  formatCommentNotFound,
  formatCommentEducationTip,
  formatEventWithComments,
  formatEventInList
} from '../utils/commentFormatter.js';
import { DateTime } from 'luxon';
import { scheduleReminder } from '../queues/ReminderQueue.js';
import { filterByFuzzyMatch } from '../utils/hebrewMatcher.js';
import { CommandRouter } from './CommandRouter.js';
import { parseHebrewDate, validateDayNameMatchesDate } from '../utils/hebrewDateParser.js';
import { pipelineOrchestrator } from '../domain/orchestrator/PipelineOrchestrator.js';

/**
 * Date query type - single date vs range
 */
interface DateQuery {
  date: Date | null;
  isWeekRange: boolean;
  isMonthRange: boolean;
  rangeStart?: Date;
  rangeEnd?: Date;
}

/**
 * Filter out question phrases from title filters
 * Questions like "מה האירועים?" should NOT be used as title filters
 */
function sanitizeTitleFilter(title: string | undefined): string | undefined {
  if (!title) return undefined;

  const trimmed = title.trim();

  // Check if it's a question phrase (starts with question word)
  const questionStarters = ['מה ', 'מתי ', 'איזה ', 'איפה ', 'איך ', 'למה ', 'מי ', 'כמה ', 'האם '];
  const isQuestionStart = questionStarters.some(q => trimmed.toLowerCase().startsWith(q));

  // Check if it ends with a question mark (likely a question)
  const endsWithQuestion = trimmed.endsWith('?');

  // Check if it's a single short word with question mark (like "מחר?" - probably extracted from "מה מחר?")
  const isShortQuestion = endsWithQuestion && trimmed.replace('?', '').split(' ').length === 1;

  if (isQuestionStart || isShortQuestion) {
    logger.info('Ignoring question phrase as title filter', { title, reason: isQuestionStart ? 'starts-with-question' : 'short-question-mark' });
    return undefined;
  }

  // BUG FIX #18: Filter out generic category words that are NOT specific item names
  // User report: "Show me all reminders" → NLP extracts "תזכורות" → bot says "no reminders found for 'תזכורות'"
  // These are meta-words referring to the category, not a specific reminder/event name
  const genericWords = [
    'תזכורות', 'תזכורת',     // reminders
    'אירועים', 'אירוע',      // events
    'פגישות', 'פגישה',        // meetings
    'משימות', 'משימה',        // tasks
    'רשימות', 'רשימה'         // lists
  ];
  const cleanedTitle = trimmed.toLowerCase().replace(/[?!.,]/g, '').trim();
  if (genericWords.includes(cleanedTitle)) {
    logger.info('Ignoring generic category word as title filter', { title, cleanedTitle });
    return undefined;
  }

  // BUG FIX: Check if it's a "list all" meta-phrase (כל האירועים שלי, הכל, etc.)
  // This prevents queries like "show me all my events" from being treated as a title filter
  const listAllPatterns = [
    /^כל ה/,           // "כל ה..." (all the...)
    /^הכל$/,           // "הכל" (everything)
    /כל האירועים/,    // "כל האירועים" (all events)
    /כל הפגישות/,     // "כל הפגישות" (all meetings)
    /כל התזכורות/,    // "כל התזכורות" (all reminders)
    /האירועים שלי/,   // "האירועים שלי" (my events)
    /הפגישות שלי/,    // "הפגישות שלי" (my meetings)
    /התזכורות שלי/    // "התזכורות שלי" (my reminders)
  ];

  const isListAllPhrase = listAllPatterns.some(pattern => pattern.test(trimmed));

  if (isListAllPhrase) {
    logger.info('Ignoring list-all meta-phrase as title filter', { title });
    return undefined;
  }

  // Remove trailing question mark from legitimate titles (e.g., "Meeting about Q4?" -> "Meeting about Q4")
  if (endsWithQuestion) {
    return trimmed.slice(0, -1).trim();
  }

  return trimmed;
}

/**
 * Parse date from NLP intent
 */
function parseDateFromNLP(event: any, context: string): DateQuery {
  const result: DateQuery = {
    date: null,
    isWeekRange: false,
    isMonthRange: false
  };

  // Priority 1: Try dateText field (Hebrew relative dates like "שבוע הבא")
  if (event?.dateText) {
    const dateText = event.dateText.toLowerCase();

    // Check if it's a week query
    const weekKeywords = ['שבוע', 'השבוע', 'בשבוע', 'לשבוע'];
    const isWeekQuery = weekKeywords.some(keyword => dateText.includes(keyword));

    // Check if it's a month query
    const monthKeywords = ['חודש', 'החודש', 'בחודש'];
    const isMonthQuery = monthKeywords.some(keyword => dateText.includes(keyword));

    const hebrewResult = parseHebrewDate(event.dateText);
    if (hebrewResult.success && hebrewResult.date) {
      // BUG FIX #15: Preserve time from ISO date field if dateText has no time
      // Example: dateText="13.11" (no time) + date="2025-11-13T18:45:00.000Z" (with time)
      // Before: parseHebrewDate("13.11") → midnight, overwrites ISO time
      // After: Merge date from dateText with time from ISO field
      let finalDate = hebrewResult.date;

      // Check if dateText contains time info (presence of colon suggests time like "20:45")
      const dateTextHasTime = event.dateText.includes(':');

      // DEBUG: Log event object structure
      logger.info('[DEBUG BUG #15] Event object before merge check', {
        dateText: event.dateText,
        hasDateField: !!event.date,
        dateFieldType: typeof event.date,
        dateFieldValue: event.date,
        dateTextHasTime,
        context
      });

      // Check if ISO date field has non-midnight time
      if (!dateTextHasTime && event?.date) {
        // Convert date to string format for parsing (handle both string and Date object)
        let dateString: string;
        if (typeof event.date === 'string') {
          dateString = event.date;
        } else if (event.date instanceof Date) {
          dateString = event.date.toISOString();
        } else if (typeof event.date === 'object' && event.date.toISOString) {
          dateString = event.date.toISOString();
        } else {
          dateString = String(event.date);
        }

        const timeMatch = dateString.match(/T(\d{2}):(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const hasNonMidnightTime = hours !== 0 || minutes !== 0;

          if (hasNonMidnightTime) {
            // Merge: Use date from dateText but time from ISO date
            // CRITICAL: Convert ISO time to Israel timezone BEFORE extracting hour/minute
            // Example: "2025-11-13T18:45:00.000Z" (UTC) → 20:45 Israel time
            const hebrewDt = DateTime.fromJSDate(hebrewResult.date).setZone('Asia/Jerusalem');
            const isoDt = DateTime.fromISO(dateString).setZone('Asia/Jerusalem');

            finalDate = hebrewDt.set({
              hour: isoDt.hour,
              minute: isoDt.minute,
              second: isoDt.second,
              millisecond: isoDt.millisecond
            }).toJSDate();

            logger.info('🔧 BUG FIX #15: Merged time from ISO date into Hebrew parsed date', {
              dateText: event.dateText,
              originalHebrewDate: hebrewResult.date.toISOString(),
              eventDateRaw: event.date,
              eventDateType: typeof event.date,
              dateStringConverted: dateString,
              isoDateIsrael: isoDt.toISO(),
              mergedDate: finalDate.toISOString(),
              extractedHour: isoDt.hour,
              extractedMinute: isoDt.minute,
              context
            });
          }
        }
      }

      logger.info('Parsed Hebrew date from NLP', {
        dateText: event.dateText,
        parsedDate: finalDate.toISOString(),
        isWeekQuery,
        isMonthQuery,
        context
      });

      result.date = finalDate;

      if (isWeekQuery) {
        result.isWeekRange = true;
        // Get week range
        const dt = DateTime.fromJSDate(finalDate).setZone('Asia/Jerusalem');
        result.rangeStart = dt.startOf('week').toJSDate();
        result.rangeEnd = dt.endOf('week').toJSDate();
      } else if (isMonthQuery) {
        result.isMonthRange = true;
        // Get month range
        const dt = DateTime.fromJSDate(finalDate).setZone('Asia/Jerusalem');
        result.rangeStart = dt.startOf('month').toJSDate();
        result.rangeEnd = dt.endOf('month').toJSDate();
      }

      return result;
    }
  }

  // Priority 2: Try date field (ISO format)
  if (event?.date) {
    const isoDate = safeParseDate(event.date, context);
    if (isoDate) {
      result.date = isoDate;
      return result;
    }
  }

  // Failed both
  logger.warn('Could not parse date from NLP intent', {
    dateText: event?.dateText,
    date: event?.date,
    context
  });
  return result;
}

/**
 * NLPRouter - Handles NLP intent routing and processing
 * Extracted from MessageRouter to separate concerns
 */
export class NLPRouter {
  constructor(
    private stateManager: StateManager,
    private authService: AuthService,
    private eventService: EventService,
    private reminderService: ReminderService,
    private contactService: ContactService,
    private settingsService: SettingsService,
    private messageProvider: IMessageProvider,
    private commandRouter: CommandRouter,
    private sendMessage: (to: string, message: string) => Promise<string>,
    private reactToLastMessage: (userId: string, emoji: string) => Promise<void>,
    private storeMessageEventMapping: (messageId: string, eventIds: string | string[]) => Promise<void>,
    private sendQuickActionHint: (phone: string, userId: string) => Promise<void>
  ) {}

  async handleNLPMessage(phone: string, userId: string, text: string): Promise<void> {
    try {
      const user = await this.authService.getUserByPhone(phone);
      const contacts = await this.contactService.getAllContacts(userId);

      // Get conversation history for context
      const history = await this.stateManager.getHistory(userId);
      const conversationHistory = history.map(h => ({
        role: h.role,
        content: h.content
      }));

      // Add current user message to history
      await this.stateManager.addToHistory(userId, 'user', text);

      // Phase 2.2: Check for event context from reply-to-message quick action fallback
      let contextEnhancedText = text;
      const eventContextRaw = await redis.get(`temp:event_context:${userId}`);
      if (eventContextRaw) {
        // Clear context after retrieval (one-time use)
        await redis.del(`temp:event_context:${userId}`);

        try {
          // Parse event ID(s)
          let eventIds: string[];
          try {
            const parsed = JSON.parse(eventContextRaw);
            eventIds = Array.isArray(parsed) ? parsed : [eventContextRaw];
          } catch {
            eventIds = [eventContextRaw];
          }

          // BUG FIX: Retrieve event titles AND dates for reminder lead time calculation
          // When user quotes event and says "תזכיר לי יום לפני", AI needs event date to calculate reminder date
          const eventDescriptions: string[] = [];
          for (const eventId of eventIds.slice(0, 5)) { // Max 5 events for context
            const event = await this.eventService.getEventById(eventId, userId);
            if (event) {
              // Format event with date and time for AI context
              const eventDateTime = DateTime.fromJSDate(new Date(event.startTsUtc)).setZone('Asia/Jerusalem');
              const dateStr = eventDateTime.toFormat('dd.MM.yyyy');
              const timeStr = eventDateTime.toFormat('HH:mm');
              eventDescriptions.push(`${event.title} בתאריך ${dateStr} בשעה ${timeStr}`);
            }
          }

          // Inject event context into user text for NLP
          if (eventDescriptions.length === 1) {
            contextEnhancedText = `${text} (בהקשר לאירוע: ${eventDescriptions[0]})`;
          } else if (eventDescriptions.length > 1) {
            contextEnhancedText = `${text} (בהקשר לאירועים: ${eventDescriptions.join(', ')})`;
          }

          logger.info('Injected event context into NLP', { userId, originalText: text, enhancedText: contextEnhancedText });
        } catch (error) {
          logger.error('Failed to inject event context', { userId, error });
          // Continue with original text if context injection fails
        }
      }

      // ===== LAYER 1: PRE-AI KEYWORD DETECTION (Option 5 - Hybrid Approach) =====
      // Check for explicit reminder keywords ANYWHERE in message
      // This catches obvious cases BEFORE expensive AI call
      // Hebrew verb conjugations from root ז-כ-ר (z-k-r): remind/remember
      // BUG FIX: Removed \b (word boundary) because it doesn't work with Hebrew characters!
      // Hebrew regex needs manual spacing or start/end boundaries
      const reminderKeywordPattern = /(^|[\s,.])(תזכיר|תזכירי|תזכורת|הזכר|הזכרה|הזכירי|הזכירו|מזכיר|נזכיר|אזכיר|אני רוצה תזכורת|תזכיר לי שוב|remind|reminder|remindme)($|[\s,.])/i;
      const hasExplicitReminderKeyword = reminderKeywordPattern.test(text.trim());

      if (hasExplicitReminderKeyword) {
        logger.info('🎯 Layer 1: Explicit reminder keyword detected anywhere in message', {
          userId,
          text: text.substring(0, 50),
          keyword: text.trim().match(reminderKeywordPattern)?.[2] // Capture group 2 is the keyword
        });
        // Continue to AI but boost reminder confidence in Layer 2
      }

      // ===== BUG FIX #14: PHASE 2 CONTEXT AWARENESS =====
      // If user says "תזכיר לי" and NO reply-to context exists, check for recently created events
      // This solves: User creates event "פגישה עם דני" → says "תזכיר לי" → bot knows context
      if (hasExplicitReminderKeyword && !eventContextRaw) {
        const recentEvents = await this.getRecentEvents(userId);

        if (recentEvents.length > 0) {
          // Use most recent event (first in array)
          const mostRecent = recentEvents[0];

          // BUG FIX: Fetch full event to get startTsUtc for reminder lead time calculation
          const fullEvent = await this.eventService.getEventById(mostRecent.id, userId);
          if (fullEvent) {
            const eventDateTime = DateTime.fromJSDate(new Date(fullEvent.startTsUtc)).setZone('Asia/Jerusalem');
            const dateStr = eventDateTime.toFormat('dd.MM.yyyy');
            const timeStr = eventDateTime.toFormat('HH:mm');

            // Inject recent event context into user text for NLP
            contextEnhancedText = `${text} (בהקשר לאירוע האחרון שנוצר: ${mostRecent.title} בתאריך ${dateStr} בשעה ${timeStr})`;
          } else {
            // Fallback: use title only if event not found
            contextEnhancedText = `${text} (בהקשר לאירוע האחרון שנוצר: ${mostRecent.title})`;
          }

          logger.info('[BUG_FIX_#14] Injected recent event context for reminder intent', {
            userId,
            originalText: text,
            enhancedText: contextEnhancedText,
            recentEventTitle: mostRecent.title,
            recentEventId: mostRecent.id,
            createdAt: mostRecent.createdAt,
            totalRecentEvents: recentEvents.length
          });
        } else {
          logger.info('[BUG_FIX_#14] Reminder keyword detected but no recent events found', {
            userId,
            text: text.substring(0, 50)
          });
        }
      }

      // ===== V2 PIPELINE: Use PipelineOrchestrator (10 phases + Ensemble AI) =====
      logger.info('🚀 Using V2 Pipeline for NLP processing', { userId, text: contextEnhancedText.substring(0, 100) });

      // Create IncomingMessage for V2 Pipeline
      const incomingMessage: IncomingMessage = {
        from: phone,
        messageId: `nlp-${Date.now()}`, // Generate a unique message ID
        timestamp: Date.now(),
        content: {
          text: contextEnhancedText
        },
        isFromMe: false
      };

      // Execute V2 Pipeline (10 phases)
      const result = await pipelineOrchestrator.execute(
        incomingMessage,
        userId,
        user?.timezone || 'Asia/Jerusalem'
      );

      logger.info('✅ V2 Pipeline completed', {
        userId,
        intent: result.intent,
        confidence: result.confidence,
        success: result.success,
        hasEntities: Object.keys(result.entities).length > 0,
        warnings: result.warnings?.length || 0
      });

      // ===== ADAPTER: Convert V2 entities to old format for backward compatibility =====
      // This allows us to reuse existing handler methods without rewriting them
      const entities = result.entities as any; // Use type assertion for extended properties
      const adaptedResult = {
        intent: result.intent,
        confidence: result.confidence,
        clarificationNeeded: result.clarificationQuestion,
        warnings: result.warnings || [], // ✅ FIX: Pass warnings from Pipeline (Shabbat, holidays, etc.)
        // Wrap entities in appropriate containers based on intent type
        event: {
          title: entities.title,
          date: entities.date,
          dateText: entities.dateText,
          location: entities.location,
          contactName: entities.contactName,
          notes: entities.notes,
          deleteAll: entities.deleteAll,
          participants: entities.participants, // ✅ FIX: Include participants from Phase 9
        },
        reminder: {
          title: entities.title,
          dueDate: entities.date,
          dateText: entities.dateText,
          time: entities.time,
          date: entities.date,
          recurrence: entities.recurrence?.rrule,
          leadTimeMinutes: entities.leadTimeMinutes, // BUG FIX: Extract lead time from "תזכיר לי יום לפני"
          notes: entities.notes,
        },
        comment: {
          eventTitle: entities.title,
          text: entities.comments?.[0] || entities.notes,
          priority: entities.priority,
          reminderTime: entities.date,
          reminderOffset: entities.reminderOffset,
          deleteBy: entities.deleteBy,
          deleteValue: entities.deleteValue,
          commentIndex: entities.commentIndex,
        },
      };

      // Intent-specific confidence thresholds
      const isSearchIntent = adaptedResult.intent === 'search_event' || adaptedResult.intent === 'list_events';
      const isCreateIntent = adaptedResult.intent === 'create_event' || adaptedResult.intent === 'create_reminder';
      const isDestructiveIntent = adaptedResult.intent === 'delete_event' || adaptedResult.intent === 'delete_reminder';
      const isReminderIntent = adaptedResult.intent === 'create_reminder' || adaptedResult.intent === 'update_reminder' || adaptedResult.intent === 'delete_reminder';

      // ===== LAYER 2: ADAPTIVE CONFIDENCE THRESHOLDS (Option 5 - Hybrid Approach) =====
      // Lower threshold for reminders when user used explicit reminder keywords
      // This helps AI catch reminders even when it's not 100% confident

      // BUG FIX: Check for explicit reminder keyword FIRST, before checking AI intent
      // If user says "תזכורת" or "תזכיר לי", force create_reminder intent with low threshold
      // This fixes cases like "אני רוצה תזכורת לפגישה" where AI misclassifies as "unknown"
      if (hasExplicitReminderKeyword && (adaptedResult.intent === 'unknown' || adaptedResult.intent === 'create_reminder')) {
        adaptedResult.intent = 'create_reminder'; // Force the intent
        logger.info('🎯 Layer 2: Forced create_reminder intent due to explicit keyword', {
          originalIntent: result.intent,
          confidence: adaptedResult.confidence,
          keyword: text.match(/תזכיר|תזכורת/)?.[0]
        });
      }

      let requiredConfidence: number;
      if (isSearchIntent) {
        requiredConfidence = 0.5; // Non-destructive - low threshold
      } else if (hasExplicitReminderKeyword && adaptedResult.intent === 'create_reminder') {
        requiredConfidence = 0.4; // User said "תזכורת" - trust it even with low AI confidence
        logger.info('🎯 Layer 2: Lowered confidence threshold for reminder (explicit keyword)', {
          intent: adaptedResult.intent,
          confidence: adaptedResult.confidence,
          threshold: requiredConfidence
        });
      } else if (isCreateIntent) {
        requiredConfidence = 0.5; // BUG FIX: Lowered from 0.7 to 0.5 (was rejecting valid intents like "תזכיר לי שוב מחר" at 0.60)
      } else if (isDestructiveIntent) {
        requiredConfidence = 0.6; // Destructive but confirmable
      } else {
        requiredConfidence = 0.6; // Default
      }

      // If confidence is too low or needs clarification, ask for clarification
      if (adaptedResult.confidence < requiredConfidence || adaptedResult.intent === 'unknown' || result.needsClarification) {
        await proficiencyTracker.trackNLPFailure(userId);

        // ===== LAYER 3: FALLBACK DISAMBIGUATION (Option 5 - Hybrid Approach) =====
        // If AI failed but user used reminder keywords ANYWHERE in message, ask for confirmation instead of generic error
        // Check for any Hebrew conjugation of ז-כ-ר root or English variants
        // BUG FIX: No word boundaries for Hebrew - simple substring match is enough for fallback
        const anywhereKeywordPattern = /(תזכיר|תזכירי|תזכורת|הזכר|הזכרה|הזכירי|הזכירו|מזכיר|נזכיר|אזכיר|אני רוצה תזכורת|תזכיר לי שוב|remind)/i;
        const hasAnyReminderKeyword = anywhereKeywordPattern.test(text);
        const aiMissedReminder = hasAnyReminderKeyword && adaptedResult.intent !== 'create_reminder' && adaptedResult.intent !== 'update_reminder';

        if (aiMissedReminder) {
          logger.warn('🎯 Layer 3: AI missed reminder despite keyword presence', {
            userId,
            text: text.substring(0, 100),
            aiIntent: adaptedResult.intent,
            confidence: adaptedResult.confidence,
            hasKeyword: hasAnyReminderKeyword
          });

          // ===== OPTION 6: LOG AI MISSES AS #AI-MISS FOR TRAINING DATA =====
          // Log this failure to Redis for later analysis (similar to # comments)
          const aiMissMessage = `#AI-MISS [${adaptedResult.intent}@${adaptedResult.confidence.toFixed(2)}] User said: "${text.substring(0, 100)}" | Expected: create_reminder`;

          await redisMessageLogger.logOutgoingMessage({
            messageId: `ai-miss-${Date.now()}`,
            userId: userId,
            phone: phone,
            messageText: aiMissMessage,
            metadata: {
              type: 'ai_classification_failure',
              originalText: text,
              aiIntent: adaptedResult.intent,
              aiConfidence: adaptedResult.confidence,
              expectedIntent: 'create_reminder',
              detectedKeywords: text.match(/תזכיר|תזכירי|תזכורת|הזכר|הזכרה|הזכירי|הזכירו|מזכיר|נזכיר|אזכיר|remind/gi) || []
            }
          });

          logger.info('📊 Option 6: Logged AI miss to Redis for training', {
            userId,
            aiIntent: adaptedResult.intent,
            expectedIntent: 'create_reminder'
          });

          // Ask user for clarification with reminder-specific prompt
          await this.sendMessage(phone, '🤔 זיהיתי שאתה מזכיר "תזכורת".\n\nהאם רצית ליצור תזכורת חדשה? (כן/לא)\n\nאו שלח /תפריט לתפריט ראשי');
          return;
        }

        // ✅ FIX: Don't show menu after failed NLP - it breaks context and UX
        // Just provide helpful clarification message
        await this.sendMessage(phone, adaptedResult.clarificationNeeded || 'לא הבנתי. אנא נסה שוב או שלח /תפריט לתפריט ראשי');
        return;
      }

      // Track successful NLP parsing
      await proficiencyTracker.trackNLPSuccess(userId);

      // Handle different intents
      switch (adaptedResult.intent) {
        case 'create_event':
          await this.handleNLPCreateEvent(phone, userId, adaptedResult, text);
          break;

        case 'create_reminder':
          await this.handleNLPCreateReminder(phone, userId, adaptedResult, text);
          break;

        case 'search_event':
        case 'list_events':
          await this.handleNLPSearchEvents(phone, userId, adaptedResult);
          break;

        case 'list_reminders':
          await this.handleNLPListReminders(phone, userId, adaptedResult);
          break;

        case 'delete_event':
          await this.handleNLPDeleteEvent(phone, userId, adaptedResult);
          break;

        case 'delete_reminder':
          await this.handleNLPDeleteReminder(phone, userId, adaptedResult);
          break;

        case 'update_event':
          await this.handleNLPUpdateEvent(phone, userId, adaptedResult);
          break;

        case 'update_reminder':
          await this.handleNLPUpdateReminder(phone, userId, adaptedResult);
          break;

        case 'complete_task':
          await this.sendMessage(phone, '✅ תכונת סימון משימות כהושלמו תהיה זמינה בקרוב!\n\nשלח /תפריט לחזרה לתפריט');
          break;

        case 'add_contact':
          await this.sendMessage(phone, '👥 תכונת ניהול אנשי קשר הוסרה.\n\nשלח /תפריט לחזרה לתפריט ראשי');
          break;

        case 'send_message':
          await this.sendMessage(phone, '📝 תכונת שליחת הודעות תהיה זמינה בקרוב!\n\nשלח /תפריט לחזרה לתפריט ראשי');
          break;

        case 'add_comment':
          await this.handleNLPAddComment(phone, userId, adaptedResult);
          break;

        case 'view_comments':
          await this.handleNLPViewComments(phone, userId, adaptedResult);
          break;

        case 'delete_comment':
          await this.handleNLPDeleteComment(phone, userId, adaptedResult);
          break;

        case 'update_comment':
          await this.handleNLPUpdateComment(phone, userId, adaptedResult);
          break;

        case 'generate_dashboard':
          await this.handleGenerateDashboard(phone, userId);
          break;

        default:
          await this.sendMessage(phone, 'לא הבנתי. שלח /תפריט לתפריט ראשי');
      }

    } catch (error) {
      logger.error('Failed to process NLP message', { userId, text, error });
      await this.sendMessage(phone, 'אירעה שגיאה. שלח /תפריט לחזרה לתפריט');
    }
  }

  private async handleNLPCreateEvent(phone: string, userId: string, intent: any, originalText: string): Promise<void> {
    const { event } = intent;

    if (!event?.title || !event?.date) {
      await this.sendMessage(phone, 'לא זיהיתי את כל הפרטים. אנא נסה שוב או השתמש בתפריט לייצר אירוע.');
      return;
    }

    // Validate and parse date
    const dateQuery = parseDateFromNLP(event, 'handleNLPCreateEvent');

    if (!dateQuery.date) {
      await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nאנא נסח מחדש או שלח /תפריט');
      return;
    }

    let eventDate: Date = dateQuery.date;

    // BUG FIX #2: Validate day name matches actual date
    // Bug report: "הצלחתי להכניס את הפגישה אבל הוא התייחס רק לתאריך ולא התריע שיש טעות ביום"
    // Example: User says "Friday 23.10" but 23.10 is actually Thursday
    if (event?.dateText) {
      const dayValidation = validateDayNameMatchesDate(event.dateText, eventDate, 'Asia/Jerusalem');
      if (dayValidation && !dayValidation.isValid) {
        // Day/date mismatch detected! Ask user for confirmation
        logger.warn('Day/date mismatch detected', {
          userText: event.dateText,
          expectedDay: dayValidation.expectedDay,
          actualDay: dayValidation.actualDay,
          date: eventDate.toISOString()
        });

        await this.sendMessage(phone, dayValidation.warning);
        await this.stateManager.setState(userId, ConversationState.CONFIRMING_DATE_MISMATCH, {
          title: event.title,
          date: eventDate.toISOString(),
          location: event.location,
          participants: event.participants,
          notes: event.notes,
          expectedDay: dayValidation.expectedDay,
          actualDay: dayValidation.actualDay,
          fromNLP: true
        });
        return;
      }
    }

    // CRITICAL FIX: Check if time is included in the date
    // Check if NLP provided explicit time by examining the original date field
    const dt = DateTime.fromJSDate(eventDate).setZone('Asia/Jerusalem');

    // Better time detection: check if the original ISO string from NLP has explicit time
    // OR if the parsed time is not midnight
    let hasExplicitTime = false;

    if (event?.date && typeof event.date === 'string') {
      // Check if ISO string includes explicit time (not just T00:00:00)
      const timeMatch = event.date.match(/T(\d{2}):(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        hasExplicitTime = hours !== 0 || minutes !== 0;
      }
    }

    // Also check if parsed date has non-zero time
    const hasNonMidnightTime = dt.hour !== 0 || dt.minute !== 0;
    const hasTime = hasExplicitTime || hasNonMidnightTime;

    if (!hasTime && !event?.dateText?.includes(':')) {
      // No time specified - ask user for time instead of defaulting to 00:00
      logger.info('NLP event has no time, asking user', {
        title: event.title,
        date: dt.toFormat('dd/MM/yyyy'),
        hour: dt.hour,
        minute: dt.minute,
        originalDate: event?.date,
        dateText: event?.dateText
      });

      // ✅ FIX: Smart time suggestions based on event type
      const timeSuggestions = this.suggestTimeForEvent(event.title);
      const suggestionsText = timeSuggestions.length > 0
        ? `\n\n💡 הצעות: ${timeSuggestions.join(', ')}`
        : '';

      // ✅ FIX: Format participants for clarification state too
      let eventTitleForState = event.title;
      if (event.participants && event.participants.length > 0) {
        const participantNames = event.participants.map((p: any) => p.name).join(' ו');
        eventTitleForState = `${event.title} עם ${participantNames}`;
      }

      await this.sendMessage(phone, `📌 ${eventTitleForState}\n📅 ${dt.toFormat('dd/MM/yyyy')}\n\n⏰ באיזו שעה?\n\nהזן שעה (למשל: 14:00)${suggestionsText}\n\nאו שלח /ביטול`);
      await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_TIME, {
        title: eventTitleForState,
        date: eventDate.toISOString(),
        location: event.location,
        notes: event.contactName ? `עם ${event.contactName}` : undefined,
        fromNLP: true
      });
      return;
    }

    // Time exists - validate date is not in the past (with 30 second buffer for processing delays)
    const now = new Date();
    const bufferMs = 30 * 1000; // 30 seconds buffer

    if (eventDate.getTime() < (now.getTime() - bufferMs)) {
      // BUG FIX #21: Hybrid LLM + Rule-Based Approach (COMPLETED)
      // GPT-4 returned a past date - try parseHebrewDate() as fallback before rejecting
      // Extract date pattern from message (e.g., "עוד 2 דקות" from "תזכיר לי עוד 2 דקות לשתות מים")
      const datePatterns = [
        /עוד\s+\d+\s+דקות?/,   // עוד 2 דקות, עוד דקה
        /עוד\s+דקה/,            // עוד דקה
        /עוד\s+\d+\s+שעות?/,   // עוד 3 שעות, עוד שעה
        /עוד\s+שעה/,            // עוד שעה
        /עוד\s+\d+\s+ימים?/,   // עוד 5 ימים, עוד יום
      ];

      let extractedDate = originalText;
      for (const pattern of datePatterns) {
        const match = originalText.match(pattern);
        if (match) {
          extractedDate = match[0];
          break;
        }
      }

      logger.info('[BUG_FIX_21_HYBRID] GPT-4 returned past date, trying parseHebrewDate() fallback', {
        gptDate: eventDate.toISOString(),
        now: now.toISOString(),
        originalText: originalText,
        extractedDate: extractedDate
      });

      const fallbackResult = parseHebrewDate(extractedDate);

      if (fallbackResult.success && fallbackResult.date) {
        const fallbackDate = fallbackResult.date;

        // Check if fallback date is in the future
        if (fallbackDate.getTime() >= (now.getTime() - bufferMs)) {
          logger.info('[BUG_FIX_21_HYBRID] Fallback successful! Using parseHebrewDate() result', {
            gptDate: eventDate.toISOString(),
            fallbackDate: fallbackDate.toISOString(),
            originalText: originalText,
            difference: fallbackDate.getTime() - now.getTime()
          });

          // Use fallback date and continue processing
          eventDate = fallbackDate;
        } else {
          // Fallback also returned past date - reject
          logger.warn('[BUG_FIX_21_HYBRID] Fallback also returned past date', {
            gptDate: eventDate.toISOString(),
            fallbackDate: fallbackDate.toISOString(),
            originalText: originalText
          });

          await this.sendMessage(phone, '⚠️ התאריך שזיהיתי הוא בעבר. אנא נסח מחדש את הבקשה.');
          return;
        }
      } else {
        // Fallback failed - reject with original error
        logger.warn('[BUG_FIX_21_HYBRID] Fallback failed to parse date', {
          gptDate: eventDate.toISOString(),
          fallbackError: fallbackResult.error,
          originalText: originalText
        });

        await this.sendMessage(phone, '⚠️ התאריך שזיהיתי הוא בעבר. אנא נסח מחדש את הבקשה.');
        return;
      }
    }

    // Create event immediately (no confirmation needed)
    try {
      // ✅ FIX: Format participants and append to title (e.g., "פגישה" -> "פגישה עם איתי")
      let eventTitle = event.title;
      if (event.participants && event.participants.length > 0) {
        const participantNames = event.participants.map((p: any) => p.name).join(' ו');
        eventTitle = `${event.title} עם ${participantNames}`;
        logger.info('Appended participants to event title', {
          originalTitle: event.title,
          participants: event.participants.map((p: any) => p.name),
          finalTitle: eventTitle
        });
      }

      const newEvent = await this.eventService.createEvent({
        userId,
        title: eventTitle,
        startTsUtc: eventDate,
        location: event.location || undefined,
        rrule: event.recurrence || undefined // ✅ FIX: Pass recurrence RRULE from RecurrencePhase
      });

      // BUG FIX: Removed auto-comment feature for contactName
      // "עם מיכאל" was being incorrectly added as a comment instead of being recognized as a participant
      // Let Phase 9 (ParticipantPhase) handle participant detection instead

      // BUG FIX: Add comments from CommentPhase (Phase 8) if detected
      if (intent.comment?.text && newEvent) {
        await this.eventService.addComment(newEvent.id, userId, intent.comment.text, {
          priority: intent.comment.priority || 'normal'
        });
      }

      // CRITICAL FIX (Issue #8): Reload event from database to get fresh data with comments
      // User feedback: "#i asked to add a comment in prompt, I do not see it. Bug"
      const reloadedEvent = await this.eventService.getEventById(newEvent.id, userId);
      const eventToShow = reloadedEvent || newEvent;

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);

      // React to user's original message with thumbs up
      await this.reactToLastMessage(userId, '👍');

      // IMPORTANT: Check for time conflicts and warn user
      const hasConflict = (newEvent as any).hasTimeConflict;
      const conflictingEvents = (newEvent as any).conflictingEvents || [];

      if (hasConflict && conflictingEvents.length > 0) {
        const conflictTitles = conflictingEvents.map((e: any) => e.title).join(', ');
        await this.sendMessage(phone, `⚠️ אזהרה: יש לך אירוע נוסף באותה שעה!\n📌 ${conflictTitles}\n\nשני האירועים נשמרו.`);
      }

      // BUG FIX: Merge warnings into success message (prevents two separate WhatsApp messages)
      // Build success message with warnings if they exist
      let successMessage = '';

      // Add warnings first if they exist
      if (intent.warnings && intent.warnings.length > 0) {
        successMessage += intent.warnings.join('\n') + '\n\n';
      }

      // Add success confirmation with event details
      successMessage += `✅ אירוע נוסף בהצלחה!\n\n${formatEventWithComments(eventToShow)}`;

      const sentMessageId = await this.sendMessage(phone, successMessage);

      // Store message-event mapping for reply-to quick actions
      await this.storeMessageEventMapping(sentMessageId, newEvent.id);

      // BUG FIX #14: Track recent event for context awareness ("תזכיר לי" after event creation)
      await this.trackRecentEvent(userId, newEvent.id, eventTitle);

    } catch (error) {
      logger.error('Failed to create NLP event', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    }
  }

  private async handleNLPCreateReminder(phone: string, userId: string, intent: any, originalText: string): Promise<void> {
    const { reminder } = intent;

    if (!reminder?.title || !reminder?.dueDate) {
      await this.sendMessage(phone, 'לא זיהיתי את כל הפרטים. אנא נסה שוב או השתמש בתפריט ליצור תזכורת.');
      return;
    }

    // Validate and parse date
    let dueDate = safeParseDate(reminder.dueDate, 'handleNLPCreateReminder');

    if (!dueDate) {
      await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nאנא נסח מחדש או שלח /תפריט');
      logger.error('Invalid date in NLP create reminder', { dueDate: reminder.dueDate, intent });
      return;
    }

    // BUG FIX (#5): Check if time is included - if not, set default to 12:00
    let dt = DateTime.fromJSDate(dueDate).setZone('Asia/Jerusalem');
    const hasTime = dt.hour !== 0 || dt.minute !== 0;

    if (!hasTime) {
      // No time specified - set default time to 12:00
      logger.info('NLP reminder has no time, setting default 12:00', {
        title: reminder.title,
        date: dt.toFormat('dd/MM/yyyy'),
        hour: dt.hour,
        minute: dt.minute
      });

      dt = dt.set({ hour: 12, minute: 0 });
      dueDate = dt.toJSDate();

      logger.info('Default time applied', {
        title: reminder.title,
        newDateTime: dt.toFormat('dd/MM/yyyy HH:mm')
      });
    }

    // Validate date is not in the past (with 30 second buffer for processing delays)
    const now = new Date();
    const bufferMs = 30 * 1000; // 30 seconds buffer

    if (dueDate.getTime() < (now.getTime() - bufferMs)) {
      // BUG FIX #21: Hybrid LLM + Rule-Based Approach
      // GPT-4 returned a past date - try parseHebrewDate() as fallback before rejecting
      // Extract date pattern from message (e.g., "עוד 2 דקות" from "תזכיר לי עוד 2 דקות לשתות מים")
      const datePatterns = [
        /עוד\s+\d+\s+דקות?/,   // עוד 2 דקות, עוד דקה
        /עוד\s+דקה/,            // עוד דקה
        /עוד\s+\d+\s+שעות?/,   // עוד 3 שעות, עוד שעה
        /עוד\s+שעה/,            // עוד שעה
        /עוד\s+\d+\s+ימים?/,   // עוד 5 ימים, עוד יום
      ];

      let extractedDate = originalText;
      for (const pattern of datePatterns) {
        const match = originalText.match(pattern);
        if (match) {
          extractedDate = match[0];
          break;
        }
      }

      logger.info('[BUG_FIX_21_HYBRID] GPT-4 returned past date, trying parseHebrewDate() fallback', {
        gptDate: dueDate.toISOString(),
        now: now.toISOString(),
        originalText: originalText,
        extractedDate: extractedDate
      });

      const fallbackResult = parseHebrewDate(extractedDate);

      if (fallbackResult.success && fallbackResult.date) {
        const fallbackDate = fallbackResult.date;

        // Check if fallback date is in the future
        if (fallbackDate.getTime() >= (now.getTime() - bufferMs)) {
          logger.info('[BUG_FIX_21_HYBRID] Fallback successful! Using parseHebrewDate() result', {
            gptDate: dueDate.toISOString(),
            fallbackDate: fallbackDate.toISOString(),
            originalText: originalText,
            difference: fallbackDate.getTime() - now.getTime()
          });

          // Use fallback date and continue processing
          dueDate = fallbackDate;
          // BUG FIX #23: Update dt to reflect the new fallback date for correct display formatting
          dt = DateTime.fromJSDate(fallbackDate).setZone('Asia/Jerusalem');
        } else {
          // Fallback also returned past date - reject
          logger.warn('[BUG_FIX_21_HYBRID] Fallback also returned past date', {
            gptDate: dueDate.toISOString(),
            fallbackDate: fallbackDate.toISOString(),
            originalText: originalText
          });

          await this.sendMessage(phone, '⚠️ התאריך שזיהיתי הוא בעבר. אנא נסח מחדש את הבקשה.');
          return;
        }
      } else {
        // Fallback failed - reject with original error
        logger.warn('[BUG_FIX_21_HYBRID] Fallback failed to parse date', {
          gptDate: dueDate.toISOString(),
          fallbackError: fallbackResult.error,
          originalText: originalText
        });

        await this.sendMessage(phone, '⚠️ התאריך שזיהיתי הוא בעבר. אנא נסח מחדש את הבקשה.');
        return;
      }
    }

    // BUG FIX: Calculate display date based on whether leadTimeMinutes was extracted
    // If user said "תזכיר לי יום לפני", show when they'll GET NOTIFIED, not the event date
    let displayDate: string;
    let contextNote = '';

    if (reminder.leadTimeMinutes && typeof reminder.leadTimeMinutes === 'number' && reminder.leadTimeMinutes > 0) {
      // Lead time was extracted from user message - show NOTIFICATION time
      const notificationTime = dt.minus({ minutes: reminder.leadTimeMinutes });
      displayDate = notificationTime.toFormat('dd/MM/yyyy HH:mm');

      // Add context note showing when the actual event/reminder is
      const eventDate = dt.toFormat('dd/MM/yyyy HH:mm');

      // Format lead time in human-readable Hebrew
      let leadTimeText = '';
      if (reminder.leadTimeMinutes >= 1440) {
        const days = Math.floor(reminder.leadTimeMinutes / 1440);
        leadTimeText = days === 1 ? 'יום' : `${days} ימים`;
      } else if (reminder.leadTimeMinutes >= 60) {
        const hours = Math.floor(reminder.leadTimeMinutes / 60);
        leadTimeText = hours === 1 ? 'שעה' : `${hours} שעות`;
      } else {
        leadTimeText = `${reminder.leadTimeMinutes} דקות`;
      }

      contextNote = `⏰ תזכורת תישלח ${leadTimeText} לפני (${eventDate})`;

      logger.info('Display shows notification time (not event time)', {
        eventDate,
        notificationDate: displayDate,
        leadTimeMinutes: reminder.leadTimeMinutes,
        leadTimeText
      });
    } else {
      // No lead time extracted - show reminder due date as-is
      displayDate = dt.toFormat('dd/MM/yyyy HH:mm');
    }

    // Check if this is a recurring reminder
    const isRecurring = reminder.recurrence && reminder.recurrence.trim().length > 0;

    // Parse RRULE to human-readable format (basic parsing)
    let recurrenceText = '';
    if (isRecurring) {
      const rrule = reminder.recurrence.toUpperCase();
      if (rrule.includes('FREQ=DAILY')) {
        recurrenceText = '🔄 חוזר מידי יום';
      } else if (rrule.includes('FREQ=WEEKLY')) {
        if (rrule.includes('BYDAY=SU')) recurrenceText = '🔄 חוזר כל יום ראשון';
        else if (rrule.includes('BYDAY=MO')) recurrenceText = '🔄 חוזר כל יום שני';
        else if (rrule.includes('BYDAY=TU')) recurrenceText = '🔄 חוזר כל יום שלישי';
        else if (rrule.includes('BYDAY=WE')) recurrenceText = '🔄 חוזר כל יום רביעי';
        else if (rrule.includes('BYDAY=TH')) recurrenceText = '🔄 חוזר כל יום חמישי';
        else if (rrule.includes('BYDAY=FR')) recurrenceText = '🔄 חוזר כל יום שישי';
        else if (rrule.includes('BYDAY=SA')) recurrenceText = '🔄 חוזר כל יום שבת';
        else recurrenceText = '🔄 חוזר מידי שבוע';
      } else if (rrule.includes('FREQ=MONTHLY')) {
        recurrenceText = '🔄 חוזר מידי חודש';
      } else {
        recurrenceText = '🔄 תזכורת חוזרת';
      }
    }

    // UX IMPROVEMENT: Skip confirmation, directly create reminder with summary
    try {
      // Create reminder in database
      const createdReminder = await this.reminderService.createReminder({
        userId,
        title: reminder.title,
        dueTsUtc: dueDate,
        rrule: reminder.recurrence || undefined,
        notes: reminder.notes || undefined
      });

      // CRITICAL FIX: Use extracted lead time from message, fallback to user preference
      // If user said "תזכיר לי יום לפני", use that (1440 minutes), not default 15
      let leadTimeMinutes: number;
      if (reminder.leadTimeMinutes && typeof reminder.leadTimeMinutes === 'number' && reminder.leadTimeMinutes > 0) {
        leadTimeMinutes = reminder.leadTimeMinutes;
        logger.info('Using extracted lead time from NLP', { leadTimeMinutes, title: reminder.title });
      } else {
        // Fallback to user's reminder lead time preference (default: 15 minutes)
        leadTimeMinutes = await this.settingsService.getReminderLeadTime(userId);
        logger.info('Using user preference lead time', { leadTimeMinutes, title: reminder.title });
      }

      // Schedule with BullMQ
      await scheduleReminder({
        reminderId: createdReminder.id,
        userId,
        title: reminder.title,
        phone
      }, dueDate, leadTimeMinutes);

      // Send success summary (not confirmation question)
      const summaryMessage = `✅ תזכורת נקבעה:

📌 ${reminder.title}
📅 ${displayDate}
${contextNote ? contextNote + '\n' : ''}${recurrenceText ? recurrenceText + '\n' : ''}${reminder.notes ? '📝 הערות: ' + reminder.notes + '\n' : ''}
${isRecurring ? '\n💡 לביטול בעתיד: שלח "ביטול תזכורת ' + reminder.title + '"\n' : ''}`;

      await this.sendMessage(phone, summaryMessage);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);

      // Respect menu display preferences
      const menuPreference = await this.settingsService.getMenuDisplayMode(userId);
      const shouldShow = await proficiencyTracker.shouldShowMenu(userId, menuPreference, {
        isError: false,
        isIdle: false,
        isExplicitRequest: false
      });

      if (shouldShow.show) {
        await this.commandRouter.showMainMenu(phone);
      }

    } catch (error) {
      logger.error('Failed to create NLP reminder', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת התזכורת. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    }
  }

  private async handleNLPSearchEvents(phone: string, userId: string, intent: any): Promise<void> {
    const { event } = intent;

    // CRITICAL FIX: Support searching by TITLE in addition to date
    // Query like "מתי יש לי רופא שיניים?" should filter by title="רופא שיניים"
    const titleFilter = sanitizeTitleFilter(event?.title);

    // SMART FALLBACK: If NLP didn't extract date but title contains date words (like "היום?", "מחר?"),
    // treat it as a date query by parsing the title
    let fallbackDateText: string | undefined = undefined;
    if (!event?.date && !event?.dateText && event?.title) {
      const lowerTitle = event.title.toLowerCase().replace('?', '').trim();
      const dateWords = ['היום', 'מחר', 'מחרתיים', 'השבוע', 'החודש'];
      if (dateWords.includes(lowerTitle)) {
        fallbackDateText = lowerTitle;
        logger.info('Using fallback date parsing from title', { originalTitle: event.title, parsedDate: fallbackDateText });
      }
    }

    if (event?.date || event?.dateText || fallbackDateText || titleFilter) {
      let events: any[] = [];
      let dateDescription = '';

      // First, get events by date if date is specified
      if (event?.date || event?.dateText || fallbackDateText) {
        // Use fallback date if NLP didn't extract it
        const eventWithFallback = fallbackDateText ? { ...event, dateText: fallbackDateText } : event;
        const dateQuery = parseDateFromNLP(eventWithFallback, 'handleNLPSearchEvents');

        if (!dateQuery.date) {
          await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nנסה לפרט יותר או שלח /תפריט לתפריט ראשי');
          return;
        }

        // Determine which query to use based on date type
        if (dateQuery.isWeekRange) {
          // Week range query
          events = await this.eventService.getEventsForWeek(userId, dateQuery.date);
          const dt = DateTime.fromJSDate(dateQuery.date).setZone('Asia/Jerusalem');
          dateDescription = `בשבוע (${dt.startOf('week').toFormat('dd/MM')} - ${dt.endOf('week').toFormat('dd/MM')})`;
        } else if (dateQuery.isMonthRange) {
          // Month range query - get all events in month
          const dt = DateTime.fromJSDate(dateQuery.date).setZone('Asia/Jerusalem');
          const monthStart = dt.startOf('month').toJSDate();
          const monthEnd = dt.endOf('month').toJSDate();

          const query = `
            SELECT * FROM events
            WHERE user_id = $1
              AND start_ts_utc >= $2
              AND start_ts_utc < $3
            ORDER BY start_ts_utc ASC
          `;
          const result = await this.eventService['dbPool'].query(query, [userId, monthStart, monthEnd]);
          events = result.rows.map((row: any) => this.eventService['mapRowToEvent'](row));

          dateDescription = `בחודש ${dt.toFormat('MMMM', { locale: 'he' })}`;
        } else {
          // Single date query
          events = await this.eventService.getEventsByDate(userId, dateQuery.date!);

          // CRITICAL FIX: If querying for today, filter out past events
          const now = DateTime.now().setZone('Asia/Jerusalem');
          const queryDate = DateTime.fromJSDate(dateQuery.date!).setZone('Asia/Jerusalem');

          if (queryDate.hasSame(now, 'day')) {
            // This is today - only show future events
            events = events.filter(e => {
              const eventTime = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
              return eventTime >= now;
            });
            dateDescription = 'היום (אירועים עתידיים)';
          } else {
            // Check if it's tomorrow
            const tomorrow = now.plus({ days: 1 });
            if (queryDate.hasSame(tomorrow, 'day')) {
              dateDescription = `מחר (${queryDate.toFormat('dd/MM/yyyy')})`;
            } else {
              dateDescription = `ב-${queryDate.toFormat('dd/MM/yyyy')}`;
            }
          }
        }
      } else if (titleFilter) {
        // CRITICAL FIX: User only specified title, no date - search ALL events (past and future) by title
        // INCREASED LIMIT: Get up to 500 most recent events (DESC order) to ensure we don't miss old events
        // BUG FIX: User reported "הוא לא מוצא את האירוע , גם אם כתבתי אותו בדיוק כמו שהוא נרשם"
        // Root cause: 100 limit was too restrictive for users with many events
        events = await this.eventService.getAllEvents(userId, 500, 0, true);
        dateDescription = '';
      }

      // Filter by title if provided using fuzzy matching
      // BUG FIX: Lowered threshold from 0.45 to 0.3 for better Hebrew matching
      // Hebrew has many morphological variations that can reduce similarity scores
      // Lower threshold = higher recall (finds more potential matches)
      if (titleFilter && events.length > 0) {
        events = filterByFuzzyMatch(events, titleFilter, e => e.title, 0.3);
      }

      // Log for debugging
      logger.info('NLP search events result', {
        titleFilter,
        dateDescription,
        eventCount: events.length
      });

      if (events.length === 0) {
        const searchDesc = titleFilter ? `עבור "${titleFilter}"` : dateDescription;
        await this.sendMessage(phone, `📭 לא נמצאו אירועים ${searchDesc}.\n\nשלח /תפריט לחזרה לתפריט`);
        return;
      }

      // Build response message
      let message = '';
      if (titleFilter && dateDescription) {
        message = `📅 אירועים ${dateDescription} המכילים "${titleFilter}":\n\n`;
      } else if (titleFilter) {
        message = `📅 אירועים המכילים "${titleFilter}":\n\n`;
      } else {
        message = `📅 אירועים ${dateDescription}:\n\n`;
      }

      events.forEach((event, index) => {
        // For week/month ranges or title searches, show full date. For single date, show shorter format.
        const showFullDate = (dateDescription.includes('בשבוע') || dateDescription.includes('בחודש') || !!titleFilter);
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', showFullDate, events) + `\n\n`;
      });

      const sentMessageId = await this.sendMessage(phone, message);

      // Phase 1: Store event mapping for reply-to actions
      const eventIds = events.map(e => e.id);
      await this.storeMessageEventMapping(sentMessageId, eventIds.length === 1 ? eventIds[0] : eventIds);

      // Phase 2.4: Show hint for first-time users
      await this.sendQuickActionHint(phone, userId);
    } else {
      // Show all upcoming events (no filters)
      const events = await this.eventService.getUpcomingEvents(userId, 10);

      if (events.length === 0) {
        await this.sendMessage(phone, '📭 אין אירועים קרובים.\n\nשלח /תפריט לחזרה לתפריט');
        return;
      }

      let message = '📅 האירועים הקרובים שלך:\n\n';
      events.forEach((event, index) => {
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', false, events) + `\n\n`;
      });

      // Bug #2 Fix: Add Hebrew tips for user guidance
      message += '💡 טיפים שימושיים:\n';
      message += '• לעדכון: "עדכן אירוע [שם]"\n';
      message += '• למחיקה: "מחק אירוע [שם]"\n';
      message += '• להוספת הערה: "הוסף הערה ל[שם]"\n';

      const sentMessageId = await this.sendMessage(phone, message);

      // Phase 1: Store event mapping for reply-to actions
      const eventIds = events.map(e => e.id);
      await this.storeMessageEventMapping(sentMessageId, eventIds.length === 1 ? eventIds[0] : eventIds);

      // Phase 2.4: Show hint for first-time users
      await this.sendQuickActionHint(phone, userId);
    }
  }

  private async handleNLPDeleteEvent(phone: string, userId: string, intent: any): Promise<void> {
    const { event } = intent;

    // Handle bulk delete (delete all events)
    if (event?.deleteAll) {
      const allEvents = await this.eventService.getUpcomingEvents(userId, 100);

      if (allEvents.length === 0) {
        await this.sendMessage(phone, '📅 אין לך אירועים קרובים למחוק.');
        return;
      }

      // Show confirmation for bulk delete
      let confirmMsg = `⚠️ אתה עומד למחוק ${allEvents.length} אירועים:\n\n`;
      allEvents.slice(0, 5).forEach((evt, idx) => {
        const dt = DateTime.fromJSDate(evt.startTsUtc).setZone('Asia/Jerusalem');
        confirmMsg += `${idx + 1}. ${evt.title} - ${dt.toFormat('dd/MM HH:mm')}\n`;
      });
      if (allEvents.length > 5) {
        confirmMsg += `... ועוד ${allEvents.length - 5} אירועים\n`;
      }
      confirmMsg += `\n⚠️ פעולה זו תמחק את כל האירועים!\n\nהאם אתה בטוח? (כן/לא)`;

      await this.sendMessage(phone, confirmMsg);
      await this.stateManager.setState(userId, ConversationState.DELETING_ALL_EVENTS_CONFIRM, {
        eventIds: allEvents.map(e => e.id),
        fromNLP: true
      });
      return;
    }

    // If we have specific event details, search for matching events
    if (event?.title || event?.date) {
      let events: any[] = [];

      if (event.date || event.dateText) {
        // Search by date - with validation
        const dateQuery = parseDateFromNLP(event, 'handleNLPDeleteEvent');

        if (!dateQuery.date) {
          await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nנסה לפרט יותר או שלח /תפריט');
          return;
        }

        events = await this.eventService.getEventsByDate(userId, dateQuery.date!);
      } else {
        // Search all upcoming events
        events = await this.eventService.getUpcomingEvents(userId, 50);
      }

      // Filter by title if provided using fuzzy matching
      // BUG FIX: Lowered threshold to 0.3 (same as search) for consistent Hebrew matching
      const titleFilter = sanitizeTitleFilter(event.title);
      if (titleFilter && events.length > 0) {
        events = filterByFuzzyMatch(events, titleFilter, e => e.title, 0.3);
      }

      if (events.length === 0) {
        await this.sendMessage(phone, '❌ לא נמצא אירוע מתאים למחיקה.\n\nנסה לפרט יותר או שלח /תפריט לתפריט ראשי');
        return;
      }

      if (events.length === 1) {
        // Only one event found - show confirmation with red X icon
        const event = events[0];
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        const confirmMessage = `❌ למחוק את האירוע הבא? 🗑️\n\n📌 ${event.title}\n📅 ${dt.toFormat('dd/MM/yyyy HH:mm')}\n${event.location ? `📍 ${event.location}\n` : ''}\nהאם למחוק? (כן/לא)`;

        await this.sendMessage(phone, confirmMessage);
        await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_CONFIRM, {
          eventId: event.id,
          fromNLP: true
        });
        return;
      }

      // Multiple events found - show list (without comments to reduce clutter)
      let message = `📅 נמצאו ${events.length} אירועים:\n\n`;
      events.slice(0, 10).forEach((event, index) => {
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', false, events, false) + `\n\n`;
      });
      message += 'בחר מספר אירוע למחיקה או שלח /ביטול';

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.DELETING_EVENT, {
        events: events.slice(0, 10).map(e => e.id),
        fromNLP: true
      });
      return;
    }

    // No specific details - guide to menu
    await this.sendMessage(phone, '🗑️ מחיקת אירוע\n\nאיזה אירוע למחוק?\n\n1️⃣ הצג רשימת אירועים\n2️⃣ חזרה לתפריט\n\nבחר מספר');
    await this.stateManager.setState(userId, ConversationState.DELETING_EVENT);
  }

  private async handleNLPDeleteReminder(phone: string, userId: string, intent: any): Promise<void> {
    const { reminder } = intent;

    // Get all active reminders first
    const allReminders = await this.reminderService.getActiveReminders(userId, 100);

    if (allReminders.length === 0) {
      await this.sendMessage(phone, '📭 אין לך תזכורות פעילות.\n\nשלח /תפריט לחזרה לתפריט');
      return;
    }

    // If no title provided (user just said "מחק"), handle intelligently
    if (!reminder?.title) {
      // If only one active reminder, offer to delete it
      if (allReminders.length === 1) {
        const reminderToDelete = allReminders[0];
        const dt = DateTime.fromJSDate(reminderToDelete.dueTsUtc).setZone('Asia/Jerusalem');
        const displayDate = dt.isValid ? dt.toFormat('dd/MM/yyyy HH:mm') : '(תאריך לא זמין)';

        const isRecurring = reminderToDelete.rrule && reminderToDelete.rrule.trim().length > 0;

        let confirmMessage = `🗑️ יש לך תזכורת אחת פעילה:

📌 ${reminderToDelete.title}
📅 ${displayDate}`;

        if (isRecurring) {
          confirmMessage += '\n🔄 תזכורת חוזרת\n\n⚠️ מחיקה תבטל את כל התזכורות העתידיות!';
        }

        confirmMessage += '\n\nלמחוק את התזכורת? (כן/לא)';

        await this.sendMessage(phone, confirmMessage);
        await this.stateManager.setState(userId, ConversationState.DELETING_REMINDER_CONFIRM, {
          reminderId: reminderToDelete.id,
          isRecurring: isRecurring,
          fromNLP: true
        });
        return;
      }

      // Multiple reminders - show list to choose from
      let message = `🗑️ יש לך ${allReminders.length} תזכורות פעילות:\n\n`;
      allReminders.slice(0, 10).forEach((r, index) => {
        const dt = DateTime.fromJSDate(r.dueTsUtc).setZone('Asia/Jerusalem');
        const displayDate = dt.isValid ? dt.toFormat('dd/MM HH:mm') : '(תאריך לא זמין)';
        const isRecurring = r.rrule && r.rrule.trim().length > 0;
        message += `${index + 1}️⃣ ${r.title}\n   📅 ${displayDate}${isRecurring ? ' 🔄' : ''}\n\n`;
      });
      message += 'איזו תזכורת למחוק? בחר מספר או שלח /ביטול';

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.DELETING_REMINDER_SELECT, {
        reminders: allReminders.slice(0, 10).map(r => r.id),
        fromNLP: true
      });
      return;
    }

    // Use fuzzy match helper (same as events, 0.45 threshold for Hebrew flexibility)
    const titleFilter = sanitizeTitleFilter(reminder.title);
    if (!titleFilter) {
      await this.sendMessage(phone, '❌ לא זיהיתי איזו תזכורת למחוק.\n\nשלח /תפריט לחזרה לתפריט');
      return;
    }
    let matchedReminders = filterByFuzzyMatch(allReminders, titleFilter, (r: any) => r.title, 0.45);

    if (matchedReminders.length === 0) {
      await this.sendMessage(phone, `❌ לא מצאתי תזכורת עם השם "${reminder.title}".\n\nשלח /תפריט לחזרה לתפריט`);
      return;
    }

    if (matchedReminders.length === 1) {
      // Single match - ask for confirmation
      const reminderToDelete = matchedReminders[0];
      const dt = DateTime.fromJSDate(reminderToDelete.dueTsUtc).setZone('Asia/Jerusalem');
      const displayDate = dt.isValid ? dt.toFormat('dd/MM/yyyy HH:mm') : '(תאריך לא זמין)';

      // Check if recurring
      const isRecurring = reminderToDelete.rrule && reminderToDelete.rrule.trim().length > 0;

      let confirmMessage = `🗑️ מצאתי תזכורת:

📌 ${reminderToDelete.title}
📅 ${displayDate}`;

      if (isRecurring) {
        confirmMessage += '\n🔄 תזכורת חוזרת\n\n⚠️ מחיקה תבטל את כל התזכורות העתידיות!';
      }

      confirmMessage += '\n\nלמחוק את התזכורת? (כן/לא)';

      await this.sendMessage(phone, confirmMessage);
      await this.stateManager.setState(userId, ConversationState.DELETING_REMINDER_CONFIRM, {
        reminderId: reminderToDelete.id,
        isRecurring: isRecurring,
        fromNLP: true
      });
      return;
    }

    // Multiple matches - show list
    let message = `🔍 מצאתי ${matchedReminders.length} תזכורות:\n\n`;
    matchedReminders.slice(0, 5).forEach((r: any, index: number) => {
      const dt = DateTime.fromJSDate(r.dueTsUtc).setZone('Asia/Jerusalem');
      const displayDate = dt.isValid ? dt.toFormat('dd/MM/yyyy HH:mm') : '(תאריך לא זמין)';
      const recurringIcon = (r.rrule && r.rrule.trim().length > 0) ? '🔄 ' : '';
      message += `${index + 1}. ${recurringIcon}${r.title} - ${displayDate}\n`;
    });

    message += '\nאיזו תזכורת למחוק? (שלח מספר או /ביטול)';

    await this.sendMessage(phone, message);
    await this.stateManager.setState(userId, ConversationState.DELETING_REMINDER_SELECT, {
      matchedReminders: matchedReminders.slice(0, 5),
      fromNLP: true
    });
  }

  private async handleNLPUpdateEvent(phone: string, userId: string, intent: any): Promise<void> {
    const { event } = intent;

    // Check if user provided specific update values (date, location, etc.)
    // If yes, we should search by title ONLY and apply the update directly
    const hasUpdateValue = (event?.date || event?.dateText || event?.location);
    const hasSearchTerm = (event?.title);

    // Search for the event to update
    if (hasSearchTerm || (event?.date && !hasUpdateValue)) {
      let events: any[] = [];

      // CRITICAL FIX: When we have BOTH title and date/location:
      // - The title is the SEARCH term
      // - The date/location is the NEW VALUE to update
      // So we should search by title ONLY, not by date!
      if (hasUpdateValue && hasSearchTerm) {
        // User said "update EVENT_TITLE to NEW_VALUE"
        // Search by title in recent events (past + future, DESC order)
        events = await this.eventService.getAllEvents(userId, 100, 0, true);
        const titleFilter = sanitizeTitleFilter(event.title);
        if (titleFilter) {
          events = filterByFuzzyMatch(events, titleFilter, e => e.title, 0.3);
        }
      } else if (event.date || event.dateText) {
        // User said "update event on DATE" - date is search term
        const dateQuery = parseDateFromNLP(event, 'handleNLPUpdateEvent');

        if (!dateQuery.date) {
          await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nנסה לפרט יותר או שלח /תפריט');
          return;
        }

        events = await this.eventService.getEventsByDate(userId, dateQuery.date!);

        // Filter by title if provided (30% threshold for Hebrew flexibility)
        const titleFilter = sanitizeTitleFilter(event.title);
        if (titleFilter && events.length > 0) {
          events = filterByFuzzyMatch(events, titleFilter, e => e.title, 0.3);
        }
      } else {
        // Search all recent events (past + future, DESC order)
        events = await this.eventService.getAllEvents(userId, 100, 0, true);

        // Filter by title if provided (30% threshold for Hebrew flexibility)
        const titleFilter = sanitizeTitleFilter(event.title);
        if (titleFilter && events.length > 0) {
          events = filterByFuzzyMatch(events, titleFilter, e => e.title, 0.3);
        }
      }

      if (events.length === 0) {
        // No matches - get some recent events to help user
        const recentEvents = await this.eventService.getAllEvents(userId, 5, 0, true);
        let helpMessage = '❌ לא נמצא אירוע לעדכון.\n\n';
        if (recentEvents.length > 0) {
          helpMessage += 'האירועים האחרונים שלך:\n';
          recentEvents.forEach((e: any) => {
            const dt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
            helpMessage += `• ${e.title} (${dt.toFormat('dd/MM HH:mm')})\n`;
          });
          helpMessage += '\nנסה שוב עם השם המדויק';
        } else {
          helpMessage += 'אין לך אירועים.\nשלח /תפריט לחזרה';
        }
        await this.sendMessage(phone, helpMessage);
        return;
      }

      if (events.length === 1 && hasUpdateValue) {
        // CRITICAL FIX: If user specified what to update (date/location), apply it directly!
        const eventToUpdate = events[0];

        // Parse the new date if provided
        let newDate: Date | undefined;
        if (event.date || event.dateText) {
          const dateQuery = parseDateFromNLP(event, 'handleNLPUpdateEvent-newValue');
          newDate = dateQuery.date || undefined;

          // CRITICAL FIX (Issue #4): If new date has no time (midnight), preserve original event's time
          if (newDate) {
            const newDt = DateTime.fromJSDate(newDate).setZone('Asia/Jerusalem');
            const hasTime = newDt.hour !== 0 || newDt.minute !== 0;

            if (!hasTime) {
              // No time specified - preserve the original event's time
              const originalDt = DateTime.fromJSDate(eventToUpdate.startTsUtc).setZone('Asia/Jerusalem');
              newDate = newDt.set({
                hour: originalDt.hour,
                minute: originalDt.minute,
                second: 0,
                millisecond: 0
              }).toJSDate();

              logger.info('Preserved original time when updating date', {
                originalTime: originalDt.toFormat('HH:mm'),
                newDate: newDt.toFormat('dd/MM/yyyy'),
                finalDateTime: DateTime.fromJSDate(newDate).toFormat('dd/MM/yyyy HH:mm')
              });
            }
          }
        }

        // Apply the update
        try {
          const updateData: any = {};
          if (newDate) updateData.startTsUtc = newDate;
          if (event.location) updateData.location = event.location;

          const updated = await this.eventService.updateEvent(eventToUpdate.id, userId, updateData);

          if (updated) {
            const sentMessageId = await this.sendMessage(phone, `✅ האירוע עודכן בהצלחה!\n\n${formatEventWithComments(updated)}`);
            // Store message-event mapping for reply-to quick actions
            await this.storeMessageEventMapping(sentMessageId, updated.id);
          } else {
            await this.sendMessage(phone, '❌ לא הצלחתי לעדכן את האירוע. נסה שוב.');
          }
        } catch (error) {
          logger.error('Failed to update event from NLP', { eventId: eventToUpdate.id, error });
          await this.sendMessage(phone, '❌ אירעה שגיאה בעדכון האירוע. נסה שוב.');
        }
        return;
      }

      if (events.length === 1) {
        // Found one event but no specific update value - show menu
        const eventToUpdate = events[0];
        const dt = DateTime.fromJSDate(eventToUpdate.startTsUtc).setZone('Asia/Jerusalem');

        await this.sendMessage(phone, `✏️ עריכת אירוע: ${eventToUpdate.title}\n📅 ${dt.toFormat('dd/MM/yyyy HH:mm')}\n\nמה לערוך?\n\n1️⃣ שם\n2️⃣ תאריך ושעה\n3️⃣ מיקום\n4️⃣ חזרה\n\nבחר מספר`);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT, {
          eventId: eventToUpdate.id,
          fromNLP: true
        });
        return;
      }

      // Multiple events - show list
      let message = `📅 נמצאו ${events.length} אירועים:\n\n`;
      events.slice(0, 10).forEach((e, index) => {
        const dt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
        message += `${index + 1}. ${e.title}\n   📅 ${dt.toFormat('dd/MM HH:mm')}\n\n`;
      });
      message += 'בחר מספר אירוע לעדכון';

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.EDITING_EVENT, {
        events: events.slice(0, 10).map(e => e.id),
        fromNLP: true
      });
      return;
    }

    // SMART FALLBACK: Handle date-only scenario (no title)
    // This happens when user says "דחה את האירוע מחר למחרתיים"
    // NLP only returns destination date, not source
    if (event?.date || event?.dateText) {
      const dateQuery = parseDateFromNLP(event, 'handleNLPUpdateEvent-dateOnly');

      if (!dateQuery.date) {
        await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nנסה לפרט יותר או שלח /תפריט');
        return;
      }

      // First, try searching for events ON this date (maybe user wants to update event happening on this date)
      let events = await this.eventService.getEventsByDate(userId, dateQuery.date);
      const dt = DateTime.fromJSDate(dateQuery.date).setZone('Asia/Jerusalem');
      const formattedDate = dt.toFormat('dd/MM/yyyy');

      if (events.length > 0) {
        // Found events on this date - user probably meant "update event ON this date"
        if (events.length === 1) {
          const eventToUpdate = events[0];
          const eventDt = DateTime.fromJSDate(eventToUpdate.startTsUtc).setZone('Asia/Jerusalem');

          await this.sendMessage(phone, `✏️ עריכת אירוע: ${eventToUpdate.title}\n📅 ${eventDt.toFormat('dd/MM/yyyy HH:mm')}\n\nמה לערוך?\n\n1️⃣ שם\n2️⃣ תאריך ושעה\n3️⃣ מיקום\n4️⃣ חזרה\n\nבחר מספר`);
          await this.stateManager.setState(userId, ConversationState.EDITING_EVENT, {
            eventId: eventToUpdate.id,
            fromNLP: true
          });
        } else {
          // Multiple events on this date
          let message = `📅 נמצאו ${events.length} אירועים ב-${formattedDate}:\n\n`;
          events.slice(0, 10).forEach((e, index) => {
            const eventDt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
            message += `${index + 1}. ${e.title}\n   📅 ${eventDt.toFormat('HH:mm')}\n\n`;
          });
          message += 'בחר מספר אירוע לעדכון';

          await this.sendMessage(phone, message);
          await this.stateManager.setState(userId, ConversationState.EDITING_EVENT, {
            events: events.slice(0, 10).map(e => e.id),
            fromNLP: true
          });
        }
        return;
      }

      // No events found ON this date - user probably meant "postpone/reschedule TO this date"
      // Show upcoming events so user can pick which one to reschedule
      events = await this.eventService.getUpcomingEvents(userId, 10);

      if (events.length === 0) {
        await this.sendMessage(phone, '📭 לא נמצאו אירועים קרובים לעדכון.\n\nשלח /תפריט לחזרה לתפריט');
        return;
      }

      let message = `לא נמצאו אירועים ב-${formattedDate}.\n\nהאם רצית לדחות אירוע לתאריך זה?\n\n📅 האירועים הקרובים שלך:\n\n`;
      events.forEach((e, index) => {
        const eventDt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
        message += `${index + 1}. ${e.title}\n   📅 ${eventDt.toFormat('dd/MM HH:mm')}\n\n`;
      });
      message += `בחר מספר אירוע לדחות ל-${formattedDate}\n\nאו שלח /ביטול`;

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.EDITING_EVENT, {
        events: events.map(e => e.id),
        postponeToDate: dateQuery.date.toISOString(),
        fromNLP: true
      });
      return;
    }

    // No specific event - guide to menu
    await this.sendMessage(phone, '✏️ עריכת אירוע\n\nאיזה אירוע לערוך?\n\nשלח /תפריט לחזרה לתפריט');
  }

  private async handleNLPUpdateReminder(phone: string, userId: string, intent: any): Promise<void> {
    const { reminder } = intent;

    // Extract new time/date if provided
    const hasNewTime = reminder?.time || reminder?.date || reminder?.dateText || reminder?.dueDate;

    if (!hasNewTime) {
      await this.sendMessage(phone, '❌ לא זיהיתי מה לעדכן (זמן/תאריך).\n\nדוגמה: "עדכן אימון לשעה 9"\n\nשלח /תפריט לחזרה');
      return;
    }

    // Get all reminders
    const allReminders = await this.reminderService.getActiveReminders(userId, 100);

    if (allReminders.length === 0) {
      await this.sendMessage(phone, '📭 אין לך תזכורות פעילות.\n\nשלח /תפריט לחזרה לתפריט');
      return;
    }

    // BUG FIX #7: Handle context-aware updates without title (e.g., "תשנה ל 17:30")
    let matchedReminders: any[];
    if (!reminder?.title || reminder.title.trim() === '') {
      // No title specified - use the next upcoming reminder (most likely just created)
      const sortedByTime = allReminders.sort((a: any, b: any) =>
        new Date(a.dueTsUtc).getTime() - new Date(b.dueTsUtc).getTime()
      );
      matchedReminders = [sortedByTime[0]]; // Take the soonest reminder

      // Inform user which reminder is being updated
      const dt = DateTime.fromJSDate(sortedByTime[0].dueTsUtc).setZone('Asia/Jerusalem');
      const dateStr = dt.toFormat('dd/MM/yyyy HH:mm');
      console.log(`[Bug #7] Context-aware update: Using next reminder "${sortedByTime[0].title}" (${dateStr})`);
    } else {
      // Title provided - use fuzzy match (0.3 threshold for Hebrew flexibility - more lenient)
      const titleFilter = sanitizeTitleFilter(reminder.title);
      if (!titleFilter) {
        await this.sendMessage(phone, '❌ לא זיהיתי איזו תזכורת לעדכן.\n\nשלח /תפריט לחזרה לתפריט');
        return;
      }
      matchedReminders = filterByFuzzyMatch(allReminders, titleFilter, (r: any) => r.title, 0.3);
    }

    if (matchedReminders.length === 0) {
      // No matches - show available reminders to help user
      let helpMessage = `❌ לא מצאתי תזכורת עם השם "${reminder.title}".\n\n`;
      helpMessage += `התזכורות שלך:\n`;
      allReminders.slice(0, 5).forEach((r: any, index: number) => {
        const dt = DateTime.fromJSDate(r.dueTsUtc).setZone('Asia/Jerusalem');
        const recurringIcon = (r.rrule && r.rrule.trim().length > 0) ? '🔄 ' : '';
        helpMessage += `• ${recurringIcon}${r.title}\n`;
      });
      helpMessage += `\nנסה שוב עם השם המדויק, או שלח /תפריט לחזרה`;
      await this.sendMessage(phone, helpMessage);
      return;
    }

    // Parse the new date/time
    let newDateTime: Date | null = null;

    if (reminder.date || reminder.dateText) {
      // Full date/time provided
      newDateTime = safeParseDate(reminder.date || reminder.dateText, 'handleNLPUpdateReminder');
    } else if (reminder.time && matchedReminders.length > 0) {
      // Only time provided (e.g., "תעדכן שעה ל 19:00")
      // Use the first matched reminder's date and update time
      const existingReminder = matchedReminders[0];
      const existingDt = DateTime.fromJSDate(existingReminder.dueTsUtc).setZone('Asia/Jerusalem');

      // Parse time from format "19:00" or "19:30"
      const timeMatch = reminder.time.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);

        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          // Keep the date, update the time
          newDateTime = existingDt.set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
          logger.info('Updated reminder time only', {
            originalTime: existingDt.toFormat('HH:mm'),
            newTime: `${hour}:${minute}`,
            reminderId: existingReminder.id
          });
        }
      }
    }

    if (!newDateTime) {
      await this.sendMessage(phone, '❌ לא הצלחתי להבין את הזמן/תאריך החדש.\n\nנסה שוב או שלח /תפריט');
      logger.error('Invalid date in NLP update reminder', { date: reminder.date, dateText: reminder.dateText, time: reminder.time });
      return;
    }

    if (matchedReminders.length === 1) {
      // Single match - check if recurring
      const reminderToUpdate = matchedReminders[0];
      const isRecurring = reminderToUpdate.rrule && reminderToUpdate.rrule.trim().length > 0;

      if (isRecurring) {
        // Recurring reminder - ask user: this one or all?
        await this.showRecurringUpdateOptions(phone, userId, reminderToUpdate, newDateTime);
      } else {
        // Non-recurring - confirm update directly
        await this.confirmReminderUpdate(phone, userId, reminderToUpdate, newDateTime, false);
      }
      return;
    }

    // Multiple matches - show list
    let message = `🔍 מצאתי ${matchedReminders.length} תזכורות:\n\n`;
    matchedReminders.slice(0, 5).forEach((r: any, index: number) => {
      const dt = DateTime.fromJSDate(r.dueTsUtc).setZone('Asia/Jerusalem');
      const displayDate = dt.isValid ? dt.toFormat('dd/MM/yyyy HH:mm') : '(תאריך לא זמין)';
      const recurringIcon = (r.rrule && r.rrule.trim().length > 0) ? '🔄 ' : '';
      message += `${index + 1}. ${recurringIcon}${r.title} - ${displayDate}\n`;
    });

    message += '\nאיזו תזכורת לעדכן? (שלח מספר או /ביטול)';

    await this.sendMessage(phone, message);
    await this.stateManager.setState(userId, ConversationState.UPDATING_REMINDER_SELECT, {
      matchedReminders: matchedReminders.slice(0, 5),
      newDateTime: newDateTime.toISOString(),
      fromNLP: true
    });
  }

  private async showRecurringUpdateOptions(phone: string, userId: string, reminder: any, newDateTime: Date): Promise<void> {
    const dt = DateTime.fromJSDate(reminder.dueTsUtc).setZone('Asia/Jerusalem');
    const newDt = DateTime.fromJSDate(newDateTime).setZone('Asia/Jerusalem');

    // Calculate next occurrence
    const now = DateTime.now().setZone('Asia/Jerusalem');
    let nextOccurrence = dt;

    // If current time is in the past, find next occurrence
    if (dt < now) {
      // Simple approach: add 7 days if weekly (most common case)
      if (reminder.rrule.includes('FREQ=WEEKLY')) {
        const daysUntilNext = (dt.weekday - now.weekday + 7) % 7 || 7;
        nextOccurrence = now.plus({ days: daysUntilNext }).set({ hour: dt.hour, minute: dt.minute });
      } else if (reminder.rrule.includes('FREQ=DAILY')) {
        nextOccurrence = now.plus({ days: 1 }).set({ hour: dt.hour, minute: dt.minute });
      } else {
        nextOccurrence = now.plus({ weeks: 1 }).set({ hour: dt.hour, minute: dt.minute });
      }
    }

    const message = `🔄 תזכורת חוזרת: "${reminder.title}"
📅 זמן נוכחי: ${dt.toFormat('HH:mm')}
🆕 זמן חדש: ${newDt.toFormat('HH:mm')}

לעדכן את:

1️⃣ רק הפעם הבאה (${nextOccurrence.toFormat('dd/MM')})
2️⃣ את כולם (כל המופעים)
❌ ביטול

שלח מספר (1-2)`;

    await this.sendMessage(phone, message);
    await this.stateManager.setState(userId, ConversationState.UPDATING_REMINDER_OCCURRENCE, {
      reminderId: reminder.id,
      reminderTitle: reminder.title,
      originalTime: reminder.dueTsUtc.toISOString(),
      newDateTime: newDateTime.toISOString(),
      rrule: reminder.rrule,
      nextOccurrence: nextOccurrence.toJSDate().toISOString(),
      fromNLP: true
    });
  }

  private async confirmReminderUpdate(phone: string, userId: string, reminder: any, newDateTime: Date, isRecurring: boolean): Promise<void> {
    const oldDt = DateTime.fromJSDate(reminder.dueTsUtc).setZone('Asia/Jerusalem');
    const newDt = DateTime.fromJSDate(newDateTime).setZone('Asia/Jerusalem');

    const confirmMessage = `✏️ עדכון תזכורת: "${reminder.title}"

📅 זמן ישן: ${oldDt.toFormat('dd/MM/yyyy HH:mm')}
🆕 זמן חדש: ${newDt.toFormat('dd/MM/yyyy HH:mm')}
${isRecurring ? '🔄 יעודכנו כל המופעים\n' : ''}
האם לעדכן? (כן/לא)`;

    await this.sendMessage(phone, confirmMessage);
    await this.stateManager.setState(userId, ConversationState.UPDATING_REMINDER_CONFIRM, {
      reminderId: reminder.id,
      newDateTime: newDateTime.toISOString(),
      updateAll: isRecurring,
      fromNLP: true
    });
  }

  private async handleNLPListReminders(phone: string, userId: string, intent: any): Promise<void> {
    try {
      // CRITICAL FIX (Issue #7a): Filter reminders by title if specified
      // User feedback: "#whybshow me all reminders? I asked only about water drink"
      const { reminder } = intent;
      const titleFilter = sanitizeTitleFilter(reminder?.title);

      // Get all active reminders for user
      let reminders = await this.reminderService.getActiveReminders(userId, 50);

      // CRITICAL FIX (Issue #7b): Don't show past reminders
      // User feedback: "2. Do not show past reminders."
      const now = DateTime.now().setZone('Asia/Jerusalem');
      reminders = reminders.filter(r => {
        const reminderTime = DateTime.fromJSDate(r.dueTsUtc).setZone('Asia/Jerusalem');
        return reminderTime >= now;
      });

      if (reminders.length === 0) {
        await this.sendMessage(phone, '📭 אין לך תזכורות פעילות.\n\nשלח /תפריט לחזרה לתפריט');
        return;
      }

      // CRITICAL FIX (Issue #7a): Filter by title if provided (fuzzy matching)
      if (titleFilter && reminders.length > 0) {
        reminders = filterByFuzzyMatch(reminders, titleFilter, (r: any) => r.title, 0.45);

        if (reminders.length === 0) {
          await this.sendMessage(phone, `❌ לא נמצאו תזכורות עבור "${titleFilter}".\n\nשלח /תפריט לחזרה לתפריט`);
          return;
        }
      }

      // Format reminders list
      const titleDescription = titleFilter ? ` עבור "${titleFilter}"` : '';
      let message = `⏰ התזכורות שלך${titleDescription} (${reminders.length}):\n\n`;

      reminders.forEach((reminder, index) => {
        const dt = DateTime.fromJSDate(reminder.dueTsUtc).setZone('Asia/Jerusalem');
        const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');
        const recurringIcon = (reminder.rrule && reminder.rrule.trim().length > 0) ? '🔄 ' : '';

        message += `${index + 1}. ${recurringIcon}${reminder.title}\n`;
        message += `   📅 ${displayDate}\n`;
        if (reminder.rrule) {
          // Parse RRULE to show frequency
          const rrule = reminder.rrule.toUpperCase();
          if (rrule.includes('FREQ=DAILY')) {
            message += `   🔄 חוזר מידי יום\n`;
          } else if (rrule.includes('FREQ=WEEKLY')) {
            if (rrule.includes('BYDAY=SU')) message += `   🔄 חוזר כל יום ראשון\n`;
            else if (rrule.includes('BYDAY=MO')) message += `   🔄 חוזר כל יום שני\n`;
            else if (rrule.includes('BYDAY=TU')) message += `   🔄 חוזר כל יום שלישי\n`;
            else if (rrule.includes('BYDAY=WE')) message += `   🔄 חוזר כל יום רביעי\n`;
            else if (rrule.includes('BYDAY=TH')) message += `   🔄 חוזר כל יום חמישי\n`;
            else if (rrule.includes('BYDAY=FR')) message += `   🔄 חוזר כל יום שישי\n`;
            else if (rrule.includes('BYDAY=SA')) message += `   🔄 חוזר כל יום שבת\n`;
            else message += `   🔄 חוזר מידי שבוע\n`;
          } else if (rrule.includes('FREQ=MONTHLY')) {
            message += `   🔄 חוזר מידי חודש\n`;
          }
        }
        message += '\n';
      });

      message += '💡 לעדכן: "עדכן [שם] לשעה [זמן]"\n';
      message += '💡 למחוק: "מחק תזכורת [שם]"';

      await this.sendMessage(phone, message);

    } catch (error) {
      logger.error('Failed to list reminders from NLP', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת התזכורות.\n\nשלח /תפריט לחזרה לתפריט');
    }
  }

  /**
   * Handle adding a comment to an event via NLP
   */
  private async handleNLPAddComment(phone: string, userId: string, intent: any): Promise<void> {
    const { comment } = intent;

    if (!comment?.eventTitle || !comment?.text) {
      await this.sendMessage(phone, 'לא זיהיתי את כל הפרטים. אנא נסה שוב.\n\nדוגמה: הוסף הערה לרופא שיניים: תזכיר על הביק');
      return;
    }

    try {
      // Find the event by title (fuzzy match)
      const events = await this.eventService.searchEvents(userId, comment.eventTitle);
      const matchedEvents = filterByFuzzyMatch(events, comment.eventTitle, (e) => e.title);

      if (matchedEvents.length === 0) {
        await this.sendMessage(phone, formatEventNotFound(comment.eventTitle));
        return;
      }

      if (matchedEvents.length > 1) {
        // Multiple matches - ask user to be more specific
        const eventList = matchedEvents.slice(0, 5).map((e, idx) => {
          const dt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
          return `${idx + 1}. ${e.title} - ${dt.toFormat('dd/MM/yyyy HH:mm')}`;
        }).join('\n');

        await this.sendMessage(phone, `נמצאו ${matchedEvents.length} אירועים:\n\n${eventList}\n\nאנא פרט יותר את שם האירוע.`);
        return;
      }

      const event = matchedEvents[0];

      // Add the comment
      const newComment = await this.eventService.addComment(
        event.id,
        userId,
        comment.text,
        {
          priority: comment.priority || 'normal',
        }
      );

      // Check if user wants a reminder from this comment
      let reminderDate: Date | null = null;

      // CRITICAL FIX: Support offset-based reminders (e.g., "remind me 1 hour before event")
      if (comment.reminderOffset && typeof comment.reminderOffset === 'number') {
        // Calculate reminder time based on event time + offset (offset is negative, e.g., -60 for 1 hour before)
        const eventTime = event.startTsUtc.getTime();
        const offsetMs = comment.reminderOffset * 60 * 1000; // Convert minutes to milliseconds
        reminderDate = new Date(eventTime + offsetMs);

        logger.info('Created offset-based reminder', {
          eventTitle: event.title,
          eventTime: event.startTsUtc.toISOString(),
          offsetMinutes: comment.reminderOffset,
          reminderTime: reminderDate.toISOString()
        });
      } else if (comment.reminderTime) {
        // Absolute reminder time provided
        reminderDate = safeParseDate(comment.reminderTime, 'handleNLPAddComment');
      }

      // If we have a valid reminder date, create the reminder
      if (reminderDate && !isNaN(reminderDate.getTime())) {
        // CRITICAL FIX: Validate reminderDate is valid before creating reminder
        // Prevents Invalid Date from being stored and displayed to user

        // Create reminder and link it to comment
        const reminder = await this.reminderService.createReminder({
          userId,
          title: comment.text || `תזכורת: ${event.title}`,
          dueTsUtc: reminderDate,
          eventId: event.id,
        });

        // Update comment with reminderId
        await this.eventService.updateComment(event.id, userId, newComment.id, {
          reminderId: reminder.id,
        });

        // Get user's reminder lead time preference
        const leadTimeMinutes = await this.settingsService.getReminderLeadTime(userId);

        // Schedule reminder
        await scheduleReminder({
          reminderId: reminder.id,
          userId,
          title: reminder.title,
          phone,
        }, reminderDate, leadTimeMinutes);

        // Send confirmation with reminder
        const message = formatCommentWithReminder(newComment, event, reminderDate);
        await this.sendMessage(phone, message);
        return;
      } else if (comment.reminderTime || comment.reminderOffset) {
        // Invalid reminder time - log and skip reminder creation
        logger.warn('Invalid reminder time in add comment', {
          userId,
          reminderTime: comment.reminderTime,
          reminderOffset: comment.reminderOffset,
          eventTitle: event.title
        });
        // Fall through to regular comment confirmation (no reminder)
      }

      // Send confirmation based on priority
      let message: string;
      if (comment.priority && comment.priority !== 'normal') {
        message = formatCommentAddedWithPriority(newComment, event);
      } else {
        message = formatCommentAdded(newComment, event);
      }

      // Check if this is user's first comment - show education tip
      const commentCount = await this.eventService.getCommentCount(event.id, userId);
      if (commentCount === 1) {
        message += '\n\n' + formatCommentEducationTip();
      }

      await this.sendMessage(phone, message);

    } catch (error) {
      logger.error('Failed to add comment', { userId, comment, error });
      await this.sendMessage(phone, '❌ שגיאה בהוספת הערה. נסה שוב מאוחר יותר.');
    }
  }

  /**
   * Handle viewing comments for an event via NLP
   */
  private async handleNLPViewComments(phone: string, userId: string, intent: any): Promise<void> {
    const { comment } = intent;

    if (!comment?.eventTitle) {
      await this.sendMessage(phone, 'לא זיהיתי את שם האירוע. אנא נסה שוב.\n\nדוגמה: הצג הערות רופא שיניים');
      return;
    }

    try {
      // Find the event by title (fuzzy match)
      const events = await this.eventService.searchEvents(userId, comment.eventTitle);
      const matchedEvents = filterByFuzzyMatch(events, comment.eventTitle, (e) => e.title);

      if (matchedEvents.length === 0) {
        await this.sendMessage(phone, formatEventNotFound(comment.eventTitle));
        return;
      }

      if (matchedEvents.length > 1) {
        // Multiple matches - ask user to be more specific
        const eventList = matchedEvents.slice(0, 5).map((e, idx) => {
          const dt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
          return `${idx + 1}. ${e.title} - ${dt.toFormat('dd/MM/yyyy HH:mm')}`;
        }).join('\n');

        await this.sendMessage(phone, `נמצאו ${matchedEvents.length} אירועים:\n\n${eventList}\n\nאנא פרט יותר את שם האירוע.`);
        return;
      }

      const event = matchedEvents[0];

      // Format and send comments
      const message = formatEventComments(event);
      await this.sendMessage(phone, message);

    } catch (error) {
      logger.error('Failed to view comments', { userId, comment, error });
      await this.sendMessage(phone, '❌ שגיאה בהצגת הערות. נסה שוב מאוחר יותר.');
    }
  }

  /**
   * Handle deleting a comment from an event via NLP
   */
  private async handleNLPDeleteComment(phone: string, userId: string, intent: any): Promise<void> {
    const { comment } = intent;

    if (!comment?.deleteBy) {
      await this.sendMessage(phone, 'לא זיהיתי איזו הערה למחוק. אנא נסה שוב.\n\nדוגמאות:\n• מחק הערה 2\n• מחק הערה אחרונה\n• מחק "להביא מסמכים"');
      return;
    }

    try {
      // Find the event - if eventTitle is provided, search for it
      let event: any = null;

      if (comment.eventTitle) {
        const events = await this.eventService.searchEvents(userId, comment.eventTitle);
        const matchedEvents = filterByFuzzyMatch(events, comment.eventTitle, (e) => e.title);

        if (matchedEvents.length === 0) {
          await this.sendMessage(phone, formatEventNotFound(comment.eventTitle));
          return;
        }

        if (matchedEvents.length > 1) {
          const eventList = matchedEvents.slice(0, 5).map((e, idx) => {
            const dt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
            return `${idx + 1}. ${e.title} - ${dt.toFormat('dd/MM/yyyy HH:mm')}`;
          }).join('\n');

          await this.sendMessage(phone, `נמצאו ${matchedEvents.length} אירועים:\n\n${eventList}\n\nאנא פרט יותר את שם האירוע.`);
          return;
        }

        event = matchedEvents[0];
      } else {
        // No event specified - find the most recent event with comments
        const recentEvents = await this.eventService.getUpcomingEvents(userId, 50);
        const eventsWithComments = recentEvents.filter(e => e.notes && e.notes.length > 0);

        if (eventsWithComments.length === 0) {
          await this.sendMessage(phone, '❌ לא נמצאו אירועים עם הערות.');
          return;
        }

        event = eventsWithComments[0];
      }

      // Delete comment based on deleteBy method
      let deletedComment: any = null;

      switch (comment.deleteBy) {
        case 'index':
          if (typeof comment.deleteValue === 'number') {
            deletedComment = await this.eventService.deleteCommentByIndex(event.id, userId, comment.deleteValue);
          }
          break;

        case 'last':
          deletedComment = await this.eventService.deleteLastComment(event.id, userId);
          break;

        case 'text':
          if (typeof comment.deleteValue === 'string') {
            const foundComment = await this.eventService.findCommentByText(event.id, userId, comment.deleteValue);
            if (foundComment) {
              deletedComment = await this.eventService.deleteComment(event.id, userId, foundComment.id);
            }
          }
          break;
      }

      if (!deletedComment) {
        if (comment.deleteBy === 'index') {
          await this.sendMessage(phone, formatCommentNotFound(comment.deleteValue as number));
        } else {
          await this.sendMessage(phone, formatCommentNotFound());
        }
        return;
      }

      // Get remaining comment count
      const remainingCount = await this.eventService.getCommentCount(event.id, userId);

      // Send confirmation
      const message = formatCommentDeleted(deletedComment, event, remainingCount);
      await this.sendMessage(phone, message);

    } catch (error) {
      logger.error('Failed to delete comment', { userId, comment, error });
      await this.sendMessage(phone, '❌ שגיאה במחיקת הערה. נסה שוב מאוחר יותר.');
    }
  }

  /**
   * Handle updating a comment via NLP
   */
  private async handleNLPUpdateComment(phone: string, userId: string, intent: any): Promise<void> {
    const { comment } = intent;

    if (!comment?.commentIndex || !comment?.text) {
      await this.sendMessage(phone, 'לא זיהיתי איזו הערה לעדכן או מה השינוי.\n\nדוגמה: עדכן הערה 1 להביא פספורט');
      return;
    }

    try {
      // Find the event - if eventTitle is provided, search for it
      let event: any = null;

      if (comment.eventTitle) {
        const events = await this.eventService.searchEvents(userId, comment.eventTitle);
        const matchedEvents = filterByFuzzyMatch(events, comment.eventTitle, (e) => e.title);

        if (matchedEvents.length === 0) {
          await this.sendMessage(phone, formatEventNotFound(comment.eventTitle));
          return;
        }

        if (matchedEvents.length > 1) {
          const eventList = matchedEvents.slice(0, 5).map((e, idx) => {
            const dt = DateTime.fromJSDate(e.startTsUtc).setZone('Asia/Jerusalem');
            return `${idx + 1}. ${e.title} - ${dt.toFormat('dd/MM/yyyy HH:mm')}`;
          }).join('\n');

          await this.sendMessage(phone, `נמצאו ${matchedEvents.length} אירועים:\n\n${eventList}\n\nאנא פרט יותר את שם האירוע.`);
          return;
        }

        event = matchedEvents[0];
      } else {
        // No event specified - find the most recent event with comments
        const recentEvents = await this.eventService.getUpcomingEvents(userId, 50);
        const eventsWithComments = recentEvents.filter(e => e.notes && e.notes.length > 0);

        if (eventsWithComments.length === 0) {
          await this.sendMessage(phone, '❌ לא נמצאו אירועים עם הערות.');
          return;
        }

        event = eventsWithComments[0];
      }

      // Get the comments
      const comments = await this.eventService.getComments(event.id, userId);
      const commentIndex = comment.commentIndex - 1; // Convert to 0-based

      if (commentIndex < 0 || commentIndex >= comments.length) {
        await this.sendMessage(phone, `❌ הערה ${comment.commentIndex} לא קיימת.\n\nיש ${comments.length} הערות לאירוע זה.`);
        return;
      }

      const existingComment = comments[commentIndex];

      // Update the comment
      const updatedComment = await this.eventService.updateComment(
        event.id,
        userId,
        existingComment.id,
        {
          text: comment.text,
          priority: comment.priority || existingComment.priority,
        }
      );

      if (!updatedComment) {
        await this.sendMessage(phone, '❌ שגיאה בעדכון ההערה. נסה שוב.');
        return;
      }

      // Send confirmation
      const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
      const priorityIcon = updatedComment.priority === 'urgent' ? '🔴' : updatedComment.priority === 'high' ? '🟡' : '';

      const message = `✅ הערה ${comment.commentIndex} עודכנה!

📌 ${event.title}
📅 ${dt.toFormat('dd/MM/yyyy HH:mm')}

${priorityIcon} הערה ${comment.commentIndex}: ${updatedComment.text}`;

      await this.sendMessage(phone, message);

    } catch (error) {
      logger.error('Failed to update comment', { userId, comment, error });
      await this.sendMessage(phone, '❌ שגיאה בעדכון ההערה. נסה שוב מאוחר יותר.');
    }
  }

  /**
   * Suggest times based on event type/title keywords
   * Returns array of suggested times (e.g., ["7:00", "8:00"])
   */
  private suggestTimeForEvent(title: string): string[] {
    const lowerTitle = title.toLowerCase();

    // Blood tests / medical labs - early morning
    if (lowerTitle.includes('בדיקת דם') || lowerTitle.includes('מעבדה') || lowerTitle.includes('דם')) {
      return ['7:00', '8:00', '9:00'];
    }

    // Doctor appointments - morning/afternoon
    if (lowerTitle.includes('רופא') || lowerTitle.includes('רופאה') || lowerTitle.includes('קופת חולים')) {
      return ['9:00', '10:00', '14:00'];
    }

    // Dentist
    if (lowerTitle.includes('שיניים') || lowerTitle.includes('רופא שיניים')) {
      return ['9:00', '10:00', '16:00'];
    }

    // Gym / workout
    if (lowerTitle.includes('אימון') || lowerTitle.includes('חדר כושר') || lowerTitle.includes('ספורט') || lowerTitle.includes('כושר')) {
      return ['6:00', '17:00', '18:00'];
    }

    // Business meetings
    if (lowerTitle.includes('פגישה') || lowerTitle.includes('ישיבה') || lowerTitle.includes('פגישת עבודה')) {
      return ['9:00', '10:00', '14:00'];
    }

    // Dinner / meal
    if (lowerTitle.includes('ארוחת ערב') || lowerTitle.includes('ארוחה') || lowerTitle.includes('מסעדה')) {
      return ['19:00', '20:00', '21:00'];
    }

    // Breakfast
    if (lowerTitle.includes('ארוחת בוקר') || lowerTitle.includes('בוקר')) {
      return ['8:00', '9:00', '10:00'];
    }

    // Classes / courses
    if (lowerTitle.includes('חוג') || lowerTitle.includes('קורס') || lowerTitle.includes('שיעור')) {
      return ['17:00', '18:00', '19:00'];
    }

    // Haircut / beauty
    if (lowerTitle.includes('תספורת') || lowerTitle.includes('מספרה') || lowerTitle.includes('יופי')) {
      return ['10:00', '14:00', '16:00'];
    }

    // No specific suggestions
    return [];
  }

  /**
   * Generate and send a dashboard link to the user
   */
  private async handleGenerateDashboard(phone: string, userId: string): Promise<void> {
    try {
      logger.info('Generating dashboard for user', { userId });

      // Send initial message
      await this.sendMessage(phone, '⏳ יוצר לוח אישי...');

      // Generate token
      const token = await dashboardTokenService.generateToken(userId);

      // Build URL (use environment variable for production)
      let baseUrl: string;

      if (process.env.DASHBOARD_URL) {
        // Explicitly configured URL (highest priority)
        baseUrl = process.env.DASHBOARD_URL;
        logger.info('Using DASHBOARD_URL from environment', { baseUrl });
      } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        // Railway automatic domain
        baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
        logger.info('Using RAILWAY_PUBLIC_DOMAIN', { baseUrl });
      } else if (process.env.NODE_ENV === 'production') {
        // CRITICAL ERROR: No domain configured in production
        logger.error('❌ DASHBOARD_URL and RAILWAY_PUBLIC_DOMAIN not set in production!');
        await this.sendMessage(phone, '❌ שגיאה בהגדרת השרת. אנא צור קשר עם התמיכה.');
        return;
      } else {
        // Development
        baseUrl = `http://localhost:${process.env.PORT || 3000}`;
      }

      const dashboardUrl = `${baseUrl}/d/${token}`;

      logger.info('Generated dashboard URL', {
        baseUrl,
        hasRailwayDomain: !!process.env.RAILWAY_PUBLIC_DOMAIN,
        hasDashboardUrl: !!process.env.DASHBOARD_URL,
        nodeEnv: process.env.NODE_ENV
      });

      // Send consolidated dashboard link in one message
      const message = `✨ *הלוח האישי שלך מוכן!*

📊 צפה בכל האירועים והמשימות שלך בממשק נוח וצבעוני

${dashboardUrl}

⏰ הקישור תקף ל-15 דקות בלבד
💡 ניתן לפתוח מכל מכשיר - מחשב, טאבלט או נייד`;

      await this.sendMessage(phone, message);

      logger.info('Dashboard link sent successfully', {
        userId,
        token: token.substring(0, 8) + '...'
      });

    } catch (error) {
      logger.error('Failed to generate dashboard', { userId, error });
      await this.sendMessage(phone, '❌ שגיאה ביצירת הלוח. אנא נסה שוב מאוחר יותר.');
    }
  }

  /**
   * BUG FIX #14: Track recently created events for context awareness
   * Stores last 3 events in Redis with 30-minute TTL for "תזכיר לי" context
   *
   * Example: User creates event "פגישה עם דני", then says "תזכיר לי"
   * → Bot knows to create reminder linked to "פגישה עם דני"
   */
  private async trackRecentEvent(userId: string, eventId: string, eventTitle: string): Promise<void> {
    try {
      const key = `temp:recent_events:${userId}`;
      const TTL = 30 * 60; // 30 minutes

      // Retrieve existing recent events
      const existingRaw = await redis.get(key);
      let recentEvents: Array<{id: string, title: string, createdAt: string}> = [];

      if (existingRaw) {
        try {
          recentEvents = JSON.parse(existingRaw);
        } catch {
          // Invalid JSON, start fresh
          recentEvents = [];
        }
      }

      // Add new event to the beginning
      recentEvents.unshift({
        id: eventId,
        title: eventTitle,
        createdAt: new Date().toISOString()
      });

      // Keep only last 3 events
      recentEvents = recentEvents.slice(0, 3);

      // Store back to Redis with TTL
      await redis.setex(key, TTL, JSON.stringify(recentEvents));

      logger.info('[BUG_FIX_#14] Tracked recent event for context awareness', {
        userId,
        eventId,
        eventTitle,
        totalRecent: recentEvents.length,
        ttl: `${TTL/60} minutes`
      });
    } catch (error) {
      logger.error('[BUG_FIX_#14] Failed to track recent event', { userId, eventId, error });
      // Non-critical error, don't throw
    }
  }

  /**
   * BUG FIX #14: Retrieve recently created events for context injection
   * Returns up to 3 most recent events created by user
   */
  private async getRecentEvents(userId: string): Promise<Array<{id: string, title: string, createdAt: string}>> {
    try {
      const key = `temp:recent_events:${userId}`;
      const existingRaw = await redis.get(key);

      if (!existingRaw) {
        return [];
      }

      try {
        const recentEvents = JSON.parse(existingRaw);
        return Array.isArray(recentEvents) ? recentEvents : [];
      } catch {
        return [];
      }
    } catch (error) {
      logger.error('[BUG_FIX_#14] Failed to get recent events', { userId, error });
      return [];
    }
  }
}
