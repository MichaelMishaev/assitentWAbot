import { StateManager } from '../services/StateManager.js';
import { EventService } from '../services/EventService.js';
import { ReminderService } from '../services/ReminderService.js';
import { TaskService } from '../services/TaskService.js';
import { SettingsService } from '../services/SettingsService.js';
import { MorningSummaryService } from '../services/MorningSummaryService.js';
import { AuthService } from '../services/AuthService.js';
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
    private authService: AuthService,
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

      case '/intro':
      case '/הקדמה':
        if (!userId) {
          await this.sendMessage(from, 'אנא התחבר תחילה.');
          return;
        }
        await this.showIntro(from, userId);
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
    const commandsWithoutSlash = ['תפריט', 'menu', 'ביטול', 'cancel', 'עזרה', 'help', 'התנתק', 'logout', 'test', 'בדיקה', 'intro', 'הקדמה'];
    return commandsWithoutSlash.some(cmd => trimmed === cmd || trimmed.toLowerCase() === cmd);
  }

  /**
   * Show help message
   */
  private async showHelp(phone: string): Promise<void> {
    const help = `🤖 מדריך שימוש מלא - ברוכים הבאים!

━━━━━━━━━━━━━━━━━━━━━━
📱 תכונות עיקריות
━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 📅 ניהול אירועים
   • צפייה באירועים (היום/מחר/שבוע/הכל)
   • יצירת אירוע חדש
   • עריכה ומחיקת אירועים
   • חיפוש אירועים
   • תמיכה בלוח עברי (ו' אדר, ט"ו שבט)

2️⃣ ⏰ תזכורות חכמות
   • תזכורת ליום ושעה מסוימים
   • תזכורת עם זמן הכנה מראש
   • דוגמאות: "3 שעות לפני", "חצי שעה לפני"
   • ניהול תזכורות קיימות

3️⃣ ✅ ניהול משימות
   • יצירת משימות עם עדיפויות
   • סימון משימות כהושלמו
   • מעקב אחר התקדמות
   • סטטיסטיקות משימות

4️⃣ 🌅 סיכום בוקר אוטומטי
   • כל יום ב-7:00 בבוקר
   • סיכום האירועים והתזכורות של היום
   • לבדיקה: שלח /test או /בדיקה

5️⃣ 📊 דוח אישי מעוצב (HTML Dashboard)
   • תצוגת HTML מעוצבת ואינטראקטיבית
   • כל האירועים, תזכורות ומשימות שלך
   • פשוט כתוב: "create personal report"
   • תקבל קישור אישי לדוח המעוצב

6️⃣ ⚙️ הגדרות מתקדמות
   • שפה (עברית/English)
   • אזור זמן (ירושלים/ניו יורק/לונדון/ועוד)
   • העדפות תצוגה

━━━━━━━━━━━━━━━━━━━━━━
💬 שפה טבעית - דבר איתי!
━━━━━━━━━━━━━━━━━━━━━━

אתה יכול פשוט לכתוב בעברית רגילה:

✨ דוגמאות אירועים:
• "קבע פגישה עם דני מחר ב-3"
• "הוסף ארוחת ערב ביום רביעי 19:00"
• "ליד יש פגישת רופא ב-15 לחודש"
• "יום הולדת של אבא ב-20 בינואר"

✨ דוגמאות תזכורות:
• "תזכיר לי להתקשר לאמא ביום רביעי"
• "תזכורת לפגישה 30 דקות לפני"
• "תזכיר לי להוציא זבל ב-18:00"

✨ דוגמאות שאילתות:
• "מה יש לי היום?"
• "מה יש לי מחר?"
• "תן לי דף סיכום"
• "רוצה לראות הכל"
• "מה התוכניות לשבוע הבא?"
• "create personal report" - דוח HTML מעוצב 📊

━━━━━━━━━━━━━━━━━━━━━━
⚡ פקודות מהירות
━━━━━━━━━━━━━━━━━━━━━━

/תפריט או /menu
↳ חזרה לתפריט הראשי

/ביטול או /cancel
↳ ביטול פעולה נוכחית וחזרה לתפריט

/עזרה או /help
↳ הצגת מדריך זה

/test או /בדיקה
↳ תצוגה מקדימה של סיכום הבוקר

/התנתק או /logout
↳ יציאה מהחשבון

━━━━━━━━━━━━━━━━━━━━━━
🎯 מדריך מהיר למתחילים
━━━━━━━━━━━━━━━━━━━━━━

📝 ליצור אירוע:
1. שלח /תפריט
2. בחר 2 (הוסף אירוע)
3. או פשוט כתוב: "פגישה מחר ב-3"

👀 לראות אירועים:
• כתוב: "מה יש לי היום?"
• או: /תפריט → 1 → בחר תקופה

⏰ להוסיף תזכורת:
• כתוב: "תזכיר לי מחר ב-10"
• או: /תפריט → 3

━━━━━━━━━━━━━━━━━━━━━━
🔧 טיפים מתקדמים
━━━━━━━━━━━━━━━━━━━━━━

⏱️ תזכורות חכמות:
• "3 שעות לפני" - תזכורת עם זמן הכנה
• "חצי שעה לפני" - תזכורת קצרה
• "יום לפני" - תזכורת יום מראש

📅 תאריכים גמישים:
• "היום", "מחר", "מחרתיים"
• "יום ראשון הבא", "יום רביעי"
• "השבוע", "השבוע הבא"
• DD/MM/YYYY (לדוגמה: 15/03/2025)
• תאריכים עבריים: "ו' אדר", "ט"ו שבט"

🎯 עדיפויות במשימות:
• דחוף (🔴) - חשוב מאוד
• גבוה (🟠) - חשוב
• רגיל (🟡) - רגיל
• נמוך (🟢) - לא דחוף

━━━━━━━━━━━━━━━━━━━━━━
🐛 דיווח על בעיות ורעיונות
━━━━━━━━━━━━━━━━━━━━━━

מצאת באג או יש לך רעיון לשיפור?

📝 פשוט שלח הודעה שמתחילה ב-#:

דוגמאות:
• "# התאריך לא מוצג נכון"
• "# רוצה כפתור מחיקה מהירה"
• "# התזכורת לא הגיעה בזמן"

✅ המערכת תרשום את המשוב שלך
✅ נתקן את זה במהרה!

━━━━━━━━━━━━━━━━━━━━━━
❓ שאלות נפוצות
━━━━━━━━━━━━━━━━━━━━━━

❔ איך אני משנה שפה?
→ /תפריט → 5 (הגדרות) → 1 (שפה)

❔ איך אני רואה את הלוח שלי?
→ בקש "תן לי דף סיכום" או "רוצה לראות הכל"

❔ איך אני מבטל פעולה?
→ בכל שלב שלח /ביטול

❔ איך עובד סיכום הבוקר?
→ כל יום ב-7:00 תקבל סיכום אוטומטי
→ לבדיקה שלח /test

❔ הבוט לא מבין אותי?
→ נסה לכתוב בצורה פשוטה יותר
→ או השתמש בתפריט: /תפריט

━━━━━━━━━━━━━━━━━━━━━━

💡 זכור: אתה יכול לדבר איתי בשפה טבעית!
לא צריך לזכור פקודות - פשוט כתוב מה שאתה רוצה.

שאלות? שלח /עזרה או כתוב לי! 😊`;

    await this.sendMessage(phone, help);
  }

  /**
   * Show onboarding intro message (same as new user registration)
   */
  private async showIntro(phone: string, userId: string): Promise<void> {
    try {
      // Get user's name
      const user = await this.authService.getUserByPhone(phone);
      const name = user?.name || 'משתמש';

      const introMessage = `👋 ברוך הבא, ${name}!

אני עוזר הווטסאפ החכם שלך לניהול יומן ותזכורות 🤖

🎯 מה אני יכול לעשות עבורך:
• ניהול אירועים ופגישות 📅
• תזכורות חכמות עם זמן הכנה ⏰
• משימות עם עדיפויות ✅
• סיכום בוקר יומי אוטומטי 🌅
• דוח אישי מעוצב HTML 📊

💬 דבר אליי בשפה טבעית:
• "צור אירוע מחר בשעה 3 - פגישה עם דני"
• "תזכיר לי להתקשר לרופא מחר ב-10:00"
• "מה יש לי היום?"
• "צור לי דוח אישי" - קבל קישור לדוח HTML מעוצב

📋 תפריט: שלח /תפריט
💡 עזרה: שלח /עזרה`;

      await this.sendMessage(phone, introMessage);
    } catch (error) {
      logger.error('Failed to show intro', { phone, userId, error });
      await this.sendMessage(phone, 'אירעה שגיאה. נסה שוב מאוחר יותר.');
    }
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

1) 📅 היומן שלי
2) ➕ אירוע חדש
3) ⏰ תזכורת
4) ✅ משימות
5) ⚙️ הגדרות
6) ❓ עזרה

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
