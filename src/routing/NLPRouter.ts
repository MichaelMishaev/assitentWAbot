import { StateManager } from '../services/StateManager.js';
import { AuthService } from '../services/AuthService.js';
import { EventService } from '../services/EventService.js';
import { ReminderService } from '../services/ReminderService.js';
import { ContactService } from '../services/ContactService.js';
import { dashboardTokenService } from '../services/DashboardTokenService.js';
import { proficiencyTracker } from '../services/ProficiencyTracker.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';
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
import { parseHebrewDate } from '../utils/hebrewDateParser.js';

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
      logger.info('Parsed Hebrew date from NLP', {
        dateText: event.dateText,
        parsedDate: hebrewResult.date.toISOString(),
        isWeekQuery,
        isMonthQuery,
        context
      });

      result.date = hebrewResult.date;

      if (isWeekQuery) {
        result.isWeekRange = true;
        // Get week range
        const dt = DateTime.fromJSDate(hebrewResult.date).setZone('Asia/Jerusalem');
        result.rangeStart = dt.startOf('week').toJSDate();
        result.rangeEnd = dt.endOf('week').toJSDate();
      } else if (isMonthQuery) {
        result.isMonthRange = true;
        // Get month range
        const dt = DateTime.fromJSDate(hebrewResult.date).setZone('Asia/Jerusalem');
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
    private messageProvider: IMessageProvider,
    private commandRouter: CommandRouter,
    private sendMessage: (to: string, message: string) => Promise<string>,
    private reactToLastMessage: (userId: string, emoji: string) => Promise<void>,
    private storeMessageEventMapping: (messageId: string, eventIds: string | string[]) => Promise<void>,
    private sendQuickActionHint: (phone: string, userId: string) => Promise<void>
  ) {}

  async handleNLPMessage(phone: string, userId: string, text: string): Promise<void> {
    try {
      const { DualNLPService } = await import('../services/DualNLPService.js');
      const nlp = new DualNLPService();

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

          // Retrieve event titles
          const eventTitles: string[] = [];
          for (const eventId of eventIds.slice(0, 5)) { // Max 5 events for context
            const event = await this.eventService.getEventById(eventId, userId);
            if (event) {
              eventTitles.push(event.title);
            }
          }

          // Inject event context into user text for NLP
          if (eventTitles.length === 1) {
            contextEnhancedText = `${text} (בהקשר לאירוע: ${eventTitles[0]})`;
          } else if (eventTitles.length > 1) {
            contextEnhancedText = `${text} (בהקשר לאירועים: ${eventTitles.join(', ')})`;
          }

          logger.info('Injected event context into NLP', { userId, originalText: text, enhancedText: contextEnhancedText });
        } catch (error) {
          logger.error('Failed to inject event context', { userId, error });
          // Continue with original text if context injection fails
        }
      }

      const intent = await nlp.parseIntent(contextEnhancedText, contacts, user?.timezone || 'Asia/Jerusalem', conversationHistory, userId);

      // Intent-specific confidence thresholds
      const isSearchIntent = intent.intent === 'search_event' || intent.intent === 'list_events';
      const isCreateIntent = intent.intent === 'create_event' || intent.intent === 'create_reminder';
      const isDestructiveIntent = intent.intent === 'delete_event' || intent.intent === 'delete_reminder';

      // Lower threshold for search/list (0.5) - non-destructive operations
      // Higher threshold for create (0.7) - user can confirm
      // Highest threshold for delete (0.6) - destructive but confirmable
      const requiredConfidence = isSearchIntent ? 0.5 : (isCreateIntent ? 0.7 : 0.6);

      // If confidence is too low, ask for clarification
      if (intent.confidence < requiredConfidence || intent.intent === 'unknown') {
        await proficiencyTracker.trackNLPFailure(userId);
        await this.sendMessage(phone, intent.clarificationNeeded || 'לא הבנתי. אנא נסה שוב או שלח /תפריט לתפריט ראשי');
        await this.commandRouter.showAdaptiveMenu(phone, userId, { isError: true });
        return;
      }

      // Track successful NLP parsing
      await proficiencyTracker.trackNLPSuccess(userId);

      // Handle different intents
      switch (intent.intent) {
        case 'create_event':
          await this.handleNLPCreateEvent(phone, userId, intent);
          break;

        case 'create_reminder':
          await this.handleNLPCreateReminder(phone, userId, intent);
          break;

        case 'search_event':
        case 'list_events':
          await this.handleNLPSearchEvents(phone, userId, intent);
          break;

        case 'list_reminders':
          await this.handleNLPListReminders(phone, userId, intent);
          break;

        case 'delete_event':
          await this.handleNLPDeleteEvent(phone, userId, intent);
          break;

        case 'delete_reminder':
          await this.handleNLPDeleteReminder(phone, userId, intent);
          break;

        case 'update_event':
          await this.handleNLPUpdateEvent(phone, userId, intent);
          break;

        case 'update_reminder':
          await this.handleNLPUpdateReminder(phone, userId, intent);
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
          await this.handleNLPAddComment(phone, userId, intent);
          break;

        case 'view_comments':
          await this.handleNLPViewComments(phone, userId, intent);
          break;

        case 'delete_comment':
          await this.handleNLPDeleteComment(phone, userId, intent);
          break;

        case 'update_comment':
          await this.handleNLPUpdateComment(phone, userId, intent);
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

  private async handleNLPCreateEvent(phone: string, userId: string, intent: any): Promise<void> {
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

      await this.sendMessage(phone, `📌 ${event.title}\n📅 ${dt.toFormat('dd/MM/yyyy')}\n\n⏰ באיזו שעה?\n\nהזן שעה (למשל: 14:00)\n\nאו שלח /ביטול`);
      await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_TIME, {
        title: event.title,
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
      await this.sendMessage(phone, '⚠️ התאריך שזיהיתי הוא בעבר. אנא נסח מחדש את הבקשה.');
      logger.warn('NLP created event in the past', {
        eventDate: eventDate.toISOString(),
        now: now.toISOString(),
        difference: eventDate.getTime() - now.getTime(),
        userMessage: event.title
      });
      return;
    }

    // Create event immediately (no confirmation needed)
    try {
      const newEvent = await this.eventService.createEvent({
        userId,
        title: event.title,
        startTsUtc: eventDate,
        location: event.location || undefined
      });

      // If contact name exists, add it as a comment
      if (event.contactName && newEvent) {
        await this.eventService.addComment(newEvent.id, userId, `עם ${event.contactName}`, { priority: 'normal' });
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

      // CRITICAL FIX (Issue #8): Use formatEventWithComments to show event with all comments
      const successMessage = `✅ אירוע נוסף בהצלחה!\n\n${formatEventWithComments(eventToShow)}`;

      const sentMessageId = await this.sendMessage(phone, successMessage);

      // Store message-event mapping for reply-to quick actions
      await this.storeMessageEventMapping(sentMessageId, newEvent.id);

    } catch (error) {
      logger.error('Failed to create NLP event', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    }
  }

  private async handleNLPCreateReminder(phone: string, userId: string, intent: any): Promise<void> {
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

    // CRITICAL FIX: Check if time is included
    const dt = DateTime.fromJSDate(dueDate).setZone('Asia/Jerusalem');
    const hasTime = dt.hour !== 0 || dt.minute !== 0;

    if (!hasTime) {
      // No time specified - ask user for time
      logger.info('NLP reminder has no time, asking user', {
        title: reminder.title,
        date: dt.toFormat('dd/MM/yyyy'),
        hour: dt.hour,
        minute: dt.minute
      });

      await this.sendMessage(phone, `📌 ${reminder.title}\n📅 ${dt.toFormat('dd/MM/yyyy')}\n\n⏰ באיזו שעה?\n\nהזן תאריך ושעה (למשל: מחר 14:30)\n\nאו שלח /ביטול`);
      await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_DATETIME, {
        title: reminder.title,
        fromNLP: true
      });
      return;
    }

    // Validate date is not in the past (with 30 second buffer for processing delays)
    const now = new Date();
    const bufferMs = 30 * 1000; // 30 seconds buffer

    if (dueDate.getTime() < (now.getTime() - bufferMs)) {
      await this.sendMessage(phone, '⚠️ התאריך שזיהיתי הוא בעבר. אנא נסח מחדש את הבקשה.');
      logger.warn('NLP created reminder in the past', {
        dueDate: dueDate.toISOString(),
        now: now.toISOString(),
        difference: dueDate.getTime() - now.getTime(),
        userMessage: reminder.title
      });
      return;
    }

    // Format date for display - use DateTime to ensure correct timezone display
    const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');

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

    const confirmMessage = `✅ זיהיתי תזכורת חדשה:

📌 ${reminder.title}
📅 ${displayDate}
${recurrenceText ? recurrenceText + '\n' : ''}
${isRecurring ? '\n💡 לביטול בעתיד: שלח "ביטול תזכורת ' + reminder.title + '"\n' : ''}
האם לקבוע את התזכורת? (כן/לא)`;

    await this.sendMessage(phone, confirmMessage);
    await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_CONFIRM, {
      title: reminder.title,
      dueTsUtc: dueDate,
      rrule: reminder.recurrence || null, // ✅ FIX: Pass RRULE to context
      notes: reminder.notes || null, // ✅ NEW: Pass notes to context
      fromNLP: true
    });
  }

  private async handleNLPSearchEvents(phone: string, userId: string, intent: any): Promise<void> {
    const { event } = intent;

    // CRITICAL FIX: Support searching by TITLE in addition to date
    // Query like "מתי יש לי רופא שיניים?" should filter by title="רופא שיניים"
    if (event?.date || event?.dateText || event?.title) {
      let events: any[] = [];
      let dateDescription = '';
      let titleFilter = event?.title;

      // First, get events by date if date is specified
      if (event?.date || event?.dateText) {
        const dateQuery = parseDateFromNLP(event, 'handleNLPSearchEvents');

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
        // CRITICAL FIX: User only specified title, no date - search recent events (past and future) by title
        // Get 100 most recent events (DESC order) to include both past and upcoming events
        events = await this.eventService.getAllEvents(userId, 100, 0, true);
        dateDescription = '';
      }

      // Filter by title if provided using fuzzy matching
      // Lowered to 0.45 for better Hebrew matching (morphology variations)
      if (titleFilter && events.length > 0) {
        events = filterByFuzzyMatch(events, titleFilter, e => e.title, 0.45);
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
        const showFullDate = (dateDescription.includes('בשבוע') || dateDescription.includes('בחודש') || titleFilter);
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

      // Filter by title if provided using fuzzy matching (45% threshold for Hebrew flexibility)
      if (event.title && events.length > 0) {
        events = filterByFuzzyMatch(events, event.title, e => e.title, 0.45);
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

      // Multiple events found - show list
      let message = `📅 נמצאו ${events.length} אירועים:\n\n`;
      events.slice(0, 10).forEach((event, index) => {
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', false, events) + `\n\n`;
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

    if (!reminder?.title) {
      await this.sendMessage(phone, '❌ לא זיהיתי איזו תזכורת למחוק.\n\nאנא נסה שוב או שלח /תפריט');
      return;
    }

    // Search for reminders by title (fuzzy match)
    const allReminders = await this.reminderService.getActiveReminders(userId, 100);

    if (allReminders.length === 0) {
      await this.sendMessage(phone, '📭 אין לך תזכורות פעילות.\n\nשלח /תפריט לחזרה לתפריט');
      return;
    }

    // Use fuzzy match helper (same as events, 0.45 threshold for Hebrew flexibility)
    let matchedReminders = filterByFuzzyMatch(allReminders, reminder.title, (r: any) => r.title, 0.45);

    if (matchedReminders.length === 0) {
      await this.sendMessage(phone, `❌ לא מצאתי תזכורת עם השם "${reminder.title}".\n\nשלח /תפריט לחזרה לתפריט`);
      return;
    }

    if (matchedReminders.length === 1) {
      // Single match - ask for confirmation
      const reminderToDelete = matchedReminders[0];
      const dt = DateTime.fromJSDate(reminderToDelete.dueTsUtc).setZone('Asia/Jerusalem');
      const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');

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
      const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');
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
        events = filterByFuzzyMatch(events, event.title, e => e.title, 0.3);
      } else if (event.date || event.dateText) {
        // User said "update event on DATE" - date is search term
        const dateQuery = parseDateFromNLP(event, 'handleNLPUpdateEvent');

        if (!dateQuery.date) {
          await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nנסה לפרט יותר או שלח /תפריט');
          return;
        }

        events = await this.eventService.getEventsByDate(userId, dateQuery.date!);

        // Filter by title if provided (30% threshold for Hebrew flexibility)
        if (event.title && events.length > 0) {
          events = filterByFuzzyMatch(events, event.title, e => e.title, 0.3);
        }
      } else {
        // Search all recent events (past + future, DESC order)
        events = await this.eventService.getAllEvents(userId, 100, 0, true);

        // Filter by title if provided (30% threshold for Hebrew flexibility)
        if (event.title && events.length > 0) {
          events = filterByFuzzyMatch(events, event.title, e => e.title, 0.3);
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

    if (!reminder?.title) {
      await this.sendMessage(phone, '❌ לא זיהיתי איזו תזכורת לעדכן.\n\nאנא נסה שוב או שלח /תפריט');
      return;
    }

    // Extract new time/date if provided
    const hasNewTime = reminder.time || reminder.date || reminder.dateText;

    if (!hasNewTime) {
      await this.sendMessage(phone, '❌ לא זיהיתי מה לעדכן (זמן/תאריך).\n\nדוגמה: "עדכן אימון לשעה 9"\n\nשלח /תפריט לחזרה');
      return;
    }

    // Search for reminders by title (fuzzy match)
    const allReminders = await this.reminderService.getActiveReminders(userId, 100);

    if (allReminders.length === 0) {
      await this.sendMessage(phone, '📭 אין לך תזכורות פעילות.\n\nשלח /תפריט לחזרה לתפריט');
      return;
    }

    // Use fuzzy match (0.3 threshold for Hebrew flexibility - more lenient)
    let matchedReminders = filterByFuzzyMatch(allReminders, reminder.title, (r: any) => r.title, 0.3);

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
      const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');
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
      const titleFilter = reminder?.title;

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

        // Schedule reminder
        await scheduleReminder({
          reminderId: reminder.id,
          userId,
          title: reminder.title,
          phone,
        }, reminderDate);

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
      } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        // Railway automatic domain
        baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
      } else if (process.env.NODE_ENV === 'production') {
        // Production fallback - you need to set DASHBOARD_URL in Railway!
        logger.warn('DASHBOARD_URL not set in production - using placeholder');
        baseUrl = 'https://your-app-url.railway.app';
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
}
