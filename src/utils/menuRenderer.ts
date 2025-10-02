/**
 * Menu Renderer
 * Renders Hebrew menus for WhatsApp bot navigation
 */

/**
 * Renders the main menu in Hebrew
 * @returns Formatted main menu string
 */
export function renderMainMenu(): string {
  return `תפריט ראשי

1) 📅 האירועים שלי
2) ➕ הוסף אירוע
3) ⏰ הוסף תזכורת
4) ✅ משימות (בקרוב)
5) 👨‍👩‍👧 אנשי קשר
6) ⚙️ הגדרות
7) 📝 ניסוח הודעה
8) ❓ עזרה

בחר מספר (1-8) או שלח /עזרה לעזרה`;
}

/**
 * Renders the help menu with usage examples and quick commands
 * @returns Formatted help menu string
 */
export function renderHelpMenu(): string {
  return `❓ עזרה

דוגמאות שימוש:
• הוסף אירוע: תפריט → 2
• צפה באירועי היום: תפריט → 1 → 1
• תזכורת חדשה: תפריט → 3

פקודות מהירות:
/תפריט - תפריט ראשי
/ביטול - ביטול פעולה
/עזרה - עזרה
/התנתק - התנתקות

טיפים:
• השתמש במספרים כדי לנווט בתפריטים
• שלח /ביטול בכל שלב כדי לבטל
• התאריכים יכולים להיות: DD/MM/YYYY, "מחר", "היום" וכו'`;
}

/**
 * Renders the settings menu
 * @returns Formatted settings menu string
 */
export function renderSettingsMenu(): string {
  return `⚙️ הגדרות

1) 🌐 שפה (עברית/English)
2) 🕐 אזור זמן
3) ↩️ חזרה לתפריט ראשי

בחר מספר (1-3)`;
}

/**
 * Renders the events viewing submenu
 * @returns Formatted events menu string
 */
export function renderEventsMenu(): string {
  return `📅 האירועים שלי

איזה אירועים להציג?

1) 📆 היום
2) 📆 מחר
3) 📆 השבוע
4) 📆 הכל (הבאים)
5) 🔍 חיפוש אירוע
6) ↩️ חזרה לתפריט ראשי

בחר מספר (1-6)`;
}

/**
 * Renders the language selection menu
 * @returns Formatted language menu string
 */
export function renderLanguageMenu(): string {
  return `🌐 בחירת שפה / Language Selection

1) 🇮🇱 עברית
2) 🇺🇸 English
3) ↩️ חזרה להגדרות

בחר מספר / Select number (1-3)`;
}

/**
 * Renders the timezone selection menu
 * @returns Formatted timezone menu string
 */
export function renderTimezoneMenu(): string {
  return `🕐 בחירת אזור זמן

1) 🇮🇱 ירושלים (GMT+2/+3)
2) 🇺🇸 ניו יורק (GMT-5/-4)
3) 🇬🇧 לונדון (GMT+0/+1)
4) 🇪🇺 פריז/ברלין (GMT+1/+2)
5) 🇦🇪 דובאי (GMT+4)
6) ↩️ חזרה להגדרות

בחר מספר (1-6)`;
}

/**
 * Renders the contacts menu
 * @returns Formatted contacts menu string
 */
export function renderContactsMenu(): string {
  return `👨‍👩‍👧 אנשי קשר

1) 📋 הצג אנשי קשר
2) ➕ הוסף איש קשר
3) ❌ מחק איש קשר
4) ↩️ חזרה לתפריט ראשי

בחר מספר (1-4)`;
}

/**
 * Renders the reminders menu
 * @returns Formatted reminders menu string
 */
export function renderRemindersMenu(): string {
  return `⏰ תזכורות

1) 📋 הצג תזכורות פעילות
2) ➕ הוסף תזכורת חדשה
3) ❌ בטל תזכורת
4) ↩️ חזרה לתפריט ראשי

בחר מספר (1-4)`;
}

/**
 * Renders a confirmation prompt
 * @param action The action to confirm
 * @returns Formatted confirmation string
 */
export function renderConfirmation(action: string): string {
  return `${action}

האם אתה בטוח? (כן/לא)`;
}

/**
 * Renders a success message
 * @param message The success message
 * @returns Formatted success string
 */
export function renderSuccess(message: string): string {
  return `✅ ${message}`;
}

/**
 * Renders an error message
 * @param message The error message
 * @returns Formatted error string
 */
export function renderError(message: string): string {
  return `❌ ${message}`;
}

/**
 * Renders a warning message
 * @param message The warning message
 * @returns Formatted warning string
 */
export function renderWarning(message: string): string {
  return `⚠️ ${message}`;
}

/**
 * Renders a loading/processing message
 * @returns Formatted processing string
 */
export function renderProcessing(): string {
  return `⏳ רגע, מעבד...`;
}

/**
 * Renders a cancellation message
 * @returns Formatted cancellation string
 */
export function renderCancellation(): string {
  return `🔙 הפעולה בוטלה. חזרה לתפריט הראשי.`;
}
