import { StateManager } from '../services/StateManager.js';
import { EventService } from '../services/EventService.js';
import { ReminderService } from '../services/ReminderService.js';
import { TaskService } from '../services/TaskService.js';
import { SettingsService } from '../services/SettingsService.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';
import { ConversationState, MenuDisplayMode } from '../types/index.js';
import { redis } from '../config/redis.js';
import { parseHebrewDate } from '../utils/hebrewDateParser.js';
import { safeParseDate } from '../utils/dateValidator.js';
import { DateTime } from 'luxon';
import { scheduleReminder } from '../queues/ReminderQueue.js';
import { CommandRouter } from './CommandRouter.js';
import logger from '../utils/logger.js';
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
  formatEventWithComments,
  formatEventInList
} from '../utils/commentFormatter.js';

/**
 * Fuzzy match for yes/no confirmations with typo tolerance
 * Handles common typos like "כו" → "כן", "ka" → "לא"
 */
function fuzzyMatchYesNo(text: string): 'yes' | 'no' | null {
  const normalized = text.trim().toLowerCase();

  // Exact matches
  const yesExact = ['כן', 'yes', 'y', '1', 'אישור', 'מחק', 'בטוח'];
  const noExact = ['לא', 'no', 'n', '2', 'ביטול', 'בטל', 'לא מחק'];

  if (yesExact.some(word => normalized === word || normalized.includes(word))) {
    return 'yes';
  }
  if (noExact.some(word => normalized === word || normalized.includes(word))) {
    return 'no';
  }

  // Typo tolerance - Levenshtein distance <= 1 for short words
  // "כו" is 1 char away from "כן", "ka" is 1 char from "לא"
  if (normalized.length >= 2 && normalized.length <= 3) {
    // Check Hebrew "כן" variants
    if (levenshteinDistance(normalized, 'כן') <= 1) return 'yes';
    if (levenshteinDistance(normalized, 'yes') <= 1) return 'yes';
    // Check Hebrew "לא" variants
    if (levenshteinDistance(normalized, 'לא') <= 1) return 'no';
    if (levenshteinDistance(normalized, 'no') <= 1) return 'no';
  }

  return null;
}

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Detect if user is expressing frustration or confusion
 */
function detectFrustration(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const frustrationKeywords = [
    'לא מבין',
    'לא מבינה',
    'לא הבנתי',
    'עזרה',
    'תעזור',
    'מה זה',
    'מה אני צריך',
    'לא יודע',
    'לא יודעת',
    'תסביר',
    'מבולבל',
    'מתאבד',  // extreme frustration
    'אני מת',
    'די',
    'לא רוצה',
    'זה מבאס'
  ];

  return frustrationKeywords.some(keyword => normalized.includes(keyword));
}

/**
 * Get or increment failure counter for current conversation state
 */
async function getFailureCount(userId: string, state: ConversationState): Promise<number> {
  const key = `failure_count:${userId}:${state}`;
  const count = await redis.get(key);
  const currentCount = count ? parseInt(count) : 0;
  const newCount = currentCount + 1;

  // Set with 5 minute expiry
  await redis.setex(key, 300, newCount.toString());

  return newCount;
}

/**
 * Reset failure counter
 */
async function resetFailureCount(userId: string, state: ConversationState): Promise<void> {
  const key = `failure_count:${userId}:${state}`;
  await redis.del(key);
}

/**
 * StateRouter - Handles all conversation state routing
 * Extracted from MessageRouter to separate state machine logic
 */
export class StateRouter {
  constructor(
    private stateManager: StateManager,
    private eventService: EventService,
    private reminderService: ReminderService,
    private taskService: TaskService,
    private settingsService: SettingsService,
    private commandRouter: CommandRouter,
    private sendMessage: (to: string, message: string) => Promise<string>,
    private reactToLastMessage: (userId: string, emoji: string) => Promise<void>,
    private storeMessageEventMapping: (messageId: string, eventIds: string | string[]) => Promise<void>,
    private showRecurringUpdateOptions: (phone: string, userId: string, reminder: any, newDateTime: Date) => Promise<void>,
    private confirmReminderUpdate: (phone: string, userId: string, reminder: any, newDateTime: Date, isRecurring: boolean) => Promise<void>
  ) {}

  /**
   * Main state message handler - routes to appropriate state handler
   */
  async handleStateMessage(
    phone: string,
    userId: string,
    state: ConversationState,
    text: string
  ): Promise<void> {

    switch (state) {
      case ConversationState.IDLE:
      case ConversationState.MAIN_MENU:
        // This is handled by MessageRouter.handleMainMenuChoice
        throw new Error('MAIN_MENU state should be handled by MessageRouter.handleMainMenuChoice');

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

      case ConversationState.ADDING_EVENT_CONFLICT_CONFIRM:
        await this.handleEventConflictConfirm(phone, userId, text);
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

      case ConversationState.DELETING_ALL_EVENTS_CONFIRM:
        await this.handleBulkEventDeletionConfirm(phone, userId, text);
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

      case ConversationState.DELETING_REMINDER_SELECT:
        await this.handleDeletingReminderSelect(phone, userId, text);
        break;

      case ConversationState.DELETING_REMINDER_CONFIRM:
        await this.handleDeletingReminderConfirm(phone, userId, text);
        break;

      case ConversationState.UPDATING_REMINDER_SELECT:
        await this.handleUpdatingReminderSelect(phone, userId, text);
        break;

      case ConversationState.UPDATING_REMINDER_OCCURRENCE:
        await this.handleUpdatingReminderOccurrence(phone, userId, text);
        break;

      case ConversationState.UPDATING_REMINDER_CONFIRM:
        await this.handleUpdatingReminderConfirm(phone, userId, text);
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

      case ConversationState.SETTINGS_MENU_DISPLAY:
        await this.handleSettingsMenuDisplay(phone, userId, text);
        break;

      // ===== TASKS =====
      case ConversationState.TASKS_MENU:
        await this.handleTasksMenu(phone, userId, text);
        break;

      case ConversationState.ADDING_TASK_TITLE:
        await this.handleAddingTaskTitle(phone, userId, text);
        break;

      case ConversationState.ADDING_TASK_DESCRIPTION:
        await this.handleAddingTaskDescription(phone, userId, text);
        break;

      case ConversationState.ADDING_TASK_PRIORITY:
        await this.handleAddingTaskPriority(phone, userId, text);
        break;

      case ConversationState.ADDING_TASK_DUE_DATE:
        await this.handleAddingTaskDueDate(phone, userId, text);
        break;

      case ConversationState.ADDING_TASK_CONFIRM:
        await this.handleAddingTaskConfirm(phone, userId, text);
        break;

      case ConversationState.LISTING_TASKS:
        await this.handleListingTasks(phone, userId, text);
        break;

      case ConversationState.MARKING_TASK_DONE:
        await this.handleMarkingTaskDone(phone, userId, text);
        break;

      case ConversationState.DELETING_TASK:
        await this.handleDeletingTask(phone, userId, text);
        break;

      case ConversationState.DELETING_TASK_CONFIRM:
        await this.handleDeletingTaskConfirm(phone, userId, text);
        break;

      default:
        logger.warn('Unknown state', { userId, state });
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
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
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    // Validate date from state
    let finalDate = safeParseDate(date, 'handleAddingEventTime');

    if (!finalDate) {
      await this.sendMessage(phone, '❌ תאריך לא תקין. מתחילים מחדש.');
      logger.error('Invalid date in state for handleAddingEventTime', { date });
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (text.trim().toLowerCase() !== 'דלג') {
      let normalizedText = text.trim();

      // ✅ FIX: State-aware parsing - "שעה 18" → "18:00"
      // When user is in ADDING_EVENT_TIME state and says "שעה 18" or just "18", it's clearly about time
      const hourOnlyMatch = normalizedText.match(/^(?:שעה\s*)?(\d{1,2})$/);
      if (hourOnlyMatch) {
        const hour = hourOnlyMatch[1];
        normalizedText = `${hour}:00`;
        logger.info('State-aware hour parsing', {
          original: text,
          normalized: normalizedText,
          state: 'ADDING_EVENT_TIME'
        });
      }

      // Parse time (HH:MM format)
      const timeMatch = normalizedText.match(/^(\d{1,2}):(\d{2})$/);

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

    // Check for conflicts BEFORE creating event
    const conflicts = await this.eventService.checkOverlappingEvents(userId, finalDate);

    if (conflicts.length > 0) {
      // Show conflict warning
      const confirmDt = DateTime.fromJSDate(finalDate).setZone('Asia/Jerusalem');
      let warningMsg = `⚠️ התנגשות זמנים!\n\n`;
      warningMsg += `האירוע החדש:\n📌 ${title}\n🕐 ${confirmDt.toFormat('dd/MM/yyyy HH:mm')}\n\n`;
      warningMsg += `מתנגש עם:\n`;

      conflicts.forEach((conflict, index) => {
        const conflictDt = DateTime.fromJSDate(conflict.startTsUtc).setZone('Asia/Jerusalem');
        warningMsg += `${index + 1}. ${conflict.title} - ${conflictDt.toFormat('dd/MM HH:mm')}\n`;
      });

      warningMsg += `\nהאם ליצור את האירוע בכל זאת? (כן/לא)`;

      await this.sendMessage(phone, warningMsg);
      await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_CONFLICT_CONFIRM, {
        title,
        startTsUtc: finalDate.toISOString()
      });
      return;
    }

    // No conflicts - create event immediately
    try {
      await this.eventService.createEvent({
        userId,
        title,
        startTsUtc: finalDate,
        location: undefined, // Optional - can be added via edit
        notes: undefined
      });

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);

      // React to user's original message with thumbs up
      await this.reactToLastMessage(userId, '👍');

      // Send success message
      const confirmDt = DateTime.fromJSDate(finalDate).setZone('Asia/Jerusalem');
      await this.sendMessage(phone, `✅ ${title} - ${confirmDt.toFormat('dd/MM/yyyy HH:mm')}`);
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create event', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleEventConflictConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = fuzzyMatchYesNo(text);

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ האירוע בוטל.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { title, startTsUtc } = session?.context || {};

    if (!title || !startTsUtc) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      await this.eventService.createEvent({
        userId,
        title,
        startTsUtc: new Date(startTsUtc),
        location: undefined,
        notes: undefined
      });

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);

      // React to user's original message with thumbs up
      await this.reactToLastMessage(userId, '👍');

      // Send success message
      const confirmDt = DateTime.fromJSDate(new Date(startTsUtc)).setZone('Asia/Jerusalem');
      await this.sendMessage(phone, `✅ ${title} - ${confirmDt.toFormat('dd/MM/yyyy HH:mm')}\n\n(נוצר למרות התנגשות)`);
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create event after conflict confirmation', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleEventLocation(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { title, startDate } = session?.context || {};

    if (!title || !startDate) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
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
    const choice = fuzzyMatchYesNo(text);

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ האירוע בוטל.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'yes') {
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
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      // Create event in database
      const event = await this.eventService.createEvent({
        userId,
        title,
        startTsUtc: new Date(eventStartDate),
        location: location || undefined
      });

      // Add notes as a comment if provided (notes from NLP context is a string)
      if (notes && typeof notes === 'string') {
        await this.eventService.addComment(event.id, userId, notes, { priority: 'normal' });
      }

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);

      // React with checkmark instead of sending text message
      await this.reactToLastMessage(userId, '✅');

      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create event', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

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
      await this.commandRouter.showMainMenu(phone);
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
      await this.commandRouter.showMainMenu(phone);
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
    const choice = fuzzyMatchYesNo(text);

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ התזכורת בוטלה.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    // React with checkmark for confirmation
    await this.reactToLastMessage(userId, '✅');

    const session = await this.stateManager.getState(userId);
    const { title, dueDate, dueTsUtc, rrule, notes } = session?.context || {};

    // Support both dueDate (from manual flow) and dueTsUtc (from NLP flow)
    const reminderDueDate = dueTsUtc || dueDate;

    if (!title || !reminderDueDate) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      // Create reminder in database
      const reminder = await this.reminderService.createReminder({
        userId,
        title,
        dueTsUtc: new Date(reminderDueDate),
        rrule: rrule || undefined,
        notes: notes || undefined
      });

      // Schedule with BullMQ
      await scheduleReminder({
        reminderId: reminder.id,
        userId,
        title,
        phone
      }, new Date(reminderDueDate));

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create reminder', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת התזכורת. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleTasksMenu(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    switch (choice) {
      case '1': // List active tasks
        const tasks = await this.taskService.getAllTasks(userId, false);
        if (tasks.length === 0) {
          await this.sendMessage(phone, '✅ אין משימות פעילות!\n\nשלח /תפריט לחזרה לתפריט ראשי');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        } else {
          const { renderTaskList } = await import('../utils/taskFormatter.js');
          await this.sendMessage(phone, renderTaskList(tasks, 'פעילות'));
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        }
        break;

      case '2': // Add new task
        await this.stateManager.setState(userId, ConversationState.ADDING_TASK_TITLE);
        await this.sendMessage(phone, '➕ הוספת משימה חדשה\n\nמה כותרת המשימה?\n\n(או שלח /ביטול לביטול)');
        break;

      case '3': // Mark task as done
        const activeTasks = await this.taskService.getAllTasks(userId, false);
        if (activeTasks.length === 0) {
          await this.sendMessage(phone, 'אין משימות פעילות לסימון.\n\nשלח /תפריט לחזרה לתפריט ראשי');
        } else {
          const { renderTaskList } = await import('../utils/taskFormatter.js');
          await this.sendMessage(phone, renderTaskList(activeTasks, 'סמן כבוצעה') + '\n\nהזן מספר משימה:');
          await this.stateManager.setState(userId, ConversationState.MARKING_TASK_DONE, { tasks: activeTasks });
        }
        break;

      case '4': // Delete task
        const allTasks = await this.taskService.getAllTasks(userId, false);
        if (allTasks.length === 0) {
          await this.sendMessage(phone, 'אין משימות למחיקה.\n\nשלח /תפריט לחזרה לתפריט ראשי');
        } else {
          const { renderTaskList } = await import('../utils/taskFormatter.js');
          await this.sendMessage(phone, renderTaskList(allTasks, 'מחיקה') + '\n\nהזן מספר משימה למחיקה:');
          await this.stateManager.setState(userId, ConversationState.DELETING_TASK, { tasks: allTasks });
        }
        break;

      case '5': // Statistics
        const stats = await this.taskService.getTaskStats(userId);
        const statsMsg = `📊 סטטיסטיקות משימות\n\n` +
          `סה"כ: ${stats.total}\n` +
          `⏳ ממתינות: ${stats.pending}\n` +
          `🔄 בביצוע: ${stats.inProgress}\n` +
          `✅ הושלמו: ${stats.completed}\n` +
          `⚠️ באיחור: ${stats.overdue}\n\n` +
          `שלח /תפריט לחזרה לתפריט ראשי`;
        await this.sendMessage(phone, statsMsg);
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        break;

      case '6': // Back to main menu
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
        break;

      default:
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-6.');
    }
  }

  private async handleAddingTaskTitle(phone: string, userId: string, text: string): Promise<void> {
    const title = text.trim();

    if (title.length < 2) {
      await this.sendMessage(phone, 'כותרת המשימה קצרה מדי. אנא הזן כותרת בת 2 תווים לפחות.');
      return;
    }

    if (title.length > 200) {
      await this.sendMessage(phone, 'כותרת המשימה ארוכה מדי. אנא הזן כותרת קצרה יותר.');
      return;
    }

    await this.stateManager.setState(userId, ConversationState.ADDING_TASK_DESCRIPTION, { title });
    await this.sendMessage(phone, `מעולה! ✅\n\nהאם תרצה להוסיף תיאור למשימה "${title}"?\n\n(כתוב תיאור או שלח "דלג")`);
  }

  private async handleAddingTaskDescription(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { title } = session?.context || {};

    if (!title) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    const description = text.trim().toLowerCase() === 'דלג' ? null : text.trim();

    const { renderPriorityMenu } = await import('../utils/menuRenderer.js');
    await this.sendMessage(phone, renderPriorityMenu());
    await this.stateManager.setState(userId, ConversationState.ADDING_TASK_PRIORITY, {
      title,
      description
    });
  }

  private async handleAddingTaskPriority(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { title, description } = session?.context || {};

    if (!title) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    let priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal';
    const choice = text.trim();

    switch (choice) {
      case '1':
        priority = 'urgent';
        break;
      case '2':
        priority = 'high';
        break;
      case '3':
      case '5':
        priority = 'normal';
        break;
      case '4':
        priority = 'low';
        break;
      default:
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-5.');
        return;
    }

    await this.sendMessage(phone, 'האם יש תאריך יעד למשימה?\n\nדוגמאות:\n• היום\n• מחר\n• 25/12/2025\n• דלג (ללא תאריך)\n\n(או שלח /ביטול לביטול)');
    await this.stateManager.setState(userId, ConversationState.ADDING_TASK_DUE_DATE, {
      title,
      description,
      priority
    });
  }

  private async handleAddingTaskDueDate(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { title, description, priority } = session?.context || {};

    if (!title) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    let dueDate: Date | null = null;

    if (text.trim().toLowerCase() !== 'דלג') {
      const result = parseHebrewDate(text.trim());
      if (!result.success) {
        await this.sendMessage(phone, `❌ ${result.error}\n\nנסה שוב או שלח "דלג"`);
        return;
      }
      dueDate = result.date || null;
    }

    const priorityEmojis: Record<string, string> = { urgent: '🔴', high: '🟠', normal: '🟡', low: '🟢' };
    const priorityEmoji = priorityEmojis[priority as string] || '🟡';
    const dueDateStr = dueDate ? DateTime.fromJSDate(dueDate).setZone('Asia/Jerusalem').toFormat('dd/MM/yyyy') : 'ללא תאריך יעד';

    const confirmMsg = `✅ סיכום משימה:\n\n` +
      `📌 כותרת: ${title}\n` +
      `📝 תיאור: ${description || 'ללא תיאור'}\n` +
      `${priorityEmoji} עדיפות: ${priority}\n` +
      `📅 תאריך יעד: ${dueDateStr}\n\n` +
      `האם ליצור את המשימה? (כן/לא)`;

    await this.sendMessage(phone, confirmMsg);
    await this.stateManager.setState(userId, ConversationState.ADDING_TASK_CONFIRM, {
      title,
      description,
      priority,
      dueDate: dueDate?.toISOString()
    });
  }

  private async handleAddingTaskConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ המשימה בוטלה.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { title, description, priority, dueDate } = session?.context || {};

    if (!title) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      const task = await this.taskService.createTask({
        userId,
        title,
        description,
        priority,
        dueTsUtc: dueDate ? new Date(dueDate) : undefined
      });

      await this.sendMessage(phone, `✅ המשימה נוצרה בהצלחה!\n\n📌 ${task.title}`);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to create task', { error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת המשימה. אנא נסה שוב.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleListingTasks(phone: string, userId: string, text: string): Promise<void> {
    // This is handled in the tasks menu
    await this.handleTasksMenu(phone, userId, '1');
  }

  private async handleMarkingTaskDone(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { tasks } = session?.context || {};

    if (!tasks || !Array.isArray(tasks)) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    const taskNumber = parseInt(text.trim());

    if (isNaN(taskNumber) || taskNumber < 1 || taskNumber > tasks.length) {
      await this.sendMessage(phone, `אנא הזן מספר בין 1 ל-${tasks.length}`);
      return;
    }

    const task = tasks[taskNumber - 1];

    try {
      await this.taskService.markTaskAsCompleted(task.id, userId);
      await this.sendMessage(phone, `✅ המשימה "${task.title}" סומנה כבוצעה!`);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to mark task as done', { error });
      await this.sendMessage(phone, '❌ אירעה שגיאה. אנא נסה שוב.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleDeletingTask(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { tasks } = session?.context || {};

    if (!tasks || !Array.isArray(tasks)) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    const taskNumber = parseInt(text.trim());

    if (isNaN(taskNumber) || taskNumber < 1 || taskNumber > tasks.length) {
      await this.sendMessage(phone, `אנא הזן מספר בין 1 ל-${tasks.length}`);
      return;
    }

    const task = tasks[taskNumber - 1];

    await this.sendMessage(phone, `⚠️ האם אתה בטוח שברצונך למחוק את המשימה:\n\n"${task.title}"\n\n(כן/לא)`);
    await this.stateManager.setState(userId, ConversationState.DELETING_TASK_CONFIRM, { taskId: task.id, taskTitle: task.title });
  }

  private async handleDeletingTaskConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ המחיקה בוטלה.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { taskId, taskTitle } = session?.context || {};

    if (!taskId) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      const deleted = await this.taskService.deleteTask(taskId, userId);
      if (deleted) {
        await this.sendMessage(phone, `✅ המשימה "${taskTitle}" נמחקה בהצלחה!`);
      } else {
        await this.sendMessage(phone, '❌ המשימה לא נמצאה.');
      }
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to delete task', { error });
      await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת המשימה. אנא נסה שוב.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

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
          await this.commandRouter.showMainMenu(phone);
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
          await this.commandRouter.showMainMenu(phone);
          return;
        default:
          await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר מספר בין 1-6.');
          return;
      }

      if (events.length === 0) {
        await this.sendMessage(phone, '📭 אין אירועים להצגה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
        return;
      }

      let message = `${header}\n\n`;
      events.forEach((event, index) => {
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', false, events) + `\n\n`;
      });

      await this.sendMessage(phone, message);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to list events', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת האירועים.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
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
        await this.commandRouter.showMainMenu(phone);
        return;
      }

      let message = `🔍 תוצאות חיפוש: "${searchQuery}"\n\nנמצאו ${events.length} אירועים:\n\n`;

      const displayEvents = events.slice(0, 20); // Show max 20 results
      displayEvents.forEach((event, index) => {
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', true, events) + `\n\n`;
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
      await this.commandRouter.showMainMenu(phone);
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
            const sentMessageId = await this.sendMessage(phone, `✅ האירוע עודכן בהצלחה!\n\n${formatEventWithComments(updated)}`);
            // Store message-event mapping for reply-to quick actions
            await this.storeMessageEventMapping(sentMessageId, updated.id);
            await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
            await this.commandRouter.showMainMenu(phone);
          } else {
            await this.sendMessage(phone, '❌ לא הצלחתי לעדכן את האירוע. נסה שוב.');
            await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
            await this.commandRouter.showMainMenu(phone);
          }
        } catch (error) {
          logger.error('Failed to postpone event', { eventId, userId, error });
          await this.sendMessage(phone, '❌ אירעה שגיאה בעדכון האירוע.');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.commandRouter.showMainMenu(phone);
        }
        return;
      }

      // Normal edit flow - show edit menu
      const event = await this.eventService.getEventById(eventId, userId);
      if (!event) {
        await this.sendMessage(phone, '❌ אירוע לא נמצא.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
        return;
      }

      const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
      const formatted = dt.toFormat('dd/MM/yyyy HH:mm');

      const editMenu = `✏️ עריכת אירוע: ${event.title}\n\nמה לערוך?\n\n1️⃣ שם (${event.title})\n2️⃣ תאריך ושעה (${formatted})\n3️⃣ מיקום (${event.location || 'לא הוגדר'})\n4️⃣ חזרה\n\nבחר מספר (1-4)\nאו שלח /ביטול לחזור`;

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
        await this.commandRouter.showMainMenu(phone);
        return;
      }

      // Update context with full event object
      session.context.selectedEvent = event;
    }

    const selectedEvent = session?.context?.selectedEvent;

    if (!selectedEvent) {
      await this.sendMessage(phone, '❌ אירוע לא נמצא.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    switch (choice) {
      case '1': { // Edit event
        const dt = DateTime.fromJSDate(selectedEvent.startTsUtc).setZone('Asia/Jerusalem');
        const formatted = dt.toFormat('dd/MM/yyyy HH:mm');

        const editMenu = `✏️ עריכת אירוע: ${selectedEvent.title}\n\nמה לערוך?\n\n1️⃣ שם (${selectedEvent.title})\n2️⃣ תאריך ושעה (${formatted})\n3️⃣ מיקום (${selectedEvent.location || 'לא הוגדר'})\n4️⃣ חזרה\n\nבחר מספר (1-4)\nאו שלח /ביטול לחזור`;

        await this.sendMessage(phone, editMenu);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, { selectedEvent });
        break;
      }

      case '2': { // Delete event
        const dt = DateTime.fromJSDate(selectedEvent.startTsUtc).setZone('Asia/Jerusalem');
        const formattedDateTime = dt.toFormat('dd/MM/yyyy HH:mm');
        await this.sendMessage(phone, `❌ למחוק את האירוע הבא? 🗑️\n\n📌 ${selectedEvent.title}\n📅 ${formattedDateTime}\n\nהאם למחוק? (כן/לא)`);
        await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_CONFIRM, {
          eventId: selectedEvent.id,
          events: [selectedEvent]
        });
        break;
      }

      case '3': // Back to main menu
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
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
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    // Check for cancel command first - immediate escape
    if (choice === '/ביטול' || choice.toLowerCase() === 'ביטול' || choice.toLowerCase() === 'cancel') {
      await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
      await this.sendMessage(phone, 'ℹ️ פעולת העריכה בוטלה.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    // Detect frustration and provide help
    if (detectFrustration(text)) {
      await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
      const dt = DateTime.fromJSDate(selectedEvent.startTsUtc).setZone('Asia/Jerusalem');
      const formatted = dt.toFormat('dd/MM/yyyy HH:mm');
      await this.sendMessage(phone,
        `💡 אני כאן לעזור!\n\nכדי לערוך את האירוע, בחר מספר:\n\n` +
        `1️⃣ לשנות את השם (${selectedEvent.title})\n` +
        `2️⃣ לשנות תאריך ושעה (${formatted})\n` +
        `3️⃣ לשנות מיקום (${selectedEvent.location || 'לא הוגדר'})\n` +
        `4️⃣ לחזור לתפריט\n\n` +
        `או שלח /ביטול לביטול`
      );
      return;
    }

    switch (choice) {
      case '1': // Edit title
        await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
        await this.sendMessage(phone, `✏️ הזן שם חדש לאירוע:\n\n(או שלח /ביטול)`);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
          selectedEvent,
          editField: 'title'
        });
        break;

      case '2': // Edit date/time
        await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
        await this.sendMessage(phone, `✏️ הזן תאריך ושעה חדשים:\n\nדוגמה: "מחר 14:00" או "05/01/2025 10:30"\n\n(או שלח /ביטול)`);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
          selectedEvent,
          editField: 'datetime'
        });
        break;

      case '3': // Edit location
        await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
        await this.sendMessage(phone, `✏️ הזן מיקום חדש:\n\n(או שלח /ביטול)`);
        await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
          selectedEvent,
          editField: 'location'
        });
        break;

      case '4': // Back
        await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
        break;

      default:
        // User is providing the new value for a field
        const editField = session?.context?.editField;

        if (!editField) {
          // Not in edit mode - try NLP fallback for natural language
          const normalized = text.toLowerCase();

          // Try to detect intent from natural language
          if (normalized.includes('שם') || normalized.includes('כותרת') || normalized.includes('תואר')) {
            await this.sendMessage(phone, `✏️ הזן שם חדש לאירוע:\n\n(או שלח /ביטול)`);
            await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
              selectedEvent,
              editField: 'title'
            });
            return;
          }

          if (normalized.includes('תאריך') || normalized.includes('שעה') || normalized.includes('זמן')) {
            await this.sendMessage(phone, `✏️ הזן תאריך ושעה חדשים:\n\nדוגמה: "מחר 14:00" או "05/01/2025 10:30"\n\n(או שלח /ביטול)`);
            await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
              selectedEvent,
              editField: 'datetime'
            });
            return;
          }

          if (normalized.includes('מיקום') || normalized.includes('מקום') || normalized.includes('כתובת')) {
            await this.sendMessage(phone, `✏️ הזן מיקום חדש:\n\n(או שלח /ביטול)`);
            await this.stateManager.setState(userId, ConversationState.EDITING_EVENT_FIELD, {
              selectedEvent,
              editField: 'location'
            });
            return;
          }

          // No match - count failure and show helpful error
          const failureCount = await getFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);

          if (failureCount >= 3) {
            // Auto-exit after 3 failures
            await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
            await this.sendMessage(phone,
              '😕 נראה שיש בעיה בהבנה.\n\n' +
              'חוזר לתפריט הראשי...'
            );
            await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
            await this.commandRouter.showMainMenu(phone);
            return;
          }

          // Show improved error with menu
          const dt = DateTime.fromJSDate(selectedEvent.startTsUtc).setZone('Asia/Jerusalem');
          const formatted = dt.toFormat('dd/MM/yyyy HH:mm');
          await this.sendMessage(phone,
            `❌ בחירה לא תקינה.\n\n` +
            `אנא בחר מספר:\n\n` +
            `1️⃣ שם (${selectedEvent.title})\n` +
            `2️⃣ תאריך ושעה (${formatted})\n` +
            `3️⃣ מיקום (${selectedEvent.location || 'לא הוגדר'})\n` +
            `4️⃣ חזרה\n\n` +
            `או שלח /ביטול`
          );
          return;
        }

        try {
          switch (editField) {
            case 'title':
              await this.eventService.updateEvent(selectedEvent.id, userId, { title: text });
              await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
              await this.sendMessage(phone, `✅ שם האירוע עודכן ל: "${text}"`);
              break;

            case 'datetime':
              const parseResult = parseHebrewDate(text);
              if (!parseResult.success || !parseResult.date) {
                await this.sendMessage(phone, '❌ פורמט תאריך לא תקין. נסה שוב:\n\nדוגמה: "מחר 14:00" או "05/01/2025 10:30"\n\n(או שלח /ביטול)');
                return;
              }
              await this.eventService.updateEvent(selectedEvent.id, userId, { startTsUtc: parseResult.date });
              await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
              const newDt = DateTime.fromJSDate(parseResult.date).setZone('Asia/Jerusalem');
              await this.sendMessage(phone, `✅ תאריך ושעה עודכנו ל: ${newDt.toFormat('dd/MM/yyyy HH:mm')}`);
              break;

            case 'location':
              await this.eventService.updateEvent(selectedEvent.id, userId, { location: text });
              await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
              await this.sendMessage(phone, `✅ מיקום עודכן ל: "${text}"`);
              break;
          }

          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.commandRouter.showMainMenu(phone);

        } catch (error) {
          logger.error('Failed to update event', { userId, eventId: selectedEvent.id, error });
          await this.sendMessage(phone, '❌ אירעה שגיאה בעדכון האירוע.');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.commandRouter.showMainMenu(phone);
        }
        break;
    }
  }

  private async handleEventDeletion(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === '5') {
      // User chose back to menu
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
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
        await this.commandRouter.showMainMenu(phone);
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
          message += formatEventInList(event, index + 1, 'Asia/Jerusalem', true, events) + `\n\n`;
        });

        message += 'שלח מספר האירוע או /ביטול';

        await this.stateManager.setState(userId, ConversationState.DELETING_EVENT_CONFIRM, { events });
        await this.sendMessage(phone, message);
      }

    } catch (error) {
      logger.error('Failed to list events for deletion', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת האירועים.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
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
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', true, events) + `\n\n`;
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
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleEventDeletionConfirm(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const eventId = session?.context?.eventId;
    const fromNLP = session?.context?.fromNLP;
    const events = session?.context?.events || [];

    // Handle NLP-based single event deletion with yes/no confirmation
    if (fromNLP && eventId) {
      const choice = fuzzyMatchYesNo(text);

      if (choice === 'yes') {
        try {
          const event = await this.eventService.getEventById(eventId, userId);
          if (!event) {
            await this.sendMessage(phone, '❌ אירוע לא נמצא.');
            await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
            await this.commandRouter.showMainMenu(phone);
            return;
          }

          await this.eventService.deleteEvent(eventId, userId);
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);

          // React with ❌ on user's "כן" message (no text confirmation!)
          await this.reactToLastMessage(userId, '❌');
        } catch (error) {
          logger.error('Failed to delete event', { userId, eventId, error });
          await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת האירוע.');
          await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
          await this.commandRouter.showMainMenu(phone);
        }
        return;
      }

      if (choice === 'no') {
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.sendMessage(phone, 'מחיקת האירוע בוטלה.');
        await this.commandRouter.showMainMenu(phone);
        return;
      }

      await this.sendMessage(phone, 'תגובה לא ברורה. אנא ענה "כן" למחיקה או "לא" לביטול.');
      return;
    }

    // Handle menu-based deletion with numeric selection
    if (events.length === 0) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
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

      // React with ❌ on user's selection message (no text confirmation!)
      await this.reactToLastMessage(userId, '❌');
    } catch (error) {
      logger.error('Failed to delete event', { userId, eventId: eventToDelete.id, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת האירוע.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleBulkEventDeletionConfirm(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const eventIds = session?.context?.eventIds || [];

    const choice = fuzzyMatchYesNo(text);

    if (choice === 'yes') {
      try {
        // Delete all events
        let deletedCount = 0;
        for (const eventId of eventIds) {
          try {
            await this.eventService.deleteEvent(eventId, userId);
            deletedCount++;
          } catch (error) {
            logger.error('Failed to delete event in bulk operation', { eventId, error });
          }
        }

        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);

        if (deletedCount === eventIds.length) {
          await this.sendMessage(phone, `✅ ${deletedCount} אירועים נמחקו בהצלחה.`);
        } else {
          await this.sendMessage(phone, `⚠️ ${deletedCount} מתוך ${eventIds.length} אירועים נמחקו.\n\nחלק מהאירועים נכשלו במחיקה.`);
        }
        await this.commandRouter.showMainMenu(phone);
      } catch (error) {
        logger.error('Failed bulk delete', { userId, error });
        await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת האירועים.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
      }
      return;
    }

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, 'מחיקת האירועים בוטלה.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    await this.sendMessage(phone, 'תגובה לא ברורה. אנא ענה "כן" למחיקה או "לא" לביטול.');
  }

  private async handleReminderListing(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === '4') {
      // Back to menu
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
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
          await this.commandRouter.showMainMenu(phone);
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
        await this.commandRouter.showMainMenu(phone);
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
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to list reminders', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת התזכורות.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleReminderCancellation(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const reminders = session?.context?.reminders || [];

    if (reminders.length === 0) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
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
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    // React with checkmark for confirmation
    await this.reactToLastMessage(userId, '✅');

    const session = await this.stateManager.getState(userId);
    const reminder = session?.context?.reminder;

    if (!reminder) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      // Cancel in database
      await this.reminderService.cancelReminder(reminder.id, userId);

      // Cancel BullMQ job
      const { cancelReminder } = await import('../queues/ReminderQueue.js');
      await cancelReminder(reminder.id);

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to cancel reminder', { userId, reminderId: reminder.id, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בביטול התזכורת.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleDeletingReminderSelect(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const matchedReminders = session?.context?.matchedReminders || [];

    if (matchedReminders.length === 0) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    const index = parseInt(text.trim()) - 1;

    if (isNaN(index) || index < 0 || index >= matchedReminders.length) {
      await this.sendMessage(phone, '❌ מספר תזכורת לא תקין. נסה שוב או שלח /ביטול');
      return;
    }

    const reminderToDelete = matchedReminders[index];
    const isRecurring = reminderToDelete.rrule && reminderToDelete.rrule.trim().length > 0;

    const dt = DateTime.fromJSDate(reminderToDelete.dueTsUtc).setZone('Asia/Jerusalem');
    const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');

    let confirmMessage = `🗑️ תזכורת:

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
      fromNLP: false
    });
  }

  private async handleDeletingReminderConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ המחיקה בוטלה.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    // React with checkmark for confirmation
    await this.reactToLastMessage(userId, '✅');

    const session = await this.stateManager.getState(userId);
    const reminderId = session?.context?.reminderId;
    const isRecurring = session?.context?.isRecurring || false;

    if (!reminderId) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      // Delete from database (uses cancelReminder which sets status to 'cancelled')
      await this.reminderService.cancelReminder(reminderId, userId);

      // Cancel BullMQ job(s) - for recurring reminders this cancels all future occurrences
      const { cancelReminder } = await import('../queues/ReminderQueue.js');
      await cancelReminder(reminderId);

      let successMessage = '✅ התזכורת נמחקה בהצלחה.';
      if (isRecurring) {
        successMessage = '✅ התזכורת החוזרת נמחקה בהצלחה.\n\n💡 כל האירועים העתידיים בוטלו.';
      }

      await this.sendMessage(phone, successMessage);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to delete reminder', { userId, reminderId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת התזכורת.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleUpdatingReminderSelect(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const matchedReminders = session?.context?.matchedReminders || [];
    const newDateTime = session?.context?.newDateTime;

    if (matchedReminders.length === 0 || !newDateTime) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    const index = parseInt(text.trim()) - 1;

    if (isNaN(index) || index < 0 || index >= matchedReminders.length) {
      await this.sendMessage(phone, '❌ מספר תזכורת לא תקין. נסה שוב או שלח /ביטול');
      return;
    }

    const reminderToUpdate = matchedReminders[index];
    const isRecurring = reminderToUpdate.rrule && reminderToUpdate.rrule.trim().length > 0;
    const newDate = new Date(newDateTime);

    if (isRecurring) {
      // Show occurrence selection
      await this.showRecurringUpdateOptions(phone, userId, reminderToUpdate, newDate);
    } else {
      // Direct confirmation
      await this.confirmReminderUpdate(phone, userId, reminderToUpdate, newDate, false);
    }
  }

  private async handleUpdatingReminderOccurrence(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === 'ביטול' || choice === '❌') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ העדכון בוטל.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    const choiceNum = parseInt(choice);

    if (choiceNum !== 1 && choiceNum !== 2) {
      await this.sendMessage(phone, 'אנא שלח 1 (רק הפעם הבאה) או 2 (את כולם)');
      return;
    }

    const session = await this.stateManager.getState(userId);
    const { reminderId, newDateTime, rrule, nextOccurrence, reminderTitle } = session?.context || {};

    if (!reminderId || !newDateTime) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    const newDate = new Date(newDateTime);

    if (choiceNum === 1) {
      // Update THIS ONE only - create new one-time reminder
      const nextOccDate = new Date(nextOccurrence);
      const newDt = DateTime.fromJSDate(newDate).setZone('Asia/Jerusalem');

      // Set the next occurrence date with the new time
      const updatedNextOccurrence = DateTime.fromJSDate(nextOccDate)
        .setZone('Asia/Jerusalem')
        .set({ hour: newDt.hour, minute: newDt.minute, second: 0 })
        .toJSDate();

      try {
        // Create new one-time reminder for this specific occurrence
        const newReminder = await this.reminderService.createReminder({
          userId,
          title: `${reminderTitle} (מעודכן)`,
          dueTsUtc: updatedNextOccurrence,
          // No rrule - this is a one-time reminder
        });

        // Schedule with BullMQ
        const { scheduleReminder } = await import('../queues/ReminderQueue.js');
        await scheduleReminder({
          reminderId: newReminder.id,
          userId,
          title: newReminder.title,
          phone
        }, updatedNextOccurrence);

        const displayDt = DateTime.fromJSDate(updatedNextOccurrence).setZone('Asia/Jerusalem');
        await this.sendMessage(phone, `✅ נוצרה תזכורת חד-פעמית!\n\n📌 ${newReminder.title}\n📅 ${displayDt.toFormat('dd/MM/yyyy HH:mm')}\n\n💡 התזכורת החוזרת המקורית ממשיכה כרגיל.`);
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
      } catch (error) {
        logger.error('Failed to create one-time reminder update', { userId, reminderId, error });
        await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת התזכורת החדשה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
      }
    } else {
      // Update ALL - update the base reminder time
      const reminder = await this.reminderService.getReminderById(reminderId, userId);
      if (reminder) {
        await this.confirmReminderUpdate(phone, userId, reminder, newDate, true);
      } else {
        await this.sendMessage(phone, '❌ התזכורת לא נמצאה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
      }
    }
  }

  private async handleUpdatingReminderConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ העדכון בוטל.');
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    if (choice !== 'כן' && choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    // React with checkmark for confirmation
    await this.reactToLastMessage(userId, '✅');

    const session = await this.stateManager.getState(userId);
    const { reminderId, newDateTime, updateAll } = session?.context || {};

    if (!reminderId || !newDateTime) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
      return;
    }

    try {
      const newDate = new Date(newDateTime);

      // Update reminder in database
      const updated = await this.reminderService.updateReminder(reminderId, userId, {
        dueTsUtc: newDate
      });

      if (!updated) {
        await this.sendMessage(phone, '❌ לא הצלחתי לעדכן את התזכורת.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.commandRouter.showMainMenu(phone);
        return;
      }

      // Reschedule with BullMQ
      const { cancelReminder, scheduleReminder } = await import('../queues/ReminderQueue.js');
      await cancelReminder(reminderId); // Cancel old job
      await scheduleReminder({
        reminderId: updated.id,
        userId,
        title: updated.title,
        phone
      }, newDate); // Schedule new job

      const displayDt = DateTime.fromJSDate(newDate).setZone('Asia/Jerusalem');
      let successMessage = `✅ התזכורת עודכנה בהצלחה!\n\n📌 ${updated.title}\n📅 ${displayDt.toFormat('dd/MM/yyyy HH:mm')}`;

      if (updateAll) {
        successMessage += '\n\n🔄 כל המופעים עודכנו!';
      }

      await this.sendMessage(phone, successMessage);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to update reminder', { userId, reminderId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בעדכון התזכורת.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showMainMenu(phone);
    }
  }

  private async handleSettings(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === '4') {
      // Back to menu
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showAdaptiveMenu(phone, userId, { isExplicitRequest: false });
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

      if (choice === '3') {
        // Menu display mode
        const currentMode = settings.prefsJsonb?.menuDisplayMode || 'adaptive';
        const modeNames = {
          always: 'תמיד',
          adaptive: 'אדפטיבי (מתאים לרמה)',
          errors_only: 'רק בשגיאות',
          never: 'לעולם לא'
        };

        await this.stateManager.setState(userId, ConversationState.SETTINGS_MENU_DISPLAY);
        await this.sendMessage(phone,
          `📋 תצוגת תפריט\n\nמצב נוכחי: ${modeNames[currentMode]}\n\nבחר מצב:\n\n1️⃣ תמיד - הצג תפריט אחרי כל פעולה\n2️⃣ אדפטיבי - התאם לפי הרמה שלך (מומלץ)\n3️⃣ רק בשגיאות - הצג רק כשיש בעיה\n4️⃣ לעולם לא - אל תציג תפריט\n\n(או שלח /ביטול)`
        );
        return;
      }

      await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-4.');

    } catch (error) {
      logger.error('Failed to load settings', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בטעינת ההגדרות.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showAdaptiveMenu(phone, userId, { isError: true });
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
      await this.commandRouter.showAdaptiveMenu(phone, userId, { actionType: 'settings_updated' });
    } catch (error) {
      logger.error('Failed to update language', { userId, locale, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי השפה.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showAdaptiveMenu(phone, userId, { isError: true });
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
      await this.commandRouter.showAdaptiveMenu(phone, userId, { actionType: 'settings_updated' });
    } catch (error) {
      logger.error('Failed to update timezone', { userId, timezone, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי אזור הזמן.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showAdaptiveMenu(phone, userId, { isError: true });
    }
  }

  private async handleSettingsMenuDisplay(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    let mode: MenuDisplayMode;
    let modeName: string;

    switch (choice) {
      case '1':
        mode = 'always';
        modeName = 'תמיד';
        break;
      case '2':
        mode = 'adaptive';
        modeName = 'אדפטיבי (מתאים לרמה)';
        break;
      case '3':
        mode = 'errors_only';
        modeName = 'רק בשגיאות';
        break;
      case '4':
        mode = 'never';
        modeName = 'לעולם לא';
        break;
      default:
        await this.sendMessage(phone, 'בחירה לא תקינה. אנא בחר 1-4.');
        return;
    }

    try {
      await this.settingsService.updateMenuDisplayMode(userId, mode);
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, `✅ מצב תצוגת תפריט שונה ל-${modeName}!`);
      await this.commandRouter.showAdaptiveMenu(phone, userId, { actionType: 'settings_updated' });
    } catch (error) {
      logger.error('Failed to update menu display mode', { userId, mode, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי מצב תצוגת התפריט.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.commandRouter.showAdaptiveMenu(phone, userId, { isError: true });
    }
  }

}
