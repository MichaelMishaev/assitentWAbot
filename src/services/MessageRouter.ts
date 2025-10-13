import { StateManager } from './StateManager.js';
import { AuthService } from './AuthService.js';
import { EventService } from './EventService.js';
import { ReminderService } from './ReminderService.js';
import { ContactService } from './ContactService.js';
import { SettingsService } from './SettingsService.js';
import { TaskService } from './TaskService.js';
import { proficiencyTracker } from './ProficiencyTracker.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';
import { ConversationState, AuthState } from '../types/index.js';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { prodMessageLogger } from '../utils/productionMessageLogger.js';
import { logDevComment, isDevComment } from '../utils/devCommentLogger.js';
import { parseHebrewDate } from '../utils/hebrewDateParser.js';
import { safeParseDate } from '../utils/dateValidator.js';
import { DateTime } from 'luxon';
import { AuthRouter } from '../routing/AuthRouter.js';
import { CommandRouter } from '../routing/CommandRouter.js';
import { NLPRouter } from '../routing/NLPRouter.js';
import { StateRouter } from '../routing/StateRouter.js';

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
 * MessageRouter - Main Coordinator (Refactored Architecture)
 *
 * **Architecture Overview:**
 * MessageRouter acts as a slim coordinator that delegates routing logic to specialized routers.
 * This refactoring reduces MessageRouter from 5,130 lines to ~1,100 lines (78% reduction).
 *
 * **Routing Flow:**
 * 1. Authentication → AuthRouter (registration, login, PIN verification)
 * 2. Commands (/menu, /cancel, etc.) → CommandRouter
 * 3. Conversation States (ADDING_EVENT_NAME, etc.) → StateRouter (51+ state handlers)
 * 4. Natural Language → NLPRouter (intent parsing, event/reminder creation)
 *
 * **MessageRouter Responsibilities (Coordinator):**
 * - Message deduplication (prevent duplicate processing)
 * - Main routing decision tree (auth → command → state → NLP)
 * - Quick action handling (reply-to-message shortcuts)
 * - Shared helper methods (sendMessage, reactToLastMessage, etc.)
 * - Message/event mapping infrastructure (for quick actions)
 *
 * **Delegated Responsibilities (to Specialized Routers):**
 * - AuthRouter: All authentication flows (registration, login, PIN)
 * - CommandRouter: All /command handling, menu display
 * - StateRouter: All 51+ conversation state handlers (events, reminders, tasks, settings)
 * - NLPRouter: All natural language processing and intent handling
 *
 * **Refactoring History:**
 * - Baseline: 5,130 lines (monolithic god class)
 * - Phase 2: Extracted AuthRouter (263 lines)
 * - Phase 3: Extracted CommandRouter (230 lines)
 * - Phase 4: Extracted NLPRouter (1,516 lines)
 * - Phase 5: Extracted StateRouter (2,519 lines)
 * - Phase 6: Current state (~1,100 lines coordinator)
 *
 * @see {@link AuthRouter} - Authentication flow handling
 * @see {@link CommandRouter} - Command routing and menu display
 * @see {@link StateRouter} - State machine handlers (51+ methods)
 * @see {@link NLPRouter} - Natural language intent processing
 */
export class MessageRouter {
  private authRouter: AuthRouter;
  private commandRouter: CommandRouter;
  private nlpRouter: NLPRouter;
  private stateRouter: StateRouter;

  constructor(
    private stateManager: StateManager,
    private authService: AuthService,
    private eventService: EventService,
    private reminderService: ReminderService,
    private contactService: ContactService,
    private settingsService: SettingsService,
    private taskService: TaskService,
    private messageProvider: IMessageProvider
  ) {
    // Initialize AuthRouter with required dependencies
    this.authRouter = new AuthRouter(
      authService,
      stateManager,
      messageProvider,
      redis
    );

    // Initialize CommandRouter with required dependencies
    this.commandRouter = new CommandRouter(
      stateManager,
      eventService,
      reminderService,
      taskService,
      settingsService,
      messageProvider,
      this.authRouter,
      this.sendMessage.bind(this)
    );

    // Initialize NLPRouter with required dependencies
    this.nlpRouter = new NLPRouter(
      stateManager,
      authService,
      eventService,
      reminderService,
      contactService,
      messageProvider,
      this.commandRouter,
      this.sendMessage.bind(this),
      this.reactToLastMessage.bind(this),
      this.storeMessageEventMapping.bind(this),
      this.sendQuickActionHint.bind(this)
    );

    // Initialize StateRouter with required dependencies
    this.stateRouter = new StateRouter(
      stateManager,
      eventService,
      reminderService,
      taskService,
      settingsService,
      this.commandRouter,
      this.sendMessage.bind(this),
      this.reactToLastMessage.bind(this),
      this.storeMessageEventMapping.bind(this),
      this.showRecurringUpdateOptions.bind(this),
      this.confirmReminderUpdate.bind(this)
    );

    // Set callback for showing menu after authentication
    this.authRouter.setShowMenuCallback(async (phone: string) => {
      await this.commandRouter.showMainMenu(phone);
    });
  }

  /**
   * Main routing function - Entry point for all incoming messages
   *
   * **Flow:**
   * 1. Message deduplication (prevent duplicate processing via Redis)
   * 2. Quick action detection (reply-to-message shortcuts)
   * 3. Delete confirmation handling (safety prompts)
   * 4. Command routing (/menu, /cancel, etc.) → CommandRouter
   * 5. Authentication check → AuthRouter (if not authenticated)
   * 6. State-based routing → StateRouter or NLPRouter
   *
   * **Parameters:**
   * @param from - User's phone number (WhatsApp format: 972XXXXXXXXX@s.whatsapp.net)
   * @param text - Message text content
   * @param messageId - Unique message ID (for deduplication and reactions)
   * @param quotedMessage - Quoted message info (for reply-to-message quick actions)
   *
   * **Quick Actions:**
   * Users can reply to bot messages with:
   * - "מחק" / "delete" → Delete event
   * - "20:00" / "8 בערב" → Update event time
   * - "מחק 2" → Delete event #2 (when multiple events shown)
   *
   * **Deduplication:**
   * Uses Redis with atomic SET NX to prevent race conditions during message processing.
   * Processing lock expires after 30 minutes, processed flag persists for 24 hours.
   *
   * @throws Never throws - all errors are caught and handled gracefully
   */
  async routeMessage(from: string, text: string, messageId?: string, quotedMessage?: { messageId: string; participant?: string }): Promise<void> {
    try {
      logger.info('Routing message', { from, text, messageId, quotedMessage });

      // COST PROTECTION: Emergency daily API call limit (prevent cost disasters like Railway crash loop)
      // Added after ₪461 incident where Railway crash loop caused 19,335 API calls in 24 hours
      const dailyCostKey = `api:calls:daily:${new Date().toISOString().split('T')[0]}`;
      const dailyCalls = await redis.incr(dailyCostKey);
      await redis.expire(dailyCostKey, 86400); // 24 hour expiry

      const DAILY_LIMIT = 5000; // Max 5,000 API calls/day (~$7.50 cost limit)

      if (dailyCalls > DAILY_LIMIT) {
        logger.error('🚨 EMERGENCY: Daily API limit reached!', {
          dailyCalls,
          limit: DAILY_LIMIT,
          estimatedCost: `$${(dailyCalls * 0.0015).toFixed(2)}`
        });

        // Alert admin (your number) once per day
        const alertKey = `api:alert:sent:${new Date().toISOString().split('T')[0]}`;
        const alertSent = await redis.get(alertKey);

        if (!alertSent) {
          await this.messageProvider.sendMessage(
            '972544345287', // Your phone number
            `🚨 EMERGENCY COST LIMIT!\n\n` +
            `Daily API calls: ${dailyCalls}/${DAILY_LIMIT}\n` +
            `Estimated cost: $${(dailyCalls * 0.0015).toFixed(2)}\n\n` +
            `Bot is PAUSED until tomorrow to prevent cost spike.\n\n` +
            `To restart: Delete Redis key "${dailyCostKey}"`
          );
          await redis.setex(alertKey, 86400, '1');
        }

        // Return without processing (bot is paused)
        return;
      }

      // Log every 500 calls to monitor usage
      if (dailyCalls % 500 === 0) {
        logger.warn(`📊 API Usage Warning: ${dailyCalls} calls today ($${(dailyCalls * 0.0015).toFixed(2)} estimated)`);
      }

      // DEVELOPER COMMENT DETECTION: Check if message is a dev comment (starts with #)
      // These are treated as notes/bug reports and logged separately for later analysis
      if (isDevComment(text)) {
        // Get user info if available
        let user = await this.authService.getUserByPhone(from);
        const session = user ? await this.stateManager.getState(user.id) : null;

        // Log the dev comment to dedicated log file
        logDevComment(
          user?.id,
          from,
          text,
          messageId,
          session?.state || 'UNAUTHENTICATED'
        );

        // Acknowledge the comment silently (no response to user)
        // The bot will NOT respond to # comments - they're just logged
        logger.info('Dev comment logged', { userId: user?.id, phone: from, commentLength: text.length });

        // Mark as processed and exit early (don't process as normal message)
        if (messageId) {
          await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
        }
        return;
      }

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

        // ATOMIC CHECK-AND-SET: Use SET NX (set if not exists) to prevent race conditions
        // This ensures only ONE process can successfully acquire the processing lock
        // Returns 'OK' if successful, null if key already exists
        const acquired = await redis.set(
          processingKey,
          Date.now().toString(),
          'EX',
          1800,  // 30 min expiry for safety
          'NX'   // Only set if key doesn't exist (atomic)
        );

        if (!acquired) {
          // Another process is already processing this message
          logger.info('Message already being processed (race condition prevented)', { messageId, from });
          return;
        }

        logger.debug('Acquired processing lock for message', { messageId });
      }

      // Retrieve user once and reuse throughout
      let user = await this.authService.getUserByPhone(from);

      // Log incoming message to production logger
      if (user && messageId) {
        const session = await this.stateManager.getState(user.id);
        prodMessageLogger.logIncomingMessage({
          messageId,
          userId: user.id,
          phone: from,
          messageText: text,
          conversationState: session?.state || ConversationState.MAIN_MENU,
          metadata: { quotedMessage }
        });
      }

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

      const authState = await this.authRouter.getAuthState(from);

      if (authState && !authState.authenticated) {
        await this.authRouter.handleAuthFlow(from, text, authState);
        // Mark as processed
        if (messageId) {
          await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
          await redis.del(`msg:processing:${messageId}`);
        }
        return;
      }

      if (!user) {
        await this.authRouter.startRegistration(from);
        // Mark as processed
        if (messageId) {
          await redis.setex(`msg:processed:${messageId}`, 86400, Date.now().toString());
          await redis.del(`msg:processing:${messageId}`);
        }
        return;
      }

      if (!authState || !authState.authenticated) {
        await this.authRouter.startLogin(from);
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
    await this.commandRouter.handleCommand(from, command);
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
    // Handle MAIN_MENU state here (not delegated to StateRouter)
    if (state === ConversationState.IDLE || state === ConversationState.MAIN_MENU) {
      await this.handleMainMenuChoice(phone, userId, text);
      return;
    }

    // Delegate all other states to StateRouter
    await this.stateRouter.handleStateMessage(phone, userId, state, text);
  }


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
          await this.commandRouter.handleCommand(phone, '/help');
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
        // Switch to ADDING_EVENT_TIME state and delegate to StateRouter
        await this.stateManager.setState(userId, ConversationState.ADDING_EVENT_TIME, session.context);
        await this.stateRouter.handleStateMessage(phone, userId, ConversationState.ADDING_EVENT_TIME, text);
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
    await this.nlpRouter.handleNLPMessage(phone, userId, text);
  }


  // ========== NLP HANDLERS - EXTRACTED TO NLPRouter.ts ==========
  // All NLP handling methods have been moved to NLPRouter.ts for better separation of concerns
  // The following methods are now in NLPRouter:
  // - handleNLPMessage
  // - handleNLPCreateEvent
  // - handleNLPCreateReminder
  // - handleNLPSearchEvents
  // - handleNLPDeleteEvent
  // - handleNLPDeleteReminder
  // - handleNLPUpdateEvent
  // - handleNLPUpdateReminder
  // - handleNLPListReminders
  // - handleNLPAddComment
  // - handleNLPViewComments
  // - handleNLPDeleteComment
  // - handleGenerateDashboard

  // ========== MESSAGE SENDING HELPERS ==========

  private async sendMessage(to: string, message: string): Promise<string> {
    try {
      const startTime = Date.now();
      const messageId = await this.messageProvider.sendMessage(to, message);
      const processingTime = Date.now() - startTime;
      logger.debug('Message sent', { to, messageId, messageLength: message.length });

      // Track assistant message in conversation history
      try {
        const authState = await this.authRouter.getAuthState(to);
        if (authState?.userId) {
          await this.stateManager.addToHistory(authState.userId, 'assistant', message);

          // Log outgoing message to production logger
          const session = await this.stateManager.getState(authState.userId);
          prodMessageLogger.logOutgoingMessage({
            messageId,
            userId: authState.userId,
            phone: to,
            messageText: message,
            conversationState: session?.state || ConversationState.MAIN_MENU,
            processingTime
          });
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

  // ========== REPLY-TO-MESSAGE HELPERS (Phase 1.2) ==========

  /**
   * Store mapping between sent message ID and event ID(s)
   * Allows users to reply to event messages for quick actions
   * TTL: 7 days (extended from 24h to prevent "event not found" errors)
   */
  private async storeMessageEventMapping(messageId: string, eventIds: string | string[]): Promise<void> {
    try {
      const key = `msg:event:${messageId}`;
      const value = Array.isArray(eventIds) ? JSON.stringify(eventIds) : eventIds;
      await redis.setex(key, 604800, value); // 7 days TTL (was 24h - user feedback: events not found after 1 day)
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

  // ========== SHARED NLP HELPER METHODS ==========
  // These methods are used by both conversation state handlers and NLP router

  /**
   * Parse date from NLP intent - handles both ISO dates and Hebrew date text
   */
  private parseDateFromNLP(event: any, context: string): { date: Date | null; isWeekRange: boolean; isMonthRange: boolean; rangeStart?: Date; rangeEnd?: Date } {
    const result: { date: Date | null; isWeekRange: boolean; isMonthRange: boolean; rangeStart?: Date; rangeEnd?: Date } = {
      date: null,
      isWeekRange: false,
      isMonthRange: false
    };

    if (event?.dateText) {
      const dateText = event.dateText.toLowerCase();
      const weekKeywords = ['שבוע', 'השבוע', 'בשבוע', 'לשבוע'];
      const isWeekQuery = weekKeywords.some(keyword => dateText.includes(keyword));
      const monthKeywords = ['חודש', 'החודש', 'בחודש'];
      const isMonthQuery = monthKeywords.some(keyword => dateText.includes(keyword));

      const hebrewResult = parseHebrewDate(event.dateText);
      if (hebrewResult.success && hebrewResult.date) {
        result.date = hebrewResult.date;
        if (isWeekQuery) {
          result.isWeekRange = true;
          const dt = DateTime.fromJSDate(hebrewResult.date).setZone('Asia/Jerusalem');
          result.rangeStart = dt.startOf('week').toJSDate();
          result.rangeEnd = dt.endOf('week').toJSDate();
        } else if (isMonthQuery) {
          result.isMonthRange = true;
          const dt = DateTime.fromJSDate(hebrewResult.date).setZone('Asia/Jerusalem');
          result.rangeStart = dt.startOf('month').toJSDate();
          result.rangeEnd = dt.endOf('month').toJSDate();
        }
        return result;
      }
    }

    if (event?.date) {
      const isoDate = safeParseDate(event.date, context);
      if (isoDate) {
        result.date = isoDate;
        return result;
      }
    }

    return result;
  }

  private async showRecurringUpdateOptions(phone: string, userId: string, reminder: any, newDateTime: Date): Promise<void> {
    const dt = DateTime.fromJSDate(reminder.dueTsUtc).setZone('Asia/Jerusalem');
    const newDt = DateTime.fromJSDate(newDateTime).setZone('Asia/Jerusalem');

    const now = DateTime.now().setZone('Asia/Jerusalem');
    let nextOccurrence = dt;

    if (dt < now) {
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

      // Use V2 Pipeline to parse the new time from user's text
      const { pipelineOrchestrator } = await import('../domain/orchestrator/PipelineOrchestrator.js');

      const timezone = 'Asia/Jerusalem'; // Default timezone

      // Get original event date in Israel timezone
      const { DateTime } = await import('luxon');
      const originalDt = DateTime.fromJSDate(event.startTsUtc).setZone(timezone);
      const originalDate = originalDt.toFormat('dd/MM/yyyy'); // e.g., "08/10/2025"

      // Create IncomingMessage for V2 Pipeline
      const incomingMessage = {
        from: phone,
        messageId: `quick-time-${Date.now()}`,
        timestamp: Date.now(),
        content: {
          text: `עדכן את ${event.title} ל-${originalDate} ${normalizedText}` // Include original date + new time
        },
        isFromMe: false
      };

      // Execute V2 Pipeline
      const result = await pipelineOrchestrator.execute(incomingMessage, userId, timezone);

      if (result.intent === 'update_event' && result.entities?.date) {
        // Parse the new date/time
        const dateQuery = this.parseDateFromNLP({ date: result.entities.date, dateText: result.entities.dateText }, 'quickTimeUpdate');

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

        // Send success message with event title (UX improvement from user feedback)
        await this.sendMessage(phone, `✅ האירוע "${eventTitle}" נמחק בהצלחה`);

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
