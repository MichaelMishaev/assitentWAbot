import { StateManager } from '../services/StateManager.js';
import { EventService } from '../services/EventService.js';
import { ReminderService } from '../services/ReminderService.js';
import { TaskService } from '../services/TaskService.js';
import { SettingsService } from '../services/SettingsService.js';
import { MorningSummaryService } from '../services/MorningSummaryService.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';
import { ConversationState, MenuDisplayMode } from '../types/index.js';
import { proficiencyTracker } from '../services/ProficiencyTracker.js';
import logger from '../utils/logger.js';
import { AuthRouter } from './AuthRouter.js';

/**
 * CommandRouter - Handles command routing and menu display
 * Extracted from MessageRouter to separate concerns
 */
export class CommandRouter {
  constructor(
    private stateManager: StateManager,
    private eventService: EventService,
    private reminderService: ReminderService,
    private taskService: TaskService,
    private settingsService: SettingsService,
    private messageProvider: IMessageProvider,
    private authRouter: AuthRouter,
    private sendMessage: (to: string, message: string) => Promise<string>
  ) {}

  /**
   * Handle command routing - main entry point
   */
  async handleCommand(from: string, command: string): Promise<void> {
    let cmd = command.trim().toLowerCase();

    // Normalize commands - add "/" if missing
    if (!cmd.startsWith('/') && this.isCommand(command)) {
      cmd = '/' + cmd;
    }
    const authState = await this.authRouter.getAuthState(from);
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

      case '/test':
      case '/בדיקה':
        if (!userId) {
          await this.sendMessage(from, 'אנא התחבר תחילה.');
          return;
        }
        await this.handleTestCommand(from, userId);
        break;

      default:
        await this.sendMessage(from, 'פקודה לא מוכרת. שלח /עזרה לרשימת פקודות.');
    }
  }

  /**
   * Check if a string is a valid command
   */
  private isCommand(text: string): boolean {
    const trimmed = text.trim();
    const commandsWithoutSlash = ['תפריט', 'menu', 'ביטול', 'cancel', 'עזרה', 'help', 'התנתק', 'logout', 'test', 'בדיקה'];
    return commandsWithoutSlash.some(cmd => trimmed === cmd || trimmed.toLowerCase() === cmd);
  }

  /**
   * Show help message
   */
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

  /**
   * Handle logout command
   */
  private async handleLogout(phone: string, userId: string): Promise<void> {
    await this.authRouter.clearAuthState(phone);
    await this.stateManager.clearState(userId);
    await this.sendMessage(phone, 'התנתקת בהצלחה. להתראות! 👋');
  }

  /**
   * Handle test command - Sends morning reminder for QA testing
   */
  private async handleTestCommand(phone: string, userId: string): Promise<void> {
    try {
      logger.info('Test command received', { userId, phone });

      // Create MorningSummaryService instance
      const morningSummaryService = new MorningSummaryService();

      // Generate the morning summary
      const summaryMessage = await morningSummaryService.generateSummaryForUser(userId);

      // Check if user has any events/reminders
      if (summaryMessage === null) {
        await this.sendMessage(phone, '📌 אין לך אירועים או תזכורות להיום.\n\n✨ נהנה מיום פנוי!');
        logger.info('Test morning summary - no events or reminders', { userId, phone });
        return;
      }

      // Send the summary
      await this.sendMessage(phone, summaryMessage);

      logger.info('Test morning summary sent successfully', { userId, phone });
    } catch (error) {
      logger.error('Failed to send test morning summary', { userId, phone, error });
      await this.sendMessage(phone, '❌ שגיאה בשליחת תזכורת הבוקר לבדיקה. אנא נסה שוב מאוחר יותר.');
    }
  }

  /**
   * Show main menu
   */
  async showMainMenu(phone: string): Promise<void> {
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
  async showAdaptiveMenu(
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
}
