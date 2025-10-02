import { DateTime } from 'luxon';

interface ParseResult {
  success: boolean;
  date: Date | null;
  error?: string;
}

/**
 * Parses Hebrew date keywords and DD/MM/YYYY format into Date objects
 * @param input - Hebrew keyword or date string
 * @param timezone - Timezone for date calculation (default: Asia/Jerusalem)
 * @returns ParseResult with success status, date, and optional error
 */
export function parseHebrewDate(
  input: string,
  timezone: string = 'Asia/Jerusalem'
): ParseResult {
  const trimmedInput = input.trim();

  // Get current date in the specified timezone
  const now = DateTime.now().setZone(timezone).startOf('day');

  // Hebrew keywords mapping
  const keywords: Record<string, () => DateTime> = {
    // Single day keywords
    'היום': () => now,
    'מחר': () => now.plus({ days: 1 }),
    'מחרתיים': () => now.plus({ days: 2 }),
    'סופש': () => getNextWeekday(now, 6), // Saturday

    // Week keywords - ALL VARIATIONS
    'השבוע': () => now.startOf('week'), // This week (Monday)
    'השבוע הזה': () => now.startOf('week'),
    'בשבוע': () => now.startOf('week'),
    'בשבוע הזה': () => now.startOf('week'),
    'לשבוע': () => now.startOf('week'),

    'שבוע הבא': () => now.plus({ weeks: 1 }).startOf('week'), // Next week (next Monday)
    'בשבוע הבא': () => now.plus({ weeks: 1 }).startOf('week'),
    'לשבוע הבא': () => now.plus({ weeks: 1 }).startOf('week'),
    'שבוע הקרוב': () => now.plus({ weeks: 1 }).startOf('week'), // USER'S QUERY!
    'בשבוע הקרוב': () => now.plus({ weeks: 1 }).startOf('week'),

    // Month keywords
    'החודש': () => now.startOf('month'),
    'החודש הזה': () => now.startOf('month'),
    'בחודש': () => now.startOf('month'),
    'חודש הבא': () => now.plus({ months: 1 }).startOf('month'),
    'בחודש הבא': () => now.plus({ months: 1 }).startOf('month'),
  };

  // Check for direct keyword match
  if (keywords[trimmedInput]) {
    const date = keywords[trimmedInput]();
    return {
      success: true,
      date: date.toJSDate(),
    };
  }

  // Hebrew day names (Sunday=0 to Saturday=6)
  const hebrewDays: Record<string, number> = {
    'ראשון': 0,
    'שני': 1,
    'שלישי': 2,
    'רביעי': 3,
    'חמישי': 4,
    'שישי': 5,
    'שבת': 6,
  };

  // Check for day name with "יום" prefix
  const dayWithPrefix = trimmedInput.replace(/^יום\s+/, '');
  if (hebrewDays.hasOwnProperty(dayWithPrefix)) {
    const targetDay = hebrewDays[dayWithPrefix];
    const date = getNextWeekday(now, targetDay);
    return {
      success: true,
      date: date.toJSDate(),
    };
  }

  // Check for day name without "יום" prefix
  if (hebrewDays.hasOwnProperty(trimmedInput)) {
    const targetDay = hebrewDays[trimmedInput];
    const date = getNextWeekday(now, targetDay);
    return {
      success: true,
      date: date.toJSDate(),
    };
  }

  // Parse DD/MM/YYYY or DD/MM format
  const dateFormatMatch = trimmedInput.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (dateFormatMatch) {
    const day = parseInt(dateFormatMatch[1], 10);
    const month = parseInt(dateFormatMatch[2], 10);
    const year = dateFormatMatch[3] ? parseInt(dateFormatMatch[3], 10) : now.year;

    // Validate date components
    if (month < 1 || month > 12) {
      return {
        success: false,
        date: null,
        error: 'חודש לא תקין. יש להזין חודש בין 1-12',
      };
    }

    if (day < 1 || day > 31) {
      return {
        success: false,
        date: null,
        error: 'יום לא תקין. יש להזין יום בין 1-31',
      };
    }

    // Create date and check if it's valid
    const parsedDate = DateTime.fromObject(
      { year, month, day },
      { zone: timezone }
    ).startOf('day');

    if (!parsedDate.isValid) {
      return {
        success: false,
        date: null,
        error: `תאריך לא תקין: ${parsedDate.invalidReason}`,
      };
    }

    // Check if date is in the past
    if (parsedDate < now) {
      return {
        success: false,
        date: null,
        error: 'לא ניתן להזין תאריך בעבר',
      };
    }

    return {
      success: true,
      date: parsedDate.toJSDate(),
    };
  }

  // No match found
  return {
    success: false,
    date: null,
    error: 'קלט לא מזוהה. נסה: היום, מחר, יום ראשון, או DD/MM/YYYY',
  };
}

/**
 * Gets the next occurrence of a specific weekday
 * @param from - Starting date
 * @param targetDay - Target day of week (0=Sunday, 6=Saturday)
 * @returns DateTime of next occurrence
 */
function getNextWeekday(from: DateTime, targetDay: number): DateTime {
  const currentDay = from.weekday % 7; // Luxon: 1=Monday, convert to 0=Sunday
  let daysToAdd = targetDay - currentDay;

  // If target day is today or in the past this week, go to next week
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }

  return from.plus({ days: daysToAdd });
}
