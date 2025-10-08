import { StateManager } from './StateManager.js';
import { AuthService } from './AuthService.js';
import { EventService } from './EventService.js';
import { ReminderService } from './ReminderService.js';
import { ContactService } from './ContactService.js';
import { SettingsService } from './SettingsService.js';
import { TaskService } from './TaskService.js';
import { dashboardTokenService } from './DashboardTokenService.js';
import { proficiencyTracker } from './ProficiencyTracker.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';
import { ConversationState, AuthState, MenuDisplayMode } from '../types/index.js';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { parseHebrewDate } from '../utils/hebrewDateParser.js';
import { safeParseDate, extractDateFromIntent } from '../utils/dateValidator.js';
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
import { scheduleReminder } from '../queues/ReminderQueue.js';
import { filterByFuzzyMatch } from '../utils/hebrewMatcher.js';

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
 * MessageRouter - COMPLETE IMPLEMENTATION
 * All handlers fully implemented with service integration
 */
export class MessageRouter {
  private readonly AUTH_STATE_PREFIX = 'auth:state:';
  private readonly AUTH_STATE_TTL = 48 * 60 * 60; // 48 hours in seconds (172,800)

  constructor(
    private stateManager: StateManager,
    private authService: AuthService,
    private eventService: EventService,
    private reminderService: ReminderService,
    private contactService: ContactService,
    private settingsService: SettingsService,
    private taskService: TaskService,
    private messageProvider: IMessageProvider
  ) {}

  /**
   * Main routing function
   */
  async routeMessage(from: string, text: string, messageId?: string, quotedMessage?: { messageId: string; participant?: string }): Promise<void> {
    try {
      logger.info('Routing message', { from, text, messageId, quotedMessage });

      // CRITICAL: Message deduplication - prevent processing same message twice
      // WhatsApp can send duplicates during network issues or reconnections
      if (messageId) {
        const dedupeKey = `msg:processed:${messageId}`;
        const processingKey = `msg:processing:${messageId}`;

        // Check if already processed
        const alreadyProcessed = await redis.get(dedupeKey);
        if (alreadyProcessed) {
          logger.info('Skipping duplicate message', { messageId, from, text: text.substring(0, 50) });
          return;
        }

        // Check if currently processing (prevent race conditions)
        const currentlyProcessing = await redis.get(processingKey);
        if (currentlyProcessing) {
          logger.info('Message already being processed', { messageId, from });
          return;
        }

        // Mark as processing (30 min expiry for safety)
        await redis.setex(processingKey, 1800, Date.now().toString());
        logger.debug('Marked message as processing', { messageId });
      }

      // Retrieve user once and reuse throughout
      let user = await this.authService.getUserByPhone(from);

      // Store messageId for potential reactions
      if (messageId && user) {
        const session = await this.stateManager.getState(user.id);
        if (session) {
          await this.stateManager.setState(user.id, session.state, {
            ...session.context,
            lastMessageId: messageId,
            lastMessageFrom: from
          });
        } else {
          // No session exists - create minimal session in MAIN_MENU state just to store message ID
          await this.stateManager.setState(user.id, ConversationState.MAIN_MENU, {
            lastMessageId: messageId,
            lastMessageFrom: from
          });
        }
      }

      // PHASE 1: Handle reply-to-message quick actions
      // If user replied to a bot message with event info, try quick action first
      if (quotedMessage && user) {
        const handled = await this.handleQuickAction(from, user.id, text, quotedMessage.messageId);
        if (handled) {
          // Mark as successfully processed
          if (messageId) {
            await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
            await redis.del(`msg:processing:${messageId}`);
          }
          return;
        }
        // If not handled, continue with normal flow below
      }

      // PHASE 2.3: Handle pending delete confirmation
      if (user) {
        const deleteConfirmRaw = await redis.get(`temp:delete_confirm:${user.id}`);
        if (deleteConfirmRaw) {
          const handled = await this.handleDeleteConfirmation(from, user.id, text, deleteConfirmRaw);
          if (handled) {
            // Mark as successfully processed
            if (messageId) {
              await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
              await redis.del(`msg:processing:${messageId}`);
            }
            return;
          }
          // If not handled (user said something else), clear confirmation and continue
          await redis.del(`temp:delete_confirm:${user.id}`);
        }
      }

      if (this.isCommand(text)) {
        await this.handleCommand(from, text);
        // Mark as successfully processed
        if (messageId) {
          await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString()); // 24h
          await redis.del(`msg:processing:${messageId}`);
        }
        return;
      }

      const authState = await this.getAuthState(from);

      if (authState && !authState.authenticated) {
        await this.handleAuthFlow(from, text, authState);
        // Mark as processed
        if (messageId) {
          await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
          await redis.del(`msg:processing:${messageId}`);
        }
        return;
      }

      if (!user) {
        await this.startRegistration(from);
        // Mark as processed
        if (messageId) {
          await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
          await redis.del(`msg:processing:${messageId}`);
        }
        return;
      }

      if (!authState || !authState.authenticated) {
        await this.startLogin(from);
        // Mark as processed
        if (messageId) {
          await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
          await redis.del(`msg:processing:${messageId}`);
        }
        return;
      }

      const session = await this.stateManager.getState(authState.userId!);
      const state = session?.state || ConversationState.MAIN_MENU;

      // Track user message for proficiency
      await proficiencyTracker.trackMessage(authState.userId!);

      // Track user message in conversation history (if not already tracked by NLP handler)
      // Only track for non-NLP flows
      if (state !== ConversationState.MAIN_MENU && state !== ConversationState.IDLE) {
        await this.stateManager.addToHistory(authState.userId!, 'user', text);
      }

      await this.handleStateMessage(from, authState.userId!, state, text);

      // Mark message as successfully processed (after all handlers complete)
      if (messageId) {
        await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString()); // 24h retention
        await redis.del(`msg:processing:${messageId}`);
        logger.debug('Marked message as processed', { messageId });
      }

    } catch (error) {
      logger.error('Error routing message', { from, error });

      // Clear processing flag on error so user can retry
      if (messageId) {
        await redis.del(`msg:processing:${messageId}`);
        logger.debug('Cleared processing flag due to error', { messageId });
      }

      await this.sendMessage(from, 'אירעה שגיאה. אנא נסה שוב או שלח /עזרה לעזרה.');
    }
  }

  private isCommand(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.startsWith('/')) return true;

    // Allow common commands without "/" for better UX
    const commandsWithoutSlash = ['ביטול', 'תפריט', 'עזרה', 'cancel', 'menu', 'help'];
    return commandsWithoutSlash.some(cmd => trimmed === cmd || trimmed.toLowerCase() === cmd);
  }

  private async handleCommand(from: string, command: string): Promise<void> {
    let cmd = command.trim().toLowerCase();

    // Normalize commands - add "/" if missing
    if (!cmd.startsWith('/') && this.isCommand(command)) {
      cmd = '/' + cmd;
    }
    const authState = await this.getAuthState(from);
    const userId = authState?.userId;

    switch (cmd) {
      case '/תפריט':
      case '/menu':
        if (!userId) {
          await this.sendMessage(from, 'אנא התחבר תחילה.');
          return;
        }
        await proficiencyTracker.trackCommandUsage(userId);
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showAdaptiveMenu(from, userId, { isExplicitRequest: true });
        break;

      case '/ביטול':
      case '/cancel':
        if (!userId) {
          await this.sendMessage(from, 'אנא התחבר תחילה.');
          return;
        }
        await proficiencyTracker.trackCommandUsage(userId);
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.sendMessage(from, 'הפעולה בוטלה. חוזרים לתפריט הראשי.');
        await this.showAdaptiveMenu(from, userId, { isExplicitRequest: false });
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
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create event', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleEventConflictConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = fuzzyMatchYesNo(text);

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ האירוע בוטל.');
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create event after conflict confirmation', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת האירוע. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
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
    const choice = fuzzyMatchYesNo(text);

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ האירוע בוטל.');
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
    const choice = fuzzyMatchYesNo(text);

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ התזכורת בוטלה.');
      await this.showMainMenu(phone);
      return;
    }

    if (choice !== 'yes') {
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור או "לא" לביטול');
      return;
    }

    // React with checkmark for confirmation
    await this.reactToLastMessage(userId, '✅');

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
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to create reminder', { userId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת התזכורת. נסה שוב מאוחר יותר.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }


  // ========== TASK HANDLERS ==========

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
        await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to create task', { error });
      await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת המשימה. אנא נסה שוב.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to mark task as done', { error });
      await this.sendMessage(phone, '❌ אירעה שגיאה. אנא נסה שוב.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleDeletingTask(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const { tasks } = session?.context || {};

    if (!tasks || !Array.isArray(tasks)) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
    } catch (error) {
      logger.error('Failed to delete task', { error });
      await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת המשימה. אנא נסה שוב.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
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
        message += formatEventInList(event, index + 1, 'Asia/Jerusalem', false, events) + `\n\n`;
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
            const sentMessageId = await this.sendMessage(phone, `✅ האירוע עודכן בהצלחה!\n\n${formatEventWithComments(updated)}`);
            // Store message-event mapping for reply-to quick actions
            await this.storeMessageEventMapping(sentMessageId, updated.id);
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

    // Check for cancel command first - immediate escape
    if (choice === '/ביטול' || choice.toLowerCase() === 'ביטול' || choice.toLowerCase() === 'cancel') {
      await resetFailureCount(userId, ConversationState.EDITING_EVENT_FIELD);
      await this.sendMessage(phone, 'ℹ️ פעולת העריכה בוטלה.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
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
        await this.showMainMenu(phone);
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
            await this.showMainMenu(phone);
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
      const choice = fuzzyMatchYesNo(text);

      if (choice === 'yes') {
        try {
          const event = await this.eventService.getEventById(eventId, userId);
          if (!event) {
            await this.sendMessage(phone, '❌ אירוע לא נמצא.');
            await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
            await this.showMainMenu(phone);
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
          await this.showMainMenu(phone);
        }
        return;
      }

      if (choice === 'no') {
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

      // React with ❌ on user's selection message (no text confirmation!)
      await this.reactToLastMessage(userId, '❌');
    } catch (error) {
      logger.error('Failed to delete event', { userId, eventId: eventToDelete.id, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת האירוע.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
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
        await this.showMainMenu(phone);
      } catch (error) {
        logger.error('Failed bulk delete', { userId, error });
        await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת האירועים.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
      }
      return;
    }

    if (choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, 'מחיקת האירועים בוטלה.');
      await this.showMainMenu(phone);
      return;
    }

    await this.sendMessage(phone, 'תגובה לא ברורה. אנא ענה "כן" למחיקה או "לא" לביטול.');
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

    // React with checkmark for confirmation
    await this.reactToLastMessage(userId, '✅');

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
      const { cancelReminder } = await import('../queues/ReminderQueue.js');
      await cancelReminder(reminder.id);

      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to cancel reminder', { userId, reminderId: reminder.id, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בביטול התזכורת.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleDeletingReminderSelect(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const matchedReminders = session?.context?.matchedReminders || [];

    if (matchedReminders.length === 0) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to delete reminder', { userId, reminderId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה במחיקת התזכורת.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  private async handleUpdatingReminderSelect(phone: string, userId: string, text: string): Promise<void> {
    const session = await this.stateManager.getState(userId);
    const matchedReminders = session?.context?.matchedReminders || [];
    const newDateTime = session?.context?.newDateTime;

    if (matchedReminders.length === 0 || !newDateTime) {
      await this.sendMessage(phone, 'אירעה שגיאה. מתחילים מחדש.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
        await this.showMainMenu(phone);
      } catch (error) {
        logger.error('Failed to create one-time reminder update', { userId, reminderId, error });
        await this.sendMessage(phone, '❌ אירעה שגיאה ביצירת התזכורת החדשה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
      }
    } else {
      // Update ALL - update the base reminder time
      const reminder = await this.reminderService.getReminderById(reminderId, userId);
      if (reminder) {
        await this.confirmReminderUpdate(phone, userId, reminder, newDate, true);
      } else {
        await this.sendMessage(phone, '❌ התזכורת לא נמצאה.');
        await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
        await this.showMainMenu(phone);
      }
    }
  }

  private async handleUpdatingReminderConfirm(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim().toLowerCase();

    if (choice === 'לא' || choice === 'no') {
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.sendMessage(phone, '❌ העדכון בוטל.');
      await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);
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
        await this.showMainMenu(phone);
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
      await this.showMainMenu(phone);

    } catch (error) {
      logger.error('Failed to update reminder', { userId, reminderId, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בעדכון התזכורת.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showMainMenu(phone);
    }
  }

  // ========== SETTINGS HANDLERS ==========

  private async handleSettings(phone: string, userId: string, text: string): Promise<void> {
    const choice = text.trim();

    if (choice === '4') {
      // Back to menu
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showAdaptiveMenu(phone, userId, { isExplicitRequest: false });
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
      await this.showAdaptiveMenu(phone, userId, { isError: true });
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
      await this.showAdaptiveMenu(phone, userId, { actionType: 'settings_updated' });
    } catch (error) {
      logger.error('Failed to update language', { userId, locale, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי השפה.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showAdaptiveMenu(phone, userId, { isError: true });
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
      await this.showAdaptiveMenu(phone, userId, { actionType: 'settings_updated' });
    } catch (error) {
      logger.error('Failed to update timezone', { userId, timezone, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי אזור הזמן.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showAdaptiveMenu(phone, userId, { isError: true });
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
      await this.showAdaptiveMenu(phone, userId, { actionType: 'settings_updated' });
    } catch (error) {
      logger.error('Failed to update menu display mode', { userId, mode, error });
      await this.sendMessage(phone, '❌ אירעה שגיאה בשינוי מצב תצוגת התפריט.');
      await this.stateManager.setState(userId, ConversationState.MAIN_MENU);
      await this.showAdaptiveMenu(phone, userId, { isError: true });
    }
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

    // Check if it's a menu number first (1-6)
    if (/^[1-6]$/.test(choice)) {
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

        case '4': // Tasks
          const { renderTasksMenu } = await import('../utils/menuRenderer.js');
          await this.sendMessage(phone, renderTasksMenu());
          await this.stateManager.setState(userId, ConversationState.TASKS_MENU);
          break;

        case '5': // Settings menu
          await this.sendMessage(phone, '⚙️ הגדרות\n\n1️⃣ שינוי שפה\n2️⃣ שינוי אזור זמן\n3️⃣ תצוגת תפריט\n4️⃣ חזרה לתפריט\n\nבחר מספר');
          await this.stateManager.setState(userId, ConversationState.SETTINGS_MENU);
          break;

        case '6': // Help
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
    const menu = `📋 תפריט ראשי

📅 1) האירועים שלי
➕ 2) הוסף אירוע
⏰ 3) הוסף תזכורת
✅ 4) משימות
⚙️ 5) הגדרות
❓ 6) עזרה

💬 *פשוט כתוב מה שאתה רוצה!*
לדוגמה: "מה יש לי היום", "הוסף פגישה מחר"

או בחר מספר (1-6)`;

    await this.sendMessage(phone, menu);
  }

  /**
   * Show adaptive menu based on user proficiency and preferences
   */
  private async showAdaptiveMenu(
    phone: string,
    userId: string,
    context: {
      isError?: boolean;
      isIdle?: boolean;
      lastMessageTime?: Date;
      isExplicitRequest?: boolean;
      actionType?: 'event_created' | 'event_deleted' | 'reminder_created' | 'task_completed' | 'contact_added' | 'settings_updated';
    }
  ): Promise<void> {
    // Get user preference
    const menuPreference = await this.settingsService.getMenuDisplayMode(userId);

    // Determine if menu should be shown
    const menuDecision = await proficiencyTracker.shouldShowMenu(userId, menuPreference, {
      isError: context.isError || false,
      isIdle: context.isIdle || false,
      lastMessageTime: context.lastMessageTime,
      isExplicitRequest: context.isExplicitRequest || false,
    });

    if (!menuDecision.show) {
      return; // Don't show menu
    }

    // Show full menu
    if (menuDecision.type === 'full') {
      await this.showMainMenu(phone);
      return;
    }

    // Show contextual mini-menu
    if (menuDecision.type === 'contextual' && context.actionType) {
      await this.showContextualMenu(phone, context.actionType);
      return;
    }

    // Fallback to full menu
    await this.showMainMenu(phone);
  }

  /**
   * Show contextual mini-menu based on recent action
   */
  private async showContextualMenu(phone: string, actionType: string): Promise<void> {
    let menu = '';

    switch (actionType) {
      case 'event_created':
        menu = `✅ האירוע נוסף!\n\nמה עוד?\n📅 ראה אירועים\n⏰ הוסף תזכורת\n➕ אירוע נוסף\n\n(או שלח /תפריט)`;
        break;
      case 'event_deleted':
        menu = `✅ האירוע נמחק!\n\nמה עוד?\n📅 ראה אירועים\n➕ הוסף אירוע\n\n(או שלח /תפריט)`;
        break;
      case 'reminder_created':
        menu = `✅ התזכורת נוספה!\n\nמה עוד?\n⏰ ראה תזכורות\n➕ תזכורת נוספת\n📅 הוסף אירוע\n\n(או שלח /תפריט)`;
        break;
      case 'task_completed':
        menu = `✅ משימה הושלמה!\n\nמה עוד?\n✅ ראה משימות\n➕ משימה חדשה\n\n(או שלח /תפריט)`;
        break;
      case 'contact_added':
        menu = `✅ איש הקשר נוסף!\n\nמה עוד?\n👨‍👩‍👧 ראה אנשי קשר\n📝 נסח הודעה\n\n(או שלח /תפריט)`;
        break;
      case 'settings_updated':
        menu = `✅ ההגדרות עודכנו!\n\n⚙️ הגדרות נוספות\n📋 תפריט ראשי\n\n(או שלח /תפריט)`;
        break;
      default:
        menu = `מה לעשות הלאה?\n\n📋 שלח /תפריט לתפריט מלא`;
    }

    await this.sendMessage(phone, menu);
  }

  // ========== NLP HANDLERS ==========

  private async handleNLPMessage(phone: string, userId: string, text: string): Promise<void> {
    try {
      const { NLPService } = await import('./NLPService.js');
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

      const intent = await nlp.parseIntent(contextEnhancedText, contacts, user?.timezone || 'Asia/Jerusalem', conversationHistory);

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
        await this.showAdaptiveMenu(phone, userId, { isError: true });
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

      // Send success message
      const displayDate = dt.toFormat('dd/MM/yyyy HH:mm');
      const successMessage = `✅ ${event.title} - ${displayDate}${event.location ? `\n📍 ${event.location}` : ''}${event.contactName ? `\n👤 ${event.contactName}` : ''}`;

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
        events = filterByFuzzyMatch(events, event.title, e => e.title, 0.45);
      } else if (event.date || event.dateText) {
        // User said "update event on DATE" - date is search term
        const dateQuery = parseDateFromNLP(event, 'handleNLPUpdateEvent');

        if (!dateQuery.date) {
          await this.sendMessage(phone, '❌ לא הצלחתי להבין את התאריך.\n\nנסה לפרט יותר או שלח /תפריט');
          return;
        }

        events = await this.eventService.getEventsByDate(userId, dateQuery.date!);

        // Filter by title if provided (45% threshold for Hebrew flexibility)
        if (event.title && events.length > 0) {
          events = filterByFuzzyMatch(events, event.title, e => e.title, 0.45);
        }
      } else {
        // Search all recent events (past + future, DESC order)
        events = await this.eventService.getAllEvents(userId, 100, 0, true);

        // Filter by title if provided (45% threshold for Hebrew flexibility)
        if (event.title && events.length > 0) {
          events = filterByFuzzyMatch(events, event.title, e => e.title, 0.45);
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

    // Use fuzzy match (0.45 threshold for Hebrew flexibility)
    let matchedReminders = filterByFuzzyMatch(allReminders, reminder.title, (r: any) => r.title, 0.45);

    if (matchedReminders.length === 0) {
      await this.sendMessage(phone, `❌ לא מצאתי תזכורת עם השם "${reminder.title}".\n\nשלח /תפריט לחזרה לתפריט`);
      return;
    }

    // Parse the new date/time
    let newDateTime: Date | null = null;
    if (reminder.date || reminder.dateText) {
      newDateTime = safeParseDate(reminder.date || reminder.dateText, 'handleNLPUpdateReminder');
    }

    if (!newDateTime) {
      await this.sendMessage(phone, '❌ לא הצלחתי להבין את הזמן/תאריך החדש.\n\nנסה שוב או שלח /תפריט');
      logger.error('Invalid date in NLP update reminder', { date: reminder.date, dateText: reminder.dateText });
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

  private async showHelp(phone: string): Promise<void> {
    const help = `עזרה - מדריך שימוש 📖

🔹 פקודות מינימליות:
/תפריט - חזרה לתפריט הראשי
/ביטול - ביטול פעולה נוכחית
/עזרה - הצגת עזרה זו
/התנתק - יציאה מהחשבון

🔹 תכונות פעילות:
✅ ניהול אירועים (יצירה, רשימה, עריכה, מחיקה)
✅ תזכורות (יצירה, תזמון אוטומטי)
✅ משימות (מעקב והשלמה)
✅ לוח אישי מעוצב (HTML)
✅ הגדרות (שפה, אזור זמן)
✅ NLP - שפה טבעית!

💬 דוגמאות לשימוש בשפה טבעית:
• "קבע פגישה עם דני מחר ב-3"
• "תזכיר לי להתקשר לאמא ביום רביעי"
• "מה יש לי מחר?"
• "תן לי דף סיכום" / "רוצה לראות הכל"

✨ פשוט דבר איתי כמו עם אדם - אני אבין!`;

    await this.sendMessage(phone, help);
  }

  private async handleLogout(phone: string, userId: string): Promise<void> {
    await this.clearAuthState(phone);
    await this.stateManager.clearState(userId);
    await this.sendMessage(phone, 'התנתקת בהצלחה. להתראות! 👋');
  }

  private async sendMessage(to: string, message: string): Promise<string> {
    try {
      const messageId = await this.messageProvider.sendMessage(to, message);
      logger.debug('Message sent', { to, messageId, messageLength: message.length });

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

      return messageId;
    } catch (error) {
      logger.error('Failed to send message', { to, error });
      throw error;
    }
  }

  private async reactToLastMessage(userId: string, emoji: string): Promise<void> {
    try {
      const session = await this.stateManager.getState(userId);
      const lastMessageId = session?.context?.lastMessageId;
      const lastMessageFrom = session?.context?.lastMessageFrom;

      if (!lastMessageId || !lastMessageFrom) {
        logger.warn('Cannot react: no last message found', { userId });
        return;
      }

      await this.messageProvider.reactToMessage(lastMessageFrom, lastMessageId, emoji);
      logger.info(`Reacted to message with ${emoji}`, { userId, messageId: lastMessageId });
    } catch (error) {
      logger.error('Failed to react to last message', { userId, error });
      // Don't throw - reactions are non-critical
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

      // Send dashboard link - split into two messages for better clickability
      const introMessage = `✨ *הלוח האישי שלך מוכן!*

📊 צפה בכל האירועים, התזכורות והמשימות שלך בממשק נוח וצבעוני

לחץ על הקישור למטה לפתיחה:`;

      const linkMessage = `${dashboardUrl}

⏰ *הקישור תקף ל-15 דקות בלבד*

💡 ניתן לפתוח מכל מכשיר - מחשב, טאבלט או נייד`;

      await this.sendMessage(phone, introMessage);
      await this.sendMessage(phone, linkMessage);

      logger.info('Dashboard link sent successfully', {
        userId,
        token: token.substring(0, 8) + '...'
      });

    } catch (error) {
      logger.error('Failed to generate dashboard', { userId, error });
      await this.sendMessage(phone, '❌ שגיאה ביצירת הלוח. אנא נסה שוב מאוחר יותר.');
    }
  }

  // ========== REPLY-TO-MESSAGE HELPERS (Phase 1.2) ==========

  /**
   * Store mapping between sent message ID and event ID(s)
   * Allows users to reply to event messages for quick actions
   * TTL: 24 hours (same-day interactions only)
   */
  private async storeMessageEventMapping(messageId: string, eventIds: string | string[]): Promise<void> {
    try {
      const key = `msg:event:${messageId}`;
      const value = Array.isArray(eventIds) ? JSON.stringify(eventIds) : eventIds;
      await redis.setex(key, 86400, value); // 24h TTL
      logger.debug('Stored message-event mapping', { messageId, eventIds });
    } catch (error) {
      logger.error('Failed to store message-event mapping', { messageId, eventIds, error });
    }
  }

  /**
   * Retrieve event ID(s) from quoted message ID
   * Returns single eventId (string) or array of eventIds
   */
  private async getEventFromQuotedMessage(quotedMessageId: string): Promise<string | string[] | null> {
    try {
      const key = `msg:event:${quotedMessageId}`;
      const value = await redis.get(key);

      if (!value) {
        logger.debug('No event mapping found for quoted message', { quotedMessageId });
        return null;
      }

      // Try parsing as JSON array first
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : value;
      } catch {
        // Not JSON, return as single event ID
        return value;
      }
    } catch (error) {
      logger.error('Failed to get event from quoted message', { quotedMessageId, error });
      return null;
    }
  }

  /**
   * Phase 2.4: Send helpful hints for first-time users
   * Shows quick action tips for the first 3 uses
   */
  private async sendQuickActionHint(phone: string, userId: string): Promise<void> {
    try {
      const countKey = `quick_action_count:${userId}`;
      const count = await redis.get(countKey);
      const currentCount = count ? parseInt(count, 10) : 0;

      // Show hints only for first 3 uses
      if (currentCount < 3) {
        let hint = '\n\n💡 טיפ: ';

        if (currentCount === 0) {
          hint += 'עכשיו אפשר לענות להודעות שלי!\n• "מחק" למחיקה\n• "20:00" לעדכון שעה\n• או כל בקשה אחרת';
        } else if (currentCount === 1) {
          hint += 'אם יש כמה אירועים, הוסף מספר:\n• "מחק 1" - מחק אירוע ראשון\n• "עדכן 2 ל15:00" - שנה שעה של אירוע 2';
        } else if (currentCount === 2) {
          hint += 'תמיד אפשר לענות להודעות שלי במקום להתחיל מחדש!';
        }

        await this.sendMessage(phone, hint);

        // Increment counter
        await redis.setex(countKey, 2592000, (currentCount + 1).toString()); // 30-day TTL
      }
    } catch (error) {
      logger.error('Failed to send quick action hint', { userId, error });
      // Continue even if hint fails
    }
  }

  /**
   * Handle quick actions when user replies to event message
   * Phase 1: Basic keywords (delete, update time)
   * Phase 2: Multi-event support, context-aware NLP
   */
  private async handleQuickAction(phone: string, userId: string, text: string, quotedMessageId: string): Promise<boolean> {
    const eventData = await this.getEventFromQuotedMessage(quotedMessageId);

    if (!eventData) {
      // Message too old (>24h) or not an event message
      return false;
    }

    // Phase 3.3: Analytics - track quick action detection
    logger.info('[ANALYTICS] Quick action detected', {
      analytics: 'quick_action_detected',
      userId,
      eventCount: Array.isArray(eventData) ? eventData.length : 1,
      textLength: text.length
    });

    // Normalize text for keyword matching (handle voice-to-text variations)
    const normalized = text.trim().toLowerCase()
      .replace(/מצק|מחה/g, 'מחק')      // Voice variations of "delete"
      .replace(/איקס|אקס/g, 'x')        // Hebrew pronunciation of "X"
      .replace(/פ״מ|פ"מ|pm/gi, 'אחרי הצהריים');

    // Phase 1.3: Keyword patterns
    const deleteKeywords = ['מחק', 'מחה', 'x', 'delete', 'מצק'];
    const updateKeywords = ['עדכן', 'שנה', 'דחה', 'update'];

    // Check if it's a delete action
    const isDelete = deleteKeywords.some(keyword => normalized.includes(keyword));

    // Check if it's a time update (matches HH:MM or H:MM patterns)
    // Added support for single-digit minutes like "20:0" (interprets as "20:00")
    const timeMatch = text.match(/\b(\d{1,2}):(\d{1,2})\b/) ||                         // 18:00, 8:30, 20:0 (typo)
                      text.match(/\b(\d{1,2})\s*(בערב|בבוקר|אחרי הצהריים)\b/) ||      // 8 בערב
                      text.match(/לשעה\s*(\d{1,2})(?::(\d{1,2}))?/) ||                 // לשעה 18, לשעה 18:00, לשעה 20:0
                      text.match(/ב-?(\d{1,2})(?::(\d{1,2}))?/);

    const isTimeUpdate = timeMatch || updateKeywords.some(keyword => normalized.includes(keyword));

    // Handle single event quick actions
    if (typeof eventData === 'string') {
      // Single event - can process directly

      if (isDelete) {
        // Phase 3.3: Analytics - track delete action
        logger.info('[ANALYTICS] Quick delete initiated', {
          analytics: 'quick_delete',
          userId,
          eventCount: 1,
          keyword: deleteKeywords.find(k => normalized.includes(k))
        });
        return await this.handleQuickDelete(phone, userId, eventData);
      }

      if (isTimeUpdate && timeMatch) {
        // Phase 3.3: Analytics - track time update action
        logger.info('[ANALYTICS] Quick time update initiated', {
          analytics: 'quick_time_update',
          userId,
          eventCount: 1,
          timePattern: timeMatch[0]
        });
        return await this.handleQuickTimeUpdate(phone, userId, eventData, text);
      }

      // Phase 3.1: Provide helpful suggestions if keyword detected but incomplete
      if (isTimeUpdate && !timeMatch) {
        await this.sendMessage(phone, '⏰ זיהיתי בקשה לשינוי שעה.\n\nדוגמאות:\n• "20:00"\n• "8 בערב"\n• "עדכן ל15:30"');
        return true; // Handled with suggestion
      }

      if (isDelete || isTimeUpdate) {
        logger.info('Quick action keyword detected but handler not ready', { isDelete, isTimeUpdate });
      }
    } else if (Array.isArray(eventData)) {
      // Phase 2.1: Multiple events - need number selection
      logger.info('Multiple events in reply', { eventCount: eventData.length });

      // Extract event number from text (e.g., "מחק 1", "עדכן 2 ל20:00")
      const numberMatch = text.match(/\b(\d+)\b/);

      if (!numberMatch) {
        // No number specified - ask user to specify which event
        await this.sendMessage(phone, `⚠️ יש ${eventData.length} אירועים. אנא ציין מספר (למשל: "מחק 1" או "עדכן 2 ל20:00")`);
        return true; // Handled
      }

      const eventNumber = parseInt(numberMatch[1], 10);

      // Validate event number is within bounds (1-indexed for user, 0-indexed internally)
      if (eventNumber < 1 || eventNumber > eventData.length) {
        // Phase 3.2: Improved error message with context
        await this.sendMessage(phone, `❌ מספר האירוע חייב להיות בין 1 ל-${eventData.length}\n\nנסה שוב עם המספר הנכון`);
        return true; // Handled
      }

      // Get the selected event ID (convert from 1-indexed to 0-indexed)
      const selectedEventId = eventData[eventNumber - 1];

      // Process the action on the selected event
      if (isDelete) {
        // Phase 3.3: Analytics - track multi-event delete
        logger.info('[ANALYTICS] Quick delete multi-event', {
          analytics: 'quick_delete_multi',
          userId,
          eventCount: eventData.length,
          selectedIndex: eventNumber,
          keyword: deleteKeywords.find(k => normalized.includes(k))
        });
        return await this.handleQuickDelete(phone, userId, selectedEventId);
      }

      if (isTimeUpdate && timeMatch) {
        // Phase 3.3: Analytics - track multi-event time update
        logger.info('[ANALYTICS] Quick time update multi-event', {
          analytics: 'quick_time_update_multi',
          userId,
          eventCount: eventData.length,
          selectedIndex: eventNumber,
          timePattern: timeMatch[0]
        });
        return await this.handleQuickTimeUpdate(phone, userId, selectedEventId, text);
      }

      // Phase 3.1: Provide helpful suggestions if keyword detected but incomplete
      if (isTimeUpdate && !timeMatch) {
        await this.sendMessage(phone, `⏰ זיהיתי בקשה לשינוי שעה לאירוע ${eventNumber}.\n\nדוגמאות:\n• "עדכן ${eventNumber} ל20:00"\n• "${eventNumber} 8 בערב"\n• "${eventNumber} 15:30"`);
        return true; // Handled with suggestion
      }

      // If keyword detected but no action matched, let NLP handle it
      if (isDelete || isTimeUpdate) {
        logger.info('Multi-event quick action keyword detected but no match', { eventNumber, isDelete, isTimeUpdate });
      }
    }

    // Phase 2.2: Not handled by quick action - store event context for NLP fallback
    // This allows NLP to understand user is referring to specific event(s)
    if (typeof eventData === 'string') {
      // Store single event ID
      await redis.setex(`temp:event_context:${userId}`, 60, eventData); // 60s TTL
    } else if (Array.isArray(eventData) && eventData.length > 0) {
      // Store multiple event IDs as JSON
      await redis.setex(`temp:event_context:${userId}`, 60, JSON.stringify(eventData)); // 60s TTL
    }

    // Phase 3.3: Analytics - track fallback to NLP
    logger.info('[ANALYTICS] Quick action fallback to NLP', {
      analytics: 'quick_action_fallback',
      userId,
      eventCount: Array.isArray(eventData) ? eventData.length : 1,
      reason: 'no_keyword_match'
    });

    // Not handled - continue with normal NLP flow (will use event context)
    return false;
  }

  /**
   * Quick delete action when replying to single event
   * Phase 2.3: Ask for confirmation before deleting (safety for voice users)
   */
  private async handleQuickDelete(phone: string, userId: string, eventId: string): Promise<boolean> {
    try {
      const event = await this.eventService.getEventById(eventId, userId);
      if (!event) {
        // Phase 3.2: Improved error message - event may have been deleted or expired
        await this.sendMessage(phone, '❌ האירוע לא נמצא (אולי כבר נמחק?).\n\nשלח /תפריט לתפריט ראשי');
        return true; // Handled (even if failed)
      }

      // Phase 2.3: Store pending delete and ask for confirmation
      const confirmData = JSON.stringify({ eventId, eventTitle: event.title, phone });
      await redis.setex(`temp:delete_confirm:${userId}`, 60, confirmData); // 60s TTL

      const dt = DateTime.fromJSDate(event.startTsUtc).setZone('Asia/Jerusalem');
      await this.sendMessage(phone, `🗑️ למחוק את "${event.title}" (${dt.toFormat('dd/MM HH:mm')})?
אישור: כן/לא
ביטול: לא/cancel`);

      logger.info('Quick delete confirmation requested', { userId, eventId, eventTitle: event.title });
      return true; // Successfully handled (awaiting confirmation)
    } catch (error) {
      logger.error('Quick delete confirmation failed', { userId, eventId, error });
      // Phase 3.2: Improved error message with action hint
      await this.sendMessage(phone, '❌ שגיאה במחיקת האירוע.\n\nנסה שוב או שלח /תפריט');
      return true; // Handled (even if failed)
    }
  }

  /**
   * Quick time update when replying to single event
   */
  private async handleQuickTimeUpdate(phone: string, userId: string, eventId: string, text: string): Promise<boolean> {
    try {
      const event = await this.eventService.getEventById(eventId, userId);
      if (!event) {
        // Phase 3.2: Improved error message
        await this.sendMessage(phone, '❌ האירוע לא נמצא (אולי כבר נמחק?).\n\nשלח /תפריט לתפריט ראשי');
        return true; // Handled
      }

      // Normalize time format: "20:0" → "20:00", "8:5" → "08:05"
      let normalizedText = text.replace(/\b(\d{1,2}):(\d{1})\b/g, (match, h, m) => {
        const hour = h.padStart(2, '0');
        const minute = m.padStart(2, '0');
        return `${hour}:${minute}`;
      });

      // Use NLP to parse the new time from user's text
      const { NLPService } = await import('./NLPService.js');
      const nlp = new NLPService();
      const contacts = await this.contactService.getAllContacts(userId);
      const timezone = 'Asia/Jerusalem'; // Default timezone

      // Get original event date in Israel timezone
      const { DateTime } = await import('luxon');
      const originalDt = DateTime.fromJSDate(event.startTsUtc).setZone(timezone);
      const originalDate = originalDt.toFormat('dd/MM/yyyy'); // e.g., "08/10/2025"

      const intent = await nlp.parseIntent(
        `עדכן את ${event.title} ל-${originalDate} ${normalizedText}`, // Include original date + new time
        contacts,
        timezone,
        []
      );

      if (intent.intent === 'update_event' && intent.event?.date) {
        // Parse the new date/time
        const dateQuery = parseDateFromNLP(intent.event, 'quickTimeUpdate');

        if (dateQuery.date) {
          await this.eventService.updateEvent(eventId, userId, {
            startTsUtc: dateQuery.date
          });

          // React with ✅
          await this.reactToLastMessage(userId, '✅');

          logger.info('Quick time update completed', { userId, eventId, newTime: dateQuery.date });
          return true; // Successfully handled
        }
      }

      // If NLP couldn't parse time, let normal flow handle it
      return false;

    } catch (error) {
      logger.error('Quick time update failed', { userId, eventId, error });
      return false; // Let normal flow handle error
    }
  }

  /**
   * Handle delete confirmation response
   * Phase 2.3: User is responding to delete confirmation prompt
   */
  private async handleDeleteConfirmation(phone: string, userId: string, text: string, deleteConfirmRaw: string): Promise<boolean> {
    try {
      const confirmData = JSON.parse(deleteConfirmRaw);
      const { eventId, eventTitle } = confirmData;

      const normalized = text.trim().toLowerCase();

      // Check for confirmation
      if (normalized === 'כן' || normalized === 'yes' || normalized === 'אישור') {
        // Clear confirmation flag
        await redis.del(`temp:delete_confirm:${userId}`);

        // Delete the event
        await this.eventService.deleteEvent(eventId, userId);

        // React with ✅ (deletion successful - green checkmark for completed action)
        await this.reactToLastMessage(userId, '✅');

        // Phase 3.3: Analytics - track delete confirmation
        logger.info('[ANALYTICS] Quick delete confirmed', {
          analytics: 'delete_confirmed',
          userId,
          eventId,
          eventTitle
        });

        return true; // Successfully handled
      }

      // Check for cancellation
      if (normalized === 'לא' || normalized === 'no' || normalized === 'cancel' || normalized === 'ביטול') {
        // Clear confirmation flag
        await redis.del(`temp:delete_confirm:${userId}`);

        await this.sendMessage(phone, 'ℹ️ המחיקה בוטלה.');

        // Phase 3.3: Analytics - track delete cancellation
        logger.info('[ANALYTICS] Quick delete cancelled', {
          analytics: 'delete_cancelled',
          userId,
          eventId,
          eventTitle
        });

        return true; // Successfully handled
      }

      // If user said something else, prompt again
      await this.sendMessage(phone, 'אנא שלח "כן" לאישור מחיקה או "לא" לביטול');
      return true; // Handled (waiting for proper response)

    } catch (error) {
      logger.error('Failed to handle delete confirmation', { userId, error });
      // Clear confirmation on error
      await redis.del(`temp:delete_confirm:${userId}`);
      await this.sendMessage(phone, '❌ שגיאה. נסה שוב.');
      return true; // Handled (even if failed)
    }
  }
}

// Export factory function
import stateManager from './StateManager.js';
import authService from './AuthService.js';
import eventService from './EventService.js';
import reminderService from './ReminderService.js';
import contactService from './ContactService.js';
import settingsService from './SettingsService.js';
import taskService from './TaskService.js';

export const createMessageRouter = (messageProvider: IMessageProvider): MessageRouter => {
  return new MessageRouter(
    stateManager,
    authService,
    eventService,
    reminderService,
    contactService,
    settingsService,
    taskService,
    messageProvider
  );
};

export default MessageRouter;
