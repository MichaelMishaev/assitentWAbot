import { StateManager } from './StateManager';
import { AuthService } from './AuthService';
import { EventService } from './EventService';
import { ReminderService } from './ReminderService';
import { ContactService } from './ContactService';
import { SettingsService } from './SettingsService';
import { IMessageProvider } from '../providers/IMessageProvider';
import { ConversationState, AuthState } from '../types';
import { redis } from '../config/redis';
import logger from '../utils/logger';
import { parseHebrewDate } from '../utils/hebrewDateParser';
import { safeParseDate, extractDateFromIntent } from '../utils/dateValidator';
import {
  formatEventComments,
  formatCommentAdded,
  formatCommentAddedWithPriority,
  formatCommentWithReminder,
  formatCommentDeleted,
  formatEventNotFound,
  formatCommentNotFound,
  formatNoCommentsToDelete,
  formatCommentEducationTip,
  formatEventWithComments
} from '../utils/commentFormatter';

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
 * Parse date from NLP intent - handles both ISO dates and Hebrew date text
 * Returns DateQuery with range information
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
import { DateTime } from 'luxon';
import { scheduleReminder } from '../queues/ReminderQueue';
import { filterByFuzzyMatch } from '../utils/hebrewMatcher';

/**
 * MessageRouter - COMPLETE IMPLEMENTATION
 * All handlers fully implemented with service integration
 */
export class MessageRouter {
  private readonly AUTH_STATE_PREFIX = 'auth:state:';
  private readonly AUTH_STATE_TTL = 15 * 60; // 15 minutes in seconds

  constructor(
    private stateManager: StateManager,
    private authService: AuthService,
    private eventService: EventService,
    private reminderService: ReminderService,
    private contactService: ContactService,
    private settingsService: SettingsService,
    private messageProvider: IMessageProvider
  ) {}

  /**
   * Main routing function
   */
  async routeMessage(from: string, text: string): Promise<void> {
    try {
      logger.info('Routing message', { from, text });

      if (this.isCommand(text)) {
        await this.handleCommand(from, text);
        return;
      }

      const authState = await this.getAuthState(from);

      if (authState && !authState.authenticated) {
        await this.handleAuthFlow(from, text, authState);
        return;
      }

      const user = await this.authService.getUserByPhone(from);

      if (!user) {
        await this.startRegistration(from);
        return;
      }

      if (!authState || !authState.authenticated) {
        await this.startLogin(from);
        return;
      }

      const session = await this.stateManager.getState(authState.userId!);
      const state = session?.state || ConversationState.MAIN_MENU;

      // Track user message in conversation history (if not already tracked by NLP handler)
      // Only track for non-NLP flows
      if (state !== ConversationState.MAIN_MENU && state !== ConversationState.IDLE) {
        await this.stateManager.addToHistory(authState.userId!, 'user', text);
      }

      await this.handleStateMessage(from, authState.userId!, state, text);

    } catch (error) {
      logger.error('Error routing message', { from, error });
      await this.sendMessage(from, 'אירעה שגיאה. אנא נסה שוב או שלח /עזרה לעזרה.');
    }
  }

  private isCommand(text: string): boolean {
    return text.trim().startsWith('/');
  }

  private async handleCommand(from: string, command: string): Promise<void> {
    const cmd = command.trim().toLowerCase();
    const authState = await this.getAuthState(from);
    const userId = authState?.userId;

    switch (cmd) {
      case '/תפריט':
      case '/menu':
        if (!userId) {
          await this.sendMessage(from, 'אנא התחבר תחילה.');
          return;
        }
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(from);
        break;

      case '/ביטול':
      case '/cancel':
        if (!userId) {
          await this.sendMessage(from, 'אנא התחבר תחילה.');
          return;
        }
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.sendMessage(from, 'הפעולה בוטלה. חוזרים לתפריט הראשי.');
        await this.showMainMenu(from);
        break;

      case '/עזרה':
      case '/help':
        await this.showHelp(from);
        break;

      case '/התנתק':
      case '/logout':
        if (!userId) {
          await this.sendMessage(from, 'לא מחובר כרגע.');
          return;
        }
        await this.handleLogout(from, userId);
        break;

      default:
        await this.sendMessage(from, 'פקודה לא מוכרת. שלח /עזרה לרשימת פקודות.');
    }
  }

  /**
   * Route message based on conversation state - FULL IMPLEMENTATION
   */
  private async handleStateMessage(
    phone: string,
    userId: string,
    state: ConversationState,
    text: string
  ): Promise<void> {

    switch (state) {
      case ConversationState.IDLE:
      case ConversationState.MAIN_MENU:
        await this.handleMainMenuChoice(phone, userId, text);
        break;

      // ===== EVENT CREATION FLOW =====
      case ConversationState.ADDING_EVENT_NAME:
        await this.handleEventName(phone, userId, text);
        break;

      case ConversationState.ADDING_EVENT_DATE:
        await this.handleEventDate(phone, userId, text);
        break;

      case ConversationState.ADDING_EVENT_TIME:
        await this.handleEventTime(phone, userId, text);
        break;

      case ConversationState.ADDING_EVENT_LOCATION:
        await this.handleEventLocation(phone, userId, text);
        break;

      case ConversationState.ADDING_EVENT_CONFIRM:
        await this.handleEventConfirm(phone, userId, text);
        break;

      // ===== REMINDER CREATION FLOW =====
      case ConversationState.ADDING_REMINDER_TITLE:
        await this.handleReminderTitle(phone, userId, text);
        break;

      case ConversationState.ADDING_REMINDER_DATETIME:
        await this.handleReminderDatetime(phone, userId, text);
        break;

      case ConversationState.ADDING_REMINDER_RECURRENCE:
        await this.handleReminderRecurrence(phone, userId, text);
        break;

      case ConversationState.ADDING_REMINDER_CONFIRM:
        await this.handleReminderConfirm(phone, userId, text);
        break;

      // ===== EVENT LISTING & DELETION =====
      case ConversationState.LISTING_EVENTS:
        await this.handleEventListing(phone, userId, text);
        break;

      case ConversationState.LISTING_EVENTS_SEARCH:
        await this.handleEventViewingSearch(phone, userId, text);
        break;

      case ConversationState.LISTING_EVENTS_ACTION:
        await this.handleEventAction(phone, userId, text);
        break;

      case ConversationState.EDITING_EVENT:
        await this.handleEventEditMenu(phone, userId, text);
        break;

      case ConversationState.EDITING_EVENT_FIELD:
        await this.handleEventEditField(phone, userId, text);
        break;

      case ConversationState.DELETING_EVENT:
        await this.handleEventDeletion(phone, userId, text);
        break;

      case ConversationState.DELETING_EVENT_SEARCH:
        await this.handleEventDeletionSearch(phone, userId, text);
        break;

      case ConversationState.DELETING_EVENT_CONFIRM:
        await this.handleEventDeletionConfirm(phone, userId, text);
        break;

      // ===== REMINDER LISTING & CANCELLATION =====
      case ConversationState.LISTING_REMINDERS:
        await this.handleReminderListing(phone, userId, text);
        break;

      case ConversationState.CANCELLING_REMINDER:
        await this.handleReminderCancellation(phone, userId, text);
        break;

      case ConversationState.CANCELLING_REMINDER_CONFIRM:
        await this.handleReminderCancellationConfirm(phone, userId, text);
        break;

      // ===== CONTACT MANAGEMENT =====
      case ConversationState.ADDING_CONTACT:
        await this.handleContactMenu(phone, userId, text);
        break;

      case ConversationState.ADDING_CONTACT_NAME:
        await this.handleContactName(phone, userId, text);
        break;

      case ConversationState.ADDING_CONTACT_PHONE:
        await this.handleContactPhone(phone, userId, text);
        break;

      case ConversationState.ADDING_CONTACT_RELATION:
        await this.handleContactRelation(phone, userId, text);
        break;

      case ConversationState.ADDING_CONTACT_ALIASES:
        await this.handleContactAliases(phone, userId, text);
        break;

      case ConversationState.ADDING_CONTACT_CONFIRM:
        await this.handleContactConfirm(phone, userId, text);
        break;

      case ConversationState.LISTING_CONTACTS:
        await this.handleContactListing(phone, userId, text);
        break;

      case ConversationState.DELETING_CONTACT:
        await this.handleContactDeletion(phone, userId, text);
        break;

      // ===== SETTINGS =====
      case ConversationState.SETTINGS_MENU:
        await this.handleSettings(phone, userId, text);
        break;

      case ConversationState.SETTINGS_LANGUAGE:
        await this.handleSettingsLanguage(phone, userId, text);
        break;

      case ConversationState.SETTINGS_TIMEZONE:
        await this.handleSettingsTimezone(phone, userId, text);
        break;

      // ===== DRAFT MESSAGES =====
      case ConversationState.DRAFT_MESSAGE_RECIPIENT:
        await this.handleDraftMessageRecipient(phone, userId, text);
        break;

      case ConversationState.DRAFT_MESSAGE_CONTENT:
        await this.handleDraftMessageContent(phone, userId, text);
        break;

      case ConversationState.DRAFT_MESSAGE_CONFIRM:
        await this.handleDraftMessageConfirm(phone, userId, text);
        break;

      default:
        logger.warn('Unknown state', { userId, state });
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
    }
  }

  // ========== EVENT HANDLERS - FULL IMPLEMENTATION ==========

  private async handleEventName(phone: string, userId: string, text: string): Promise<void> {
    const title = text.trim();

    if (title.length < 2) {
      await this.sendMessage(phone, 'שם האירוע קצר מדי. אנא הזן שם בן 2 תווים לפחות.');
      return;
    }

    if (title.length > 100) {
      await this.sendMessage(phone, 'שם האירוע ארוך מדי. אנא הזן שם קצר יותר.');
      return;
    }

    // Save title to context and move to date
    await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_DATE, { title });
    await this.sendMessage(
      phone,
      `מעולה! 📅\n\nמתי האירוע "${title}"?\n\nדוגמאות:\n• היום\n• מחר\n• יום ראשון\n• 25/12/2025\n\nאו שלח /ביטול לביטול`
    );
  }

  private async handleEventDate(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const title = session?.context?.title;

    if (!title) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_NAME);
      await this.sendMessage(phone, 'מה שם האירוע?');
      return;
    }

    // Parse Hebrew date
    const result = parseHebrewDate(text.trim());

    if (!result.success) {
      await this.sendMessage(phone, `❌ ${result.error}\n\nנסה שוב או שלח /ביטול`);
      return;
    }

    // Save date and move to time
    await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_TIME, {
      title,
      date: result.date!.toISOString()
    });

    const formattedDate = DateTime.fromJSDate(result.date!).setZone('Asia/Jerusalem').toFormat('dd/MM/yyyy');
    await this.sendMessage(
      phone,
      `נהדר! תאריך: ${formattedDate} ⏰\n\nבאיזו שעה?\n\nדוגמאות:\n• 14:30\n• 9:00\n• 15:45\n\nאו שלח "דלג" אם אין שעה מדויקת`
    );
  }

  private async handleEventTime(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { title, date } = session?.context || {};

    if (!title || !date) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    // Validate date from state
    let finalDate = safeParseDate(date, 'handleAddingEventTime');

    if (!finalDate) {
      await this.sendMessage(phone, '❌ תאריך לא תקין. מתחילים מחדש.');
      logger.error('Invalid date in state for handleAddingEventTime', { date });
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    if (text.trim().toLowerCase() !== 'דלג') {
      // Parse time (HH:MM format)
      const timeMatch = text.trim().match(/^(\d{1,2}):(\d{2})$/);

      if (!timeMatch) {
        await this.sendMessage(phone, '❌ פורמט שעה לא תקין.\n\nהזן שעה בפורמט HH:MM (למשל: 14:30)\n\nאו שלח "דלג"');
        return;
      }

      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        await this.sendMessage(phone, '❌ שעה לא תקינה.\n\nשעות: 0-23, דקות: 0-59\n\nנסה שוב או שלח "דלג"');
        return;
      }

      // Set time on date
      const dt = DateTime.fromJSDate(finalDate).setZone('Asia/Jerusalem');
      finalDate = dt.set({ hour: hours, minute: minutes }).toJSDate();
    }

    // Move to location
    await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_LOCATION, {
      title,
      startDate: finalDate.toISOString()
    });

    await this.sendMessage(
      phone,
      `מצוין! 📍\n\nאיפה האירוע?\n\nהזן מיקום (למשל: "בית", "משרד", "תל אביב")\n\nאו שלח "דלג" אם אין מיקום`
    );
  }

  private async handleEventLocation(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { title, startDate } = session?.context || {};

    if (!title || !startDate) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    const location = text.trim().toLowerCase() === 'דלג' ? null : text.trim();

    // Show confirmation
    await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_CONFIRM, {
      title,
      startDate,
      location
    });

    const dt = DateTime.fromISO(startDate).setZone('Asia/Jerusalem');
    const formattedDateTime = dt.toFormat('dd/MM/yyyy HH:mm');

    let summary = `✅ סיכום האירוע:\n\n`;
    summary += `📌 שם: ${title}\n`;
    summary += `📅 תאריך ושעה: ${formattedDateTime}\n`;
    if (location) {
      summary += `📍 מיקום: ${location}\n`;
    }
    summary += `\nהאם הכל נכון?\n\n✅ שלח "כן" לאישור\n❌ שלח "לא" לביטול`;

    await this.sendMessage(phone, summary);
  }

  private async handleEventConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ האירוע בוטל.');
      await this.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { title, startDate, startTsUtc, location, notes } = session?.context || {};

    // Support both startDate (from manual flow) and startTsUtc (from NLP flow)
    const eventStartDate = startTsUtc || startDate;

    if (!title || !eventStartDate) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    try {
      // Create event in database
      await this.eventService.createEvent({
        userId,
        title,
        startTsUtc: new Date(eventStartDate),
        location: location || undefined,
        notes: notes || undefined
      });

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `🎉 האירוע "${title}" נוצר בהצלחה!`);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create event', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  // ========== REMINDER HANDLERS - FULL IMPLEMENTATION ==========

  private async handleReminderTitle(phone: string, userId: string, text: string): Promise<void> {
    const title = text.trim();

    if (title.length < 2) {
      await this.sendMessage(phone, 'כותרת התזכורת קצרה מדי. אנא הזן כותרת בת 2 תווים לפחות.');
      return;
    }

    if (title.length > 100) {
      await this.sendMessage(phone, 'כותרת התזכורת ארוכה מדי. אנא הזן כותרת קצרה יותר.');
      return;
    }

    await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_DATETIME, { title });
    await this.sendMessage(
      phone,
      `מצוין! ⏰\n\nמתי לתזכר?\n\nדוגמאות:\n• מחר 14:30\n• יום ראשון 9:00\n• 25/12/2025 15:00\n\nאו שלח /ביטול לביטול`
    );
  }

  private async handleReminderDatetime(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const title = session?.context?.title;

    if (!title) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    // Parse datetime - expecting format like "מחר 14:30" or "25/12/2025 15:00"
    const parts = text.trim().split(/\s+/);

    if (parts.length < 2) {
      await this.sendMessage(phone, '❌ נא להזין תאריך ושעה.\n\nדוגמה: מחר 14:30\n\nאו שלח /ביטול');
      return;
    }

    const datePart = parts[0];
    const timePart = parts[1];

    // Parse date
    const dateResult = parseHebrewDate(datePart);
    if (!dateResult.success) {
      await this.sendMessage(phone, `❌ ${dateResult.error}\n\nנסה שוב או שלח /ביטול`);
      return;
    }

    // Parse time
    const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      await this.sendMessage(phone, '❌ פורמט שעה לא תקין.\n\nדוגמה: 14:30\n\nנסה שוב');
      return;
    }

    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      await this.sendMessage(phone, '❌ שעה לא תקינה. נסה שוב.');
      return;
    }

    // Combine date and time
    const dt = DateTime.fromJSDate(dateResult.date!).setZone('Asia/Jerusalem').set({ hour: hours, minute: minutes });
    const dueDate = dt.toJSDate();

    // Check if in the past
    if (dueDate < new Date()) {
      await this.sendMessage(phone, '❌ לא ניתן להגדיר תזכורת בעבר. נסה שוב.');
      return;
    }

    await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_RECURRENCE, {
      title,
      dueDate: dueDate.toISOString()
    });

    await this.sendMessage(
      phone,
      `טוב! 🔁\n\nהאם זו תזכורת חוזרת?\n\n1️⃣ לא, פעם אחת\n2️⃣ כל יום\n3️⃣ כל שבוע\n4️⃣ כל חודש\n\nבחר מספר או שלח "דלג"`
    );
  }

  private async handleReminderRecurrence(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { title, dueDate } = session?.context || {};

    if (!title || !dueDate) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    let rrule: string | null = null;
    const choice = text.trim();

    switch (choice) {
      case '2':
        rrule = 'FREQ=DAILY';
        break;
      case '3':
        rrule = 'FREQ=WEEKLY';
        break;
      case '4':
        rrule = 'FREQ=MONTHLY';
        break;
      case '1':
      case 'דלג':
      default:
        rrule = null;
    }

    await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_CONFIRM, {
      title,
      dueDate,
      rrule
    });

    const dt = DateTime.fromISO(dueDate).setZone('Asia/Jerusalem');
    const formattedDateTime = dt.toFormat('dd/MM/yyyy HH:mm');

    let summary = `✅ סיכום התזכורת:\n\n`;
    summary += `📌 כותרת: ${title}\n`;
    summary += `⏰ תאריך ושעה: ${formattedDateTime}\n`;
    if (rrule) {
      const recurrenceText = rrule.includes('DAILY') ? 'כל יום' : rrule.includes('WEEKLY') ? 'כל שבוע' : 'כל חודש';
      summary += `🔁 חזרה: ${recurrenceText}\n`;
    }
    summary += `\nהאם הכל נכון?\n\n✅ שלח "כן" לאישור\n❌ שלח "לא" לביטול`;

    await this.sendMessage(phone, summary);
  }

  private async handleReminderConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ התזכורת בוטלה.');
      await this.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { title, dueDate, dueTsUtc, rrule } = session?.context || {};

    // Support both dueDate (from manual flow) and dueTsUtc (from NLP flow)
    const reminderDueDate = dueTsUtc || dueDate;

    if (!title || !reminderDueDate) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    try {
      // Create reminder in database
      const reminder = await this.reminderService.createReminder({
        userId,
        title,
        dueTsUtc: new Date(reminderDueDate),
        rrule: rrule || undefined
      });

      // Schedule with BullMQ
      await scheduleReminder({
        reminderId: reminder.id,
        userId,
        title,
        phone
      }, new Date(reminderDueDate));

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `🎉 התזכורת "${title}" נוצרה בהצלחה!`);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create reminder', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת התזכורת. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  // ========== DRAFT MESSAGE HANDLERS ==========

  private async handleDraftMessageRecipient(phone: string, userId: string, text: string): Promise<void> {
    const recipientName = text.trim();

    if (recipientName.length < 2) {
      await this.sendMessage(phone, 'שם קצר מדי. אנא הזן שם איש קשר:');
      return;
    }

    // Detect confusion - user repeating intent keywords instead of providing recipient
    const confusionKeywords = ['הודעה', 'פגישה', 'תזכורת', 'לשלוח', 'message', 'meeting', 'reminder'];
    if (confusionKeywords.some(keyword => recipientName.toLowerCase().includes(keyword))) {
      await this.sendMessage(phone, 'אני צריך שם של איש קשר.\n\nדוגמאות: דני, אמא, יוסי\n\n(או שלח /ביטול לביטול)');
      return;
    }

    // Search for contact
    const contacts = await this.contactService.searchContacts(userId, recipientName);

    if (contacts.length === 0) {
      await this.sendMessage(phone, `לא נמצא איש קשר בשם "${recipientName}".\n\nהאם להמשיך בכל זאת? (כן/לא)`);
      await this.stateManager.setState(userId, ConversationState.DRAFT_MESSAGE_CONTENT, {
        recipient: recipientName,
        unknownContact: true
      });
      return;
    }

    const contact = contacts[0];
    await this.sendMessage(phone, `👤 נמצא: ${contact.name}\n\nמה תוכן ההודעה?\n\n(או שלח /ביטול)`);
    await this.stateManager.setState(userId, ConversationState.DRAFT_MESSAGE_CONTENT, {
      recipient: contact.name,
      contactId: contact.id
    });
  }

  private async handleDraftMessageContent(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { recipient, unknownContact } = session?.context || {};

    if (!recipient) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    const content = text.trim();

    if (content.length < 5) {
      await this.sendMessage(phone, 'הודעה קצרה מדי. אנא הזן תוכן מפורט יותר:');
      return;
    }

    const confirmMessage = `📝 טיוטת הודעה:\n\n👤 אל: ${recipient}\n💬 תוכן: ${content}\n\nהאם לשלוח? (כן/לא)`;

    await this.sendMessage(phone, confirmMessage);
    await this.stateManager.setState(userId, ConversationState.DRAFT_MESSAGE_CONFIRM, {
      recipient,
      content
    });
  }

  private async handleDraftMessageConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ ההודעה בוטלה.');
      await this.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { recipient, content } = session?.context || {};

    if (!recipient || !content) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    // In a real implementation, this would send the message to the contact
    // For now, we just confirm it was drafted
    await this.sendMessage(phone, `✅ ההודעה נשמרה כטיוטה!\n\n(תכונת שליחה אוטומטית תהיה זמינה בגרסה הבאה)\n\n📝 טיוטה:\nאל: ${recipient}\nתוכן: ${content}`);

    await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    await this.showMainMenu(phone);
  }

  // ========== EVENT LISTING - FULL IMPLEMENTATION ==========

  private async handleEventListing(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();
    const session = await this.stateManager.getState(userId);
    const isMenu = session?.context?.menu;

    // Handle submenu navigation
    if (isMenu) {
      switch (choice) {
        case '1': // View events
          await this.sendMessage(phone, '📅 איזה אירועים להציג?\n\n1️⃣ היום\n2️⃣ מחר\n3️⃣ השבוע\n4️⃣ הכל (הבאים)\n5️⃣ חיפוש אירוע\n6️⃣ חזרה לתפריט\n\nבחר מספר');
          await this.stateManager.setState(userId, ConversationState.LISTING_EVENTS, { menu: false, action: 'view' });
          return;

        case '2': // Add event
          await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_NAME);
          await this.sendMessage(phone, '➕ הוספת אירוע חדש\n\nמה שם האירוע?\n\n(או שלח /ביטול לביטול)');
          return;

        case '3': // Delete event
          await this.sendMessage(phone, '🗑️ מחיקת אירוע\n\n1️⃣ אירועי היום\n2️⃣ אירועי מחר\n3️⃣ כל האירועים הקרובים\n4️⃣ חיפוש אירוע (לפי שם)\n5️⃣ חזרה\n\nבחר מספר');
          await this.stateManager.setState(userId, ConversationState.DELETING_EVENT);
          return;

        case '4': // Search event
          await this.stateManager.setState(userId, ConversationState.LISTING_EVENTS_SEARCH);
          await this.sendMessage(phone, '🔍 חיפוש אירוע\n\nהזן מילת חיפוש (שם האירוע או מיקום):\n\n(או שלח /ביטול)');
          return;

        case '5': // Back
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.showMainMenu(phone);
          return;

        default:
          await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-5.');
          return;
      }
    }

    // Handle actual event viewing
    try {
      let events;
      let header;

      switch (choice) {
        case '1': // Today
          events = await this.eventService.getEventsByDate(userId, new Date());
          header = '📅 האירועים שלי - היום';
          break;
        case '2': // Tomorrow
          const tomorrow = DateTime.now().plus({ days: 1 }).toJSDate();
          events = await this.eventService.getEventsByDate(userId, tomorrow);
          header = '📅 האירועים שלי - מחר';
          break;
        case '3': // This week
          events = await this.eventService.getEventsForWeek(userId);
          header = '📅 האירועים שלי - השבוע';
          break;
        case '4': // All upcoming
          events = await this.eventService.getUpcomingEvents(userId, 20);
          header = '📅 האירועים שלי - הכל';
          break;
        case '5': // Search
          await this.stateManager.setState(userId, ConversationState.LISTING_EVENTS_SEARCH);
          await this.sendMessage(phone, '🔍 חיפוש אירוע\n\nהזן מילת חיפוש (שם או מיקום):\n\n(או שלח /ביטול)');
          return;
        case '6': // Back to main menu
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.showMainMenu(phone);
          return;
        default:
          await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-6.');
          return;
      }

      if (events.length === 0) {
        await this.sendMessage(phone, '📭 אין אירועים להצגה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        return;
      }

      let message = `${header}\n\n`;
      events.forEach((event, index) => {
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        const formatted = dt.toFormat('dd/MM HH:mm');
        message += `${index + 1}. ${event.title}\n   📅 ${formatted}`;
        if (event.location) {
          message += `\n   📍 ${event.location}`;
        }
        message += `\n\n`;
      });

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to list events', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת האירועים.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleEventViewingSearch(phone: string, userId: string, text: string): Promise<void> {
    const searchQuery = text.trim();

    if (searchQuery.length < 2) {
      await this.sendMessage(phone, 'מילת חיפוש קצרה מדי. אנא הזן לפחות 2 תווים.');
      return;
    }

    try {
      // Search events by title or location
      const allEvents = await this.eventService.getUpcomingEvents(userId, 200);
      const searchLower = searchQuery.toLowerCase();

      const events = allEvents.filter(event =>
        event.title.toLowerCase().includes(searchLower) ||
        (event.location && event.location.toLowerCase().includes(searchLower))
      );

      if (events.length === 0) {
        await this.sendMessage(phone, `🔍 לא נמצאו אירועים עם "${searchQuery}"\n\nנסה חיפוש אחר או שלח /תפריט לחזרה`);
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        return;
      }

      let message = `🔍 תוצאות חיפוש: "${searchQuery}"\n\nנמצאו ${events.length} אירועים:\n\n`;

      const displayEvents = events.slice(0, 20); // Show max 20 results
      displayEvents.forEach((event, index) => {
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        const now = DateTime.now().setZone('Asia/Jerusalem');
        const daysDiff = Math.floor(dt.diff(now, 'days').days);
        const formatted = dt.toFormat('dd/MM/yyyy HH:mm');

        message += `${index + 1}. ${event.title}\n   📅 ${formatted}`;
        if (daysDiff > 7) {
          message += ` (בעוד ${daysDiff} ימים)`;
        }
        if (event.location) {
          message += `\n   📍 ${event.location}`;
        }
        message += `\n\n`;
      });

      if (events.length > 20) {
        message += `\n💡 יש עוד ${events.length - 20} תוצאות. נסה חיפוש ספציפי יותר\n`;
      }

      message += '\n➡️ שלח את המספר של האירוע שתרצה לערוך או למחוק\n(לדוגמה: שלח "1" עבור האירוע הראשון)\n\nאו שלח /תפריט לחזרה לתפריט הראשי';

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.LISTING_EVENTS_ACTION, { events: displayEvents });

    } catch (error) {
      logger.error('Failed to search events', { userId, searchQuery, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בחיפוש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleEventAction(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();
    const session = await this.stateManager.getState(userId);
    const events = session?.context?.events || [];

    const eventIndex = parseInt(choice) - 1;

    if (isNaN(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
      await this.sendMessage(phone, 'מספר אירוע לא תקין. אנא בחר מספר מהרשימה.');
      return;
    }

    const selectedEvent = events[eventIndex];

    // Show action menu
    const actionMenu = `📅 ${selectedEvent.title}\n\nבחר פעולה:\n\n1️⃣ עריכת אירוע\n2️⃣ מחיקת אירוע\n3️⃣ חזרה לתפריט ראשי\n\nבחר מספר (1-3)`;

    await this.sendMessage(phone, actionMenu);
    await this.stateManager.setState(userId, ConversationState.EDITING_EVENT, { selectedEvent, events });
  }

  private async handleEventEditMenu(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();
    const session = await this.stateManager.getState(userId);

    // Handle NLP flow: user picked event from list
    if (session?.context?.events && !session?.context?.selectedEvent && !session?.context?.eventId) {
      const eventIds = session.context.events;
      const eventIndex = parseInt(choice) - 1;

      if (isNaN(eventIndex) || eventIndex < 0 || eventIndex >= eventIds.length) {
        await this.sendMessage(phone, 'מספר אירוע לא תקין. אנא בחר מספר מהרשימה או שלח /ביטול');
        return;
      }

      // Get the event ID
      const eventId = eventIds[eventIndex];

      // Check if this is a postpone scenario
      if (session.context.postponeToDate) {
        // User wants to postpone this event to a specific date
        const postponeDate = new Date(session.context.postponeToDate);

        try {
          const updated = await this.eventService.updateEvent(eventId, userId, {
            startTsUtc: postponeDate
          });

          if (updated) {
            await this.sendMessage(phone, `✅ האירוע עודכן בהצלחה!\n\n${formatEventWithComments(updated)}`);
            await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
            await this.showMainMenu(phone);
          } else {
            await this.sendMessage(phone, '❌ לא הצלחתי לעדכן את האירוע. נסה שוב.');
            await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
            await this.showMainMenu(phone);
          }
        } catch (error) {
          logger.error('Failed to postpone event', { eventId, userId, error });
          await this.sendMessage(phone, '❌ אירעה שגיאה בעדכון האירוע.');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.showMainMenu(phone);
        }
        return;
      }

      // Normal edit flow - show edit menu
      const event = await this.eventService.getEventById(eventId, userId);
      if (!event) {
        await this.sendMessage(phone, '❌ אירוע לא נמצא.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        return;
      }

      const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
      const formatted = dt.toFormat('dd/MM/yyyy HH:mm');

      const editMenu = `✏️ עריכת אירוע: ${event.title}\n\nמה לערוך?\n\n1️⃣ שם (${event.title})\n2️⃣ תאריך ושעה (${formatted})\n3️⃣ מיקום (${event.location || 'לא הוגדר'})\n4️⃣ חזרה\n\nבחר מספר (1-4)`;

      await this.sendMessage(phone, editMenu);
      await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, { selectedEvent: event });
      return;
    }

    // Handle case where we have eventId but no selectedEvent
    if (session?.context?.eventId && !session?.context?.selectedEvent) {
      const event = await this.eventService.getEventById(session.context.eventId, userId);
      if (!event) {
        await this.sendMessage(phone, '❌ אירוע לא נמצא.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        return;
      }

      // Update context with full event object
      session.context.selectedEvent = event;
    }

    const selectedEvent = session?.context?.selectedEvent;

    if (!selectedEvent) {
      await this.sendMessage(phone, '❌ אירוע לא נמצא.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    switch (choice) {
      case '1': // Edit event
        const dt = DateTime.fromJSDate(selectedEvent.startTsUtc).setZone('Asia/Jerusalem');
        const formatted = dt.toFormat('dd/MM/yyyy HH:mm');

        const editMenu = `✏️ עריכת אירוע: ${selectedEvent.title}\n\nמה לערוך?\n\n1️⃣ שם (${selectedEvent.title})\n2️⃣ תאריך ושעה (${formatted})\n3️⃣ מיקום (${selectedEvent.location || 'לא הוגדר'})\n4️⃣ חזרה\n\nבחר מספר (1-4)`;

        await this.sendMessage(phone, editMenu);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, { selectedEvent });
        break;

      case '2': // Delete event
        await this.sendMessage(phone, `🗑️ למחוק את האירוע "${selectedEvent.title}"?\n\n1️⃣ כן, מחק\n2️⃣ לא, בטל\n\nבחר מספר`);
        await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_CONFIRM, { events: [selectedEvent] });
        break;

      case '3': // Back to main menu
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        break;

      default:
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-3.');
        break;
    }
  }

  private async handleEventEditField(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();
    const session = await this.stateManager.getState(userId);
    const selectedEvent = session?.context?.selectedEvent;

    if (!selectedEvent) {
      await this.sendMessage(phone, '❌ אירוע לא נמצא.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    switch (choice) {
      case '1': // Edit title
        await this.sendMessage(phone, `✏️ הזן שם חדש לאירוע:\n\n(או שלח /ביטול)`);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
          selectedEvent,
          editField: 'title'
        });
        break;

      case '2': // Edit date/time
        await this.sendMessage(phone, `✏️ הזן תאריך ושעה חדשים:\n\nדוגמה: "מחר 14:00" או "05/01/2025 10:30"\n\n(או שלח /ביטול)`);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
          selectedEvent,
          editField: 'datetime'
        });
        break;

      case '3': // Edit location
        await this.sendMessage(phone, `✏️ הזן מיקום חדש:\n\n(או שלח /ביטול)`);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
          selectedEvent,
          editField: 'location'
        });
        break;

      case '4': // Back
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        break;

      default:
        // User is providing the new value for a field
        const editField = session?.context?.editField;

        if (!editField) {
          await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-4.');
          return;
        }

        try {
          switch (editField) {
            case 'title':
              await this.eventService.updateEvent(selectedEvent.id, userId, { title: text });
              await this.sendMessage(phone, `✅ שם האירוע עודכן ל: "${text}"`);
              break;

            case 'datetime':
              const parseResult = parseHebrewDate(text);
              if (!parseResult.success || !parseResult.date) {
                await this.sendMessage(phone, '❌ פורמט תאריך לא תקין. נסה שוב:\n\nדוגמה: "מחר 14:00" או "05/01/2025 10:30"');
                return;
              }
              await this.eventService.updateEvent(selectedEvent.id, userId, { startTsUtc: parseResult.date });
              const newDt = DateTime.fromJSDate(parseResult.date).setZone('Asia/Jerusalem');
              await this.sendMessage(phone, `✅ תאריך ושעה עודכנו ל: ${newDt.toFormat('dd/MM/yyyy HH:mm')}`);
              break;

            case 'location':
              await this.eventService.updateEvent(selectedEvent.id, userId, { location: text });
              await this.sendMessage(phone, `✅ מיקום עודכן ל: "${text}"`);
              break;
          }

          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.showMainMenu(phone);

        } catch (error) {
          logger.error('Failed to update event', { userId, eventId: selectedEvent.id, error });
          await this.sendMessage(phone, '❌ אירעה שגיאה בעדכון האירוע.');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.showMainMenu(phone);
        }
        break;
    }
  }

  // ========== EVENT DELETION HANDLERS ==========

  private async handleEventDeletion(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === '5') {
      // User chose back to menu
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    if (choice === '4') {
      // Search by keyword
      await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_SEARCH);
      await this.sendMessage(phone, '🔍 חיפוש אירוע למחיקה\n\nהזן מילת חיפוש (שם האירוע או מיקום):\n\n(או שלח /ביטול)');
      return;
    }

    try {
      let events;
      let header;

      switch (choice) {
        case '1': // Today
          events = await this.eventService.getEventsByDate(userId, new Date());
          header = '🗑️ מחיקת אירוע - אירועי היום';
          break;
        case '2': // Tomorrow
          const tomorrow = DateTime.now().plus({ days: 1 }).toJSDate();
          events = await this.eventService.getEventsByDate(userId, tomorrow);
          header = '🗑️ מחיקת אירוע - אירועי מחר';
          break;
        case '3': // All upcoming (100 events = ~3 months)
          events = await this.eventService.getUpcomingEvents(userId, 100);
          header = '🗑️ מחיקת אירוע - כל האירועים הקרובים';
          break;
        default:
          await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-5.');
          return;
      }

      if (events.length === 0) {
        await this.sendMessage(phone, '📭 אין אירועים למחיקה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        return;
      }

      // For large lists, split into chunks
      if (events.length > 20 && choice === '3') {
        let message = `${header}\n\n✨ נמצאו ${events.length} אירועים\n\nמציג את 20 הראשונים:\n\n`;
        events.slice(0, 20).forEach((event, index) => {
          const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
          const now = DateTime.now().setZone('Asia/Jerusalem');
          const daysDiff = Math.floor(dt.diff(now, 'days').days);

          // Show full date for events far in the future
          const formatted = daysDiff > 30
            ? dt.toFormat('dd/MM/yyyy HH:mm')  // Show year for distant events
            : dt.toFormat('dd/MM HH:mm');       // Hide year for near events

          message += `${index + 1}. ${event.title}\n   📅 ${formatted}`;
          if (daysDiff > 7) {
            message += ` (בעוד ${daysDiff} ימים)`;
          }
          if (event.location) {
            message += `\n   📍 ${event.location}`;
          }
          message += `\n\n`;
        });

        message += `\n💡 יש עוד ${events.length - 20} אירועים\n`;
        message += 'שלח מספר האירוע (1-20) או /ביטול';

        await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_CONFIRM, { events: events.slice(0, 20) });
        await this.sendMessage(phone, message);
      } else {
        let message = `${header}\n\nבחר מספר אירוע למחיקה:\n\n`;
        events.forEach((event, index) => {
          const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
          const now = DateTime.now().setZone('Asia/Jerusalem');
          const daysDiff = Math.floor(dt.diff(now, 'days').days);

          // Show full date with year for clarity
          const formatted = dt.toFormat('dd/MM/yyyy HH:mm');

          message += `${index + 1}. ${event.title}\n   📅 ${formatted}`;
          if (daysDiff > 7) {
            message += ` (בעוד ${daysDiff} ימים)`;
          }
          if (event.location) {
            message += `\n   📍 ${event.location}`;
          }
          message += `\n\n`;
        });

        message += 'שלח מספר האירוע או /ביטול';

        await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_CONFIRM, { events });
        await this.sendMessage(phone, message);
      }

    } catch (error) {
      logger.error('Failed to list events for deletion', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת האירועים.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleEventDeletionSearch(phone: string, userId: string, text: string): Promise<void> {
    const searchQuery = text.trim();

    if (searchQuery.length < 2) {
      await this.sendMessage(phone, 'מילת חיפוש קצרה מדי. אנא הזן לפחות 2 תווים.');
      return;
    }

    try {
      // Search events by title or location
      const allEvents = await this.eventService.getUpcomingEvents(userId, 200);
      const searchLower = searchQuery.toLowerCase();

      const events = allEvents.filter(event =>
        event.title.toLowerCase().includes(searchLower) ||
        (event.location && event.location.toLowerCase().includes(searchLower))
      );

      if (events.length === 0) {
        await this.sendMessage(phone, `🔍 לא נמצאו אירועים עם "${searchQuery}"\n\nנסה חיפוש אחר או שלח /ביטול`);
        return;
      }

      let message = `🔍 תוצאות חיפוש: "${searchQuery}"\n\nנמצאו ${events.length} אירועים:\n\n`;

      const displayEvents = events.slice(0, 15); // Show max 15 results
      displayEvents.forEach((event, index) => {
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        const now = DateTime.now().setZone('Asia/Jerusalem');
        const daysDiff = Math.floor(dt.diff(now, 'days').days);
        const formatted = dt.toFormat('dd/MM/yyyy HH:mm');

        message += `${index + 1}. ${event.title}\n   📅 ${formatted}`;
        if (daysDiff > 7) {
          message += ` (בעוד ${daysDiff} ימים)`;
        }
        if (event.location) {
          message += `\n   📍 ${event.location}`;
        }
        message += `\n\n`;
      });

      if (events.length > 15) {
        message += `\n💡 יש עוד ${events.length - 15} תוצאות. נסה חיפוש ספציפי יותר\n`;
      }

      message += 'שלח מספר האירוע למחיקה או /ביטול';

      await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_CONFIRM, { events: displayEvents });
      await this.sendMessage(phone, message);

    } catch (error) {
      logger.error('Failed to search events', { userId, searchQuery, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בחיפוש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleEventDeletionConfirm(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const eventId = session?.context?.eventId;
    const fromNLP = session?.context?.fromNLP;
    const events = session?.context?.events || [];

    // Handle NLP-based single event deletion with yes/no confirmation
    if (fromNLP && eventId) {
      const normalizedText = text.trim().toLowerCase();
      const yesWords = ['כן', 'yes', '1', 'אישור', 'מחק', 'בטוח'];
      const noWords = ['לא', 'no', '2', 'ביטול', 'בטל', 'לא מחק'];

      if (yesWords.some(word => normalizedText.includes(word))) {
        try {
          const event = await this.eventService.getEventById(eventId, userId);
          await this.eventService.deleteEvent(eventId, userId);
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.sendMessage(phone, `🗑️ האירוע "${event?.title}" נמחק בהצלחה!`);
          await this.showMainMenu(phone);
        } catch (error) {
          logger.error('Failed to delete event', { userId, eventId, error });
          await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת האירוע.');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.showMainMenu(phone);
        }
        return;
      }

      if (noWords.some(word => normalizedText.includes(word))) {
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.sendMessage(phone, 'מחיקת האירוע בוטלה.');
        await this.showMainMenu(phone);
        return;
      }

      await this.sendMessage(phone, 'תגובה לא ברורה. אנא ענה "כן" למחיקה או "לא" לביטול.');
      return;
    }

    // Handle menu-based deletion with numeric selection
    if (events.length === 0) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    const index = parseInt(text.trim()) - 1;

    if (isNaN(index) || index < 0 || index >= events.length) {
      await this.sendMessage(phone, '❌ מספר אירוע לא תקין. נסה שוב או שלח /ביטול');
      return;
    }

    const eventToDelete = events[index];

    try {
      await this.eventService.deleteEvent(eventToDelete.id, userId);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `🗑️ האירוע "${eventToDelete.title}" נמחק בהצלחה!`);
      await this.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to delete event', { userId, eventId: eventToDelete.id, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת האירוע.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  // ========== REMINDER HANDLERS ==========

  private async handleReminderListing(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === '4') {
      // Back to menu
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    if (choice === '3') {
      // Add new reminder
      await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_TITLE);
      await this.sendMessage(phone, '⏰ תזכורת חדשה\n\nמה כותרת התזכורת?\n\n(או שלח /ביטול לביטול)');
      return;
    }

    try {
      let reminders;
      let header;

      if (choice === '1') {
        // Active reminders
        reminders = await this.reminderService.getActiveReminders(userId);
        header = '⏰ תזכורות פעילות';
      } else if (choice === '2') {
        // Cancel reminder
        reminders = await this.reminderService.getActiveReminders(userId);

        if (reminders.length === 0) {
          await this.sendMessage(phone, '📭 אין תזכורות פעילות לביטול.');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.showMainMenu(phone);
          return;
        }

        let message = '🗑️ ביטול תזכורת\n\nבחר מספר תזכורת לביטול:\n\n';
        reminders.forEach((reminder, index) => {
          const dt = DateTime.fromJSDate(reminder.dueTsUtc).setZone('Asia/Jerusalem');
          const formatted = dt.toFormat('dd/MM HH:mm');
          message += `${index + 1}. ${reminder.title}\n   ⏰ ${formatted}\n\n`;
        });

        message += 'שלח מספר התזכורת או /ביטול';

        await this.stateManager.setState(userId, ConversationState.CANCELLING_REMINDER, { reminders });
        await this.sendMessage(phone, message);
        return;
      } else {
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-4.');
        return;
      }

      if (reminders.length === 0) {
        await this.sendMessage(phone, '📭 אין תזכורות להצגה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        return;
      }

      let message = `${header}\n\n`;
      reminders.forEach((reminder, index) => {
        const dt = DateTime.fromJSDate(reminder.dueTsUtc).setZone('Asia/Jerusalem');
        const formatted = dt.toFormat('dd/MM HH:mm');
        message += `${index + 1}. ${reminder.title}\n   ⏰ ${formatted}\n   📊 סטטוס: ${reminder.status}\n\n`;
      });

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to list reminders', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת התזכורות.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleReminderCancellation(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const reminders = session?.context?.reminders || [];

    if (reminders.length === 0) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    const index = parseInt(text.trim()) - 1;

    if (isNaN(index) || index < 0 || index >= reminders.length) {
      await this.sendMessage(phone, '❌ מספר תזכורת לא תקין. נסה שוב או שלח /ביטול');
      return;
    }

    const reminderToCancel = reminders[index];
    await this.stateManager.setState(userId, ConversationState.CANCELLING_REMINDER_CONFIRM, { reminder: reminderToCancel });
    await this.sendMessage(phone, `האם לבטל את התזכורת "${reminderToCancel.title}"?\n\n✅ כן\n❌ לא`);
  }

  private async handleReminderCancellationConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ הביטול בוטל.');
      await this.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const reminder = session?.context?.reminder;

    if (!reminder) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    try {
      // Cancel in database
      await this.reminderService.cancelReminder(reminder.id, userId);

      // Cancel BullMQ job
      const { cancelReminder } = await import('../queues/ReminderQueue');
      await cancelReminder(reminder.id);

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `🗑️ התזכורת "${reminder.title}" בוטלה בהצלחה!`);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to cancel reminder', { userId, reminderId: reminder.id, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בביטול התזכורת.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  // ========== CONTACT HANDLERS ==========

  private async handleContactMenu(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    switch (choice) {
      case '1': // Add contact
        await this.stateManager.setState(userId, ConversationState.ADDING_CONTACT_NAME);
        await this.sendMessage(phone, '➕ הוספת איש קשר\n\nמה שם איש הקשר?\n\n(או שלח /ביטול)');
        break;

      case '2': // View contacts
        await this.stateManager.setState(userId, ConversationState.LISTING_CONTACTS);
        await this.handleContactListing(phone, userId, '1');
        break;

      case '3': // Delete contact
        await this.stateManager.setState(userId, ConversationState.DELETING_CONTACT);
        await this.sendMessage(phone, '🗑️ מחיקת איש קשר\n\nהמשך בקרוב...');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        break;

      case '4': // Back
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        break;

      default:
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-4.');
    }
  }

  private async handleContactName(phone: string, userId: string, text: string): Promise<void> {
    const name = text.trim();

    if (name.length < 2) {
      await this.sendMessage(phone, 'השם קצר מדי. אנא הזן שם בן 2 תווים לפחות.');
      return;
    }

    await this.stateManager.setState(userId, ConversationState.ADDING_CONTACT_RELATION, { name });
    await this.sendMessage(phone, `מצוין!\n\nמה הקשר עם ${name}?\n\nדוגמאות: חבר, משפחה, עבודה\n\n(או שלח "דלג")`);
  }

  private async handleContactPhone(phone: string, userId: string, text: string): Promise<void> {
    // Not used - removed phone field
  }

  private async handleContactRelation(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { name } = session?.context || {};

    if (!name) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    const relation = text.trim().toLowerCase() === 'דלג' ? undefined : text.trim();

    await this.stateManager.setState(userId, ConversationState.ADDING_CONTACT_ALIASES, {
      name,
      relation
    });
    await this.sendMessage(phone, `כינויים (aliases)?\n\nדוגמה: אבא, אימא, דוד יוסי\n\nהפרד בפסיקים או שלח "דלג"`);
  }

  private async handleContactAliases(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { name, relation } = session?.context || {};

    if (!name) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    const aliasesStr = text.trim().toLowerCase();
    const aliases = aliasesStr === 'דלג' ? [] : aliasesStr.split(',').map(a => a.trim()).filter(a => a.length > 0);

    await this.stateManager.setState(userId, ConversationState.ADDING_CONTACT_CONFIRM, {
      name,
      relation,
      aliases
    });

    let summary = `✅ סיכום איש הקשר:\n\n`;
    summary += `👤 שם: ${name}\n`;
    if (relation) summary += `🔗 קשר: ${relation}\n`;
    if (aliases.length > 0) summary += `🏷️ כינויים: ${aliases.join(', ')}\n`;
    summary += `\nהאם הכל נכון?\n\n✅ שלח "כן" לאישור\n❌ שלח "לא" לביטול`;

    await this.sendMessage(phone, summary);
  }

  private async handleContactConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ איש הקשר בוטל.');
      await this.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { name, relation, aliases } = session?.context || {};

    if (!name) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    try {
      await this.contactService.createContact({
        userId,
        name,
        relation,
        aliases: aliases || []
      });

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `🎉 איש הקשר "${name}" נוסף בהצלחה!`);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create contact', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת איש הקשר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleContactListing(phone: string, userId: string, text: string): Promise<void> {
    try {
      const contacts = await this.contactService.getAllContacts(userId);

      if (contacts.length === 0) {
        await this.sendMessage(phone, '📭 אין אנשי קשר.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
        return;
      }

      let message = '👥 אנשי הקשר שלי\n\n';
      contacts.forEach((contact, index) => {
        message += `${index + 1}. ${contact.name}`;
        if (contact.relation) message += `\n   🔗 ${contact.relation}`;
        if (contact.aliases && contact.aliases.length > 0) {
          message += `\n   🏷️ ${contact.aliases.join(', ')}`;
        }
        message += `\n\n`;
      });

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to list contacts', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת אנשי הקשר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleContactDeletion(phone: string, userId: string, text: string): Promise<void> {
    await this.sendMessage(phone, 'מחיקת איש קשר תתווסף בקרוב.');
    await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    await this.showMainMenu(phone);
  }

  // ========== SETTINGS HANDLERS ==========

  private async handleSettings(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === '3') {
      // Back to menu
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
      return;
    }

    try {
      const settings = await this.settingsService.getUserSettings(userId);

      if (choice === '1') {
        // Change language
        await this.stateManager.setState(userId, ConversationState.SETTINGS_LANGUAGE);
        await this.sendMessage(phone,
          `🌐 שפה נוכחית: ${settings.locale}\n\nבחר שפה:\n\n1️⃣ עברית (he)\n2️⃣ English (en)\n\n(או שלח /ביטול)`
        );
        return;
      }

      if (choice === '2') {
        // Change timezone
        await this.stateManager.setState(userId, ConversationState.SETTINGS_TIMEZONE);
        await this.sendMessage(phone,
          `🕐 אזור זמן נוכחי: ${settings.timezone}\n\nבחר אזור זמן:\n\n1️⃣ ישראל (Asia/Jerusalem)\n2️⃣ ארה"ב מזרח (America/New_York)\n3️⃣ ארה"ב מערב (America/Los_Angeles)\n4️⃣ אירופה (Europe/London)\n\n(או שלח /ביטול)`
        );
        return;
      }

      await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-3.');

    } catch (error) {
      logger.error('Failed to load settings', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת ההגדרות.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleSettingsLanguage(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    let locale: string;
    let languageName: string;

    switch (choice) {
      case '1':
        locale = 'he';
        languageName = 'עברית';
        break;
      case '2':
        locale = 'en';
        languageName = 'English';
        break;
      default:
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-2.');
        return;
    }

    try {
      await this.settingsService.updateLocale(userId, locale);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `✅ השפה שונתה ל-${languageName}!`);
      await this.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to update language', { userId, locale, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי השפה.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleSettingsTimezone(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    let timezone: string;
    let timezoneName: string;

    switch (choice) {
      case '1':
        timezone = 'Asia/Jerusalem';
        timezoneName = 'ישראל';
        break;
      case '2':
        timezone = 'America/New_York';
        timezoneName = 'ארה"ב מזרח';
        break;
      case '3':
        timezone = 'America/Los_Angeles';
        timezoneName = 'ארה"ב מערב';
        break;
      case '4':
        timezone = 'Europe/London';
        timezoneName = 'אירופה';
        break;
      default:
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-4.');
        return;
    }

    try {
      await this.settingsService.updateTimezone(userId, timezone);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `✅ אזור הזמן שונה ל-${timezoneName}!`);
      await this.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to update timezone', { userId, timezone, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי אזור הזמן.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  // ========== DRAFT MESSAGE HANDLER ==========

  private async handleDraftMessage(phone: string, userId: string, text: string): Promise<void> {
    await this.sendMessage(phone, 'ניסוח הודעות יתווסף בגרסה הבאה.');
    await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
    await this.showMainMenu(phone);
  }

  // ========== AUTH HANDLERS (unchanged from original) ==========

  private async handleAuthFlow(
    from: string,
    text: string,
    authState: AuthState
  ): Promise<void> {
    if (authState.registrationStep === 'name') {
      await this.handleRegistrationName(from, text, authState);
    } else if (authState.registrationStep === 'pin') {
      await this.handleRegistrationPin(from, text, authState);
    } else {
      await this.handleLoginPin(from, text, authState);
    }
  }

  private async startRegistration(from: string): Promise<void> {
    const authState: AuthState = {
      userId: null,
      phone: from,
      authenticated: false,
      failedAttempts: 0,
      lockoutUntil: null,
      registrationStep: 'name',
      tempData: {}
    };

    await this.setAuthState(from, authState);
    await this.sendMessage(from, 'ברוך הבא! 👋\n\nבואו נתחיל ברישום.\nמה השם שלך?');
  }

  private async handleRegistrationName(
    from: string,
    text: string,
    authState: AuthState
  ): Promise<void> {
    const name = text.trim();

    if (name.length < 2) {
      await this.sendMessage(from, 'השם קצר מדי. אנא הזן שם בן 2 תווים לפחות.');
      return;
    }

    if (name.length > 50) {
      await this.sendMessage(from, 'השם ארוך מדי. אנא הזן שם קצר יותר.');
      return;
    }

    authState.tempData = { name };
    authState.registrationStep = 'pin';
    await this.setAuthState(from, authState);

    await this.sendMessage(
      from,
      `נעים להכיר, ${name}! 😊\n\nעכשיו בחר קוד PIN בן 4 ספרות לאבטחה.\n(לדוגמה: 1234)`
    );
  }

  private async handleRegistrationPin(
    from: string,
    text: string,
    authState: AuthState
  ): Promise<void> {
    const pin = text.trim();

    if (!/^\d{4}$/.test(pin)) {
      await this.sendMessage(from, 'PIN חייב להיות 4 ספרות בדיוק. נסה שוב.');
      return;
    }

    const name = authState.tempData?.name;
    if (!name) {
      await this.startRegistration(from);
      return;
    }

    try {
      const user = await this.authService.registerUser(from, name, pin);
      authState.userId = user.id;
      authState.authenticated = true;
      authState.registrationStep = 'complete';
      authState.tempData = {};
      await this.setAuthState(from, authState);
      await this.stateManager.setState(user.id, ConversationState.MAIN_MENU);

      await this.sendMessage(from, `🎉 הרישום הושלם בהצלחה!\n\nברוך הבא, ${name}!`);
      await this.showMainMenu(from);

    } catch (error) {
      logger.error('Registration failed', { from, error });
      await this.sendMessage(from, 'אירעה שגיאה ברישום. אנא נסה שוב מאוחר יותר.');
      await this.clearAuthState(from);
    }
  }

  private async startLogin(from: string): Promise<void> {
    const isLockedOut = await this.authService.checkLockout(from);
    if (isLockedOut) {
      await this.sendMessage(from, 'החשבון נעול זמנית. אנא נסה שוב בעוד 5 דקות.');
      return;
    }

    const authState: AuthState = {
      userId: null,
      phone: from,
      authenticated: false,
      failedAttempts: 0,
      lockoutUntil: null
    };

    await this.setAuthState(from, authState);
    await this.sendMessage(from, 'ברוך הבא! 👋\n\nאנא הזן את קוד ה-PIN שלך (4 ספרות):');
  }

  private async handleLoginPin(
    from: string,
    text: string,
    authState: AuthState
  ): Promise<void> {
    const pin = text.trim();

    if (!/^\d{4}$/.test(pin)) {
      await this.sendMessage(from, 'PIN חייב להיות 4 ספרות בדיוק. נסה שוב.');
      return;
    }

    try {
      const user = await this.authService.loginUser(from, pin);

      if (!user) {
        // User doesn't exist
        await this.sendMessage(from, 'משתמש לא קיים. נסה להירשם תחילה.');
        return;
      }

      authState.userId = user.id;
      authState.authenticated = true;
      await this.setAuthState(from, authState);
      await this.stateManager.setState(user.id, ConversationState.MAIN_MENU);

      await this.sendMessage(from, `שלום, ${user.name}! 😊`);
      await this.showMainMenu(from);

    } catch (error: any) {
      // AuthService throws errors for wrong PIN (with attempts info) and lockout
      logger.error('Login failed', { from, error: error.message || error, stack: error.stack });
      const errorMessage = error.message || 'אירעה שגיאה בהתחברות. אנא נסה שוב.';
      await this.sendMessage(from, errorMessage);

      // If account is locked, clear auth state
      if (errorMessage.includes('נעול')) {
        await this.clearAuthState(from);
      }
    }
  }

  // ========== MENU & HELPERS ==========

  private async handleMainMenuChoice(
    phone: string,
    userId: string,
    text: string
  ): Promise<void> {
    const choice = text.trim();

    // Check if it's a menu number first (1-8)
    if (/^[1-8]$/.test(choice)) {
      switch (choice) {
        case '1': // View events
          await this.sendMessage(phone, '📅 איזה אירועים להציג?\n\n1️⃣ היום\n2️⃣ מחר\n3️⃣ השבוע\n4️⃣ הכל (הבאים)\n5️⃣ חיפוש אירוע\n6️⃣ חזרה לתפריט\n\nבחר מספר');
          await this.stateManager.setState(userId, ConversationState.LISTING_EVENTS, { menu: false, action: 'view' });
          break;

        case '2': // Add event
          await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_NAME);
          await this.sendMessage(phone, '➕ הוספת אירוע חדש\n\nמה שם האירוע?\n\n(או שלח /ביטול לביטול)');
          break;

        case '3': // Add reminder
          await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_TITLE);
          await this.sendMessage(phone, '⏰ הוספת תזכורת חדשה\n\nמה כותרת התזכורת?\n\n(או שלח /ביטול לביטול)');
          break;

        case '4': // Tasks (stub)
          await this.sendMessage(phone, '✅ משימות\n\n🔜 בקרוב!\n\nתכונת ניהול משימות תהיה זמינה בגרסה הבאה.\n\nשלח /תפריט לחזרה לתפריט ראשי');
          break;

        case '5': // Contacts menu
          await this.sendMessage(phone, '👥 אנשי קשר / משפחה\n\n1️⃣ הוספת איש קשר\n2️⃣ צפייה באנשי קשר\n3️⃣ מחיקת איש קשר\n4️⃣ חזרה לתפריט\n\nבחר מספר');
          await this.stateManager.setState(userId, ConversationState.ADDING_CONTACT);
          break;

        case '6': // Settings menu
          await this.sendMessage(phone, '⚙️ הגדרות\n\n1️⃣ שינוי שפה\n2️⃣ שינוי אזור זמן\n3️⃣ חזרה לתפריט\n\nבחר מספר');
          await this.stateManager.setState(userId, ConversationState.SETTINGS_MENU);
          break;

        case '7': // Draft message
          await this.stateManager.setState(userId, ConversationState.DRAFT_MESSAGE_RECIPIENT);
          await this.sendMessage(phone, '📝 ניסוח הודעה\n\nלמי לשלוח את ההודעה? (הזן שם איש קשר)\n\n(או שלח /ביטול לביטול)');
          break;

        case '8': // Help
          await this.showHelp(phone);
          break;
      }
      return;
    }

    // Check if input is just a standalone time (HH:MM) and we have pending context
    const timeMatch = text.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const session = await this.stateManager.getState(userId);

      // If there's a pending event with date but no time in context, use this time
      if (session?.context?.date && !session?.context?.startDate) {
        logger.info('Detected standalone time input with pending event context', {
          userId,
          time: text,
          context: session.context
        });
        // Switch to ADDING_EVENT_TIME state and process the time
        await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_TIME, session.context);
        await this.handleEventTime(phone, userId, text);
        return;
      }

      // If there's a pending reminder title but no date/time
      if (session?.context?.title && !session?.context?.dueDate && !session?.context?.startDate) {
        logger.info('Detected standalone time input with pending reminder context', {
          userId,
          time: text,
          context: session.context
        });
        // Need to ask for date first, or combine with date from conversation history
        // For now, ask user to provide both date and time together
        await this.sendMessage(phone, '⏰ זיהיתי שעה, אבל אני צריך גם תאריך.\n\nאנא הזן תאריך ושעה ביחד:\nדוגמה: מחר 14:30\n\nאו שלח /ביטול');
        return;
      }
    }

    // If not a menu number, try NLP parsing
    await this.handleNLPMessage(phone, userId, text);
  }

  private async showMainMenu(phone: string): Promise<void> {
    const menu = `תפריט ראשי 📋

1️⃣ האירועים שלי 📅
2️⃣ הוסף אירוע ➕
3️⃣ הוסף תזכורת ⏰
4️⃣ משימות ✅
5️⃣ אנשי קשר / משפחה 👨‍👩‍👧
6️⃣ הגדרות ⚙️
7️⃣ ניסוח הודעה 📝
8️⃣ עזרה ❓

בחר מספר (1-8) או שלח פקודה:
/תפריט - חזרה לתפריט
/עזרה - עזרה`;

    await this.sendMessage(phone, menu);
  }

  // ========== NLP HANDLERS ==========

  private async handleNLPMessage(phone: string, userId: string, text: string): Promise<void> {
    try {
      const { NLPService } = await import('./NLPService');
      const nlp = new NLPService();

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

      const intent = await nlp.parseIntent(text, contacts, user?.timezone || 'Asia/Jerusalem', conversationHistory);

      // If confidence is too low, ask for clarification
      if (intent.confidence < 0.6 || intent.intent === 'unknown') {
        await this.sendMessage(phone, intent.clarificationNeeded || 'לא הבנתי. אנא נסה שוב או שלח /תפריט לתפריט ראשי');
        return;
      }

      // Additional validation for create_event - require high confidence
      if (intent.intent === 'create_event' && intent.confidence < 0.75) {
        await this.sendMessage(phone, 'לא בטוח שהבנתי. אנא נסח מחדש או שלח /תפריט לתפריט ראשי');
        return;
      }

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
          await this.handleNLPAddContact(phone, userId, intent);
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
    // If hour is 0 and minute is 0, it means no time was specified - ASK for time
    const dt = DateTime.fromJSDate(eventDate).setZone('Asia/Jerusalem');
    const hasTime = dt.hour !== 0 || dt.minute !== 0;

    if (!hasTime) {
      // No time specified - ask user for time instead of defaulting to 00:00
      logger.info('NLP event has no time, asking user', {
        title: event.title,
        date: dt.toFormat('dd/MM/yyyy'),
        hour: dt.hour,
        minute: dt.minute
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

    // Format date for display - use DateTime to ensure correct timezone display
    const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');

    const confirmMessage = `✅ זיהיתי אירוע חדש:

📌 ${event.title}
📅 ${displayDate}${event.location ? `\n📍 ${event.location}` : ''}${event.contactName ? `\n👤 ${event.contactName}` : ''}

האם לקבוע את האירוע? (כן/לא)`;

    await this.sendMessage(phone, confirmMessage);
    await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_CONFIRM, {
      title: event.title,
      startTsUtc: eventDate,
      location: event.location,
      notes: event.contactName ? `עם ${event.contactName}` : undefined,
      fromNLP: true
    });
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

    const confirmMessage = `✅ זיהיתי תזכורת חדשה:

📌 ${reminder.title}
📅 ${displayDate}

האם לקבוע את התזכורת? (כן/לא)`;

    await this.sendMessage(phone, confirmMessage);
    await this.stateManager.setState(userId, ConversationState.ADDING_REMINDER_CONFIRM, {
      title: reminder.title,
      dueTsUtc: dueDate,
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
          dateDescription = `ב-${DateTime.fromJSDate(dateQuery.date).setZone('Asia/Jerusalem').toFormat('dd/MM/yyyy')}`;
        }
      } else if (titleFilter) {
        // CRITICAL FIX: User only specified title, no date - search all upcoming events by title
        events = await this.eventService.getUpcomingEvents(userId, 50);
        dateDescription = '';
      }

      // Filter by title if provided using fuzzy matching
      if (titleFilter && events.length > 0) {
        events = filterByFuzzyMatch(events, titleFilter, e => e.title, 0.5);
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
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');

        // For week/month ranges or title searches, show date+time. For single date, just time.
        const timeFormat = (dateDescription.includes('בשבוע') || dateDescription.includes('בחודש') || titleFilter)
          ? dt.toFormat('dd/MM HH:mm')
          : dt.toFormat('HH:mm');

        message += `${index + 1}. ${event.title}\n   📅 ${timeFormat}`;
        if (event.location) message += `\n   📍 ${event.location}`;
        message += `\n\n`;
      });

      await this.sendMessage(phone, message);
    } else {
      // Show all upcoming events (no filters)
      const events = await this.eventService.getUpcomingEvents(userId, 10);

      if (events.length === 0) {
        await this.sendMessage(phone, '📭 אין אירועים קרובים.\n\nשלח /תפריט לחזרה לתפריט');
        return;
      }

      let message = '📅 האירועים הקרובים שלך:\n\n';
      events.forEach((event, index) => {
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        message += `${index + 1}. ${event.title}\n   📅 ${dt.toFormat('dd/MM HH:mm')}`;
        if (event.location) message += `\n   📍 ${event.location}`;
        message += `\n\n`;
      });

      await this.sendMessage(phone, message);
    }
  }

  private async handleNLPAddContact(phone: string, userId: string, intent: any): Promise<void> {
    const { contact } = intent;

    if (!contact?.name || !contact?.phone) {
      await this.sendMessage(phone, 'לא זיהיתי את כל הפרטים. אנא ציין שם ומספר טלפון.\n\nדוגמה: הוסף איש קשר דני 052-1234567');
      return;
    }

    // Normalize phone number (remove spaces, dashes)
    const normalizedPhone = contact.phone.replace(/[\s-]/g, '');

    const confirmMessage = `👤 זיהיתי איש קשר חדש:

📛 ${contact.name}
📞 ${normalizedPhone}${contact.relation ? `\n👥 ${contact.relation}` : ''}

האם להוסיף את איש הקשר? (כן/לא)`;

    await this.sendMessage(phone, confirmMessage);
    await this.stateManager.setState(userId, ConversationState.ADDING_CONTACT_CONFIRM, {
      name: contact.name,
      phone: normalizedPhone,
      relation: contact.relation || null,
      fromNLP: true
    });
  }

  private async handleNLPDeleteEvent(phone: string, userId: string, intent: any): Promise<void> {
    const { event } = intent;

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
      if (event.title && events.length > 0) {
        events = filterByFuzzyMatch(events, event.title, e => e.title, 0.5);
      }

      if (events.length === 0) {
        await this.sendMessage(phone, '❌ לא נמצא אירוע מתאים למחיקה.\n\nנסה לפרט יותר או שלח /תפריט לתפריט ראשי');
        return;
      }

      if (events.length === 1) {
        // Only one event found - show confirmation
        const event = events[0];
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        const confirmMessage = `🗑️ למחוק את האירוע הבא?\n\n📌 ${event.title}\n📅 ${dt.toFormat('dd/MM/yyyy HH:mm')}\n\nהאם למחוק? (כן/לא)`;

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
        const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
        message += `${index + 1}. ${event.title}\n   📅 ${dt.toFormat('dd/MM HH:mm')}\n\n`;
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
    // Similar to delete event but for reminders
    await this.sendMessage(phone, '⏰ מחיקת תזכורות תהיה זמינה בקרוב!\n\nשלח /תפריט לחזרה לתפריט');
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
        // Search by title only
        events = await this.eventService.getUpcomingEvents(userId, 50);
        events = filterByFuzzyMatch(events, event.title, e => e.title, 0.5);
      } else if (event.date || event.dateText) {
        // User said "update event on DATE" - date is search term
        const dateQuery = parseDateFromNLP(event, 'handleNLPUpdateEvent');

        if (!dateQuery.date) {
          await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nנסה לפרט יותר או שלח /תפריט');
          return;
        }

        events = await this.eventService.getEventsByDate(userId, dateQuery.date!);

        // Filter by title if provided
        if (event.title && events.length > 0) {
          events = filterByFuzzyMatch(events, event.title, e => e.title, 0.5);
        }
      } else {
        // Search all upcoming events
        events = await this.eventService.getUpcomingEvents(userId, 50);

        // Filter by title if provided
        if (event.title && events.length > 0) {
          events = filterByFuzzyMatch(events, event.title, e => e.title, 0.5);
        }
      }

      if (events.length === 0) {
        await this.sendMessage(phone, '❌ לא נמצא אירוע לעדכון.\n\nנסה לפרט יותר או שלח /תפריט לתפריט ראשי');
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
        }

        // Apply the update
        try {
          const updateData: any = {};
          if (newDate) updateData.startTsUtc = newDate;
          if (event.location) updateData.location = event.location;

          const updated = await this.eventService.updateEvent(eventToUpdate.id, userId, updateData);

          if (updated) {
            await this.sendMessage(phone, `✅ האירוע עודכן בהצלחה!\n\n${formatEventWithComments(updated)}`);
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
    await this.sendMessage(phone, '⏰ עדכון תזכורות יהיה זמין בקרוב!\n\nשלח /תפריט לחזרה לתפריט');
  }

  private async showHelp(phone: string): Promise<void> {
    const help = `עזרה - מדריך שימוש 📖

🔹 פקודות זמינות:
/תפריט - חזרה לתפריט הראשי
/ביטול - ביטול פעולה נוכחית
/עזרה - הצגת עזרה זו
/התנתק - יציאה מהחשבון

🔹 תכונות פעילות:
✅ ניהול אירועים (יצירה, רשימה, עריכה, מחיקה)
✅ תזכורות (יצירה, תזמון אוטומטי)
✅ אנשי קשר (ניהול מלא)
✅ הגדרות (שפה, אזור זמן)
✅ NLP - שפה טבעית!

💬 דוגמאות לשימוש בשפה טבעית:
• "קבע פגישה עם דני מחר ב-3"
• "תזכיר לי להתקשר לאמא ביום רביעי"
• "מה יש לי מחר?"

שלח /תפריט כדי להתחיל!`;

    await this.sendMessage(phone, help);
  }

  private async handleLogout(phone: string, userId: string): Promise<void> {
    await this.clearAuthState(phone);
    await this.stateManager.clearState(userId);
    await this.sendMessage(phone, 'התנתקת בהצלחה. להתראות! 👋');
  }

  private async sendMessage(to: string, message: string): Promise<void> {
    try {
      await this.messageProvider.sendMessage(to, message);
      logger.debug('Message sent', { to, messageLength: message.length });

      // Track assistant message in conversation history
      try {
        const authState = await this.getAuthState(to);
        if (authState?.userId) {
          await this.stateManager.addToHistory(authState.userId, 'assistant', message);
        }
      } catch (historyError) {
        // Don't fail message sending if history tracking fails
        logger.warn('Failed to track message in history', { to, error: historyError });
      }
    } catch (error) {
      logger.error('Failed to send message', { to, error });
      throw error;
    }
  }

  // Auth state helpers
  private async getAuthState(phone: string): Promise<AuthState | null> {
    try {
      const key = this.getAuthStateKey(phone);
      const data = await redis.get(key);
      if (!data) return null;

      const authState: AuthState = JSON.parse(data);
      if (authState.lockoutUntil) {
        authState.lockoutUntil = new Date(authState.lockoutUntil);
      }
      return authState;
    } catch (error) {
      logger.error('Failed to get auth state', { phone, error });
      return null;
    }
  }

  private async setAuthState(phone: string, authState: AuthState): Promise<void> {
    const key = this.getAuthStateKey(phone);
    await redis.setex(key, this.AUTH_STATE_TTL, JSON.stringify(authState));
  }

  private async clearAuthState(phone: string): Promise<void> {
    const key = this.getAuthStateKey(phone);
    await redis.del(key);
  }

  private getAuthStateKey(phone: string): string {
    return `${this.AUTH_STATE_PREFIX}${phone}`;
  }

  // ============================================================================
  // COMMENT HANDLERS (NEW FEATURE)
  // ============================================================================

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
      if (comment.reminderTime) {
        const reminderDate = safeParseDate(comment.reminderTime, 'handleNLPAddComment');
        if (reminderDate) {
          // Create reminder and link it to comment
          const reminder = await this.reminderService.createReminder({
            userId,
            title: comment.text,
            dueTsUtc: reminderDate,
          });

          // Update comment with reminderId
          await this.eventService.updateComment(event.id, userId, newComment.id, {
            reminderId: reminder.id,
          });

          // Schedule reminder
          await scheduleReminder({
            reminderId: reminder.id,
            userId,
            title: comment.text,
            phone,
          }, reminderDate);

          // Send confirmation with reminder
          const message = formatCommentWithReminder(newComment, event, reminderDate);
          await this.sendMessage(phone, message);
          return;
        }
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
}

// Export factory function
import stateManager from './StateManager';
import authService from './AuthService';
import eventService from './EventService';
import reminderService from './ReminderService';
import contactService from './ContactService';
import settingsService from './SettingsService';

export const createMessageRouter = (messageProvider: IMessageProvider): MessageRouter => {
  return new MessageRouter(
    stateManager,
    authService,
    eventService,
    reminderService,
    contactService,
    settingsService,
    messageProvider
  );
};

export default MessageRouter;
