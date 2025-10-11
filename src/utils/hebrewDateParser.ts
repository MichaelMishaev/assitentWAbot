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

  // Extract time from input (HH:MM or "בשעה HH:MM" or "ב-HH:MM")
  let extractedTime: { hour: number; minute: number } | null = null;
  let dateInput = trimmedInput;

  // Match time patterns: "14:00", "בשעה 14:00", "ב-14:00", ", בשעה 14:00"
  const timeMatch = trimmedInput.match(/(?:,?\s*(?:בשעה|ב-?)\s*)?(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      extractedTime = { hour, minute };
      // Remove time from input for date parsing
      dateInput = trimmedInput.replace(/(?:,?\s*(?:בשעה|ב-?)\s*)?\d{1,2}:\d{2}/, '').trim();

      // DISAMBIGUATION CHECK: If ONLY time was provided with no date context
      // This helps catch cases like "16:10" where user might mean time OR date+time
      // Log for debugging user feedback: "פורמט תאריך מזהה כשעה"
      if (dateInput === '' || dateInput.length === 0) {
        // No date keyword found, only time - interpret as TODAY at this time
        // This is the most common use case: user says "16:00" meaning "today at 4 PM"
        console.warn(`[DATE_PARSER] Ambiguous time-only input: "${trimmedInput}" → interpreted as today at ${hour}:${minute}`);

        const todayWithTime = now.set({ hour, minute });

        // Safety check: if time is in the past today, assume user meant tomorrow
        const nowWithMinutes = DateTime.now().setZone(timezone);
        const finalDate = todayWithTime < nowWithMinutes
          ? todayWithTime.plus({ days: 1 })
          : todayWithTime;

        return {
          success: true,
          date: finalDate.toJSDate(),
        };
      }
    }
  }

  // Check for direct keyword match
  if (keywords[dateInput]) {
    let date = keywords[dateInput]();
    // Apply extracted time if available
    if (extractedTime) {
      date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
    }
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

  // Check for plural day names (e.g., "ימי ראשון" = "on Sundays")
  // This indicates recurring day query, return next occurrence but caller should know it's recurring
  const pluralDayMatch = dateInput.match(/^ימי\s+(.+)$/);
  if (pluralDayMatch) {
    const dayName = pluralDayMatch[1];
    if (hebrewDays.hasOwnProperty(dayName)) {
      const targetDay = hebrewDays[dayName];
      let date = getNextWeekday(now, targetDay);
      if (extractedTime) {
        date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
      }
      return {
        success: true,
        date: date.toJSDate(),
      };
    }
  }

  // Check for "ביום ראשון" = "on Sunday" (also indicates day-of-week query)
  const inDayMatch = dateInput.match(/^ב?יום\s+(.+)$/);
  if (inDayMatch) {
    const dayName = inDayMatch[1];
    if (hebrewDays.hasOwnProperty(dayName)) {
      const targetDay = hebrewDays[dayName];
      let date = getNextWeekday(now, targetDay);
      if (extractedTime) {
        date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
      }
      return {
        success: true,
        date: date.toJSDate(),
      };
    }
  }

  // Check for day name with "יום" prefix
  const dayWithPrefix = dateInput.replace(/^יום\s+/, '');
  if (hebrewDays.hasOwnProperty(dayWithPrefix)) {
    const targetDay = hebrewDays[dayWithPrefix];
    let date = getNextWeekday(now, targetDay);
    // Apply extracted time if available
    if (extractedTime) {
      date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
    }
    return {
      success: true,
      date: date.toJSDate(),
    };
  }

  // Check for day name without "יום" prefix
  if (hebrewDays.hasOwnProperty(dateInput)) {
    const targetDay = hebrewDays[dateInput];
    let date = getNextWeekday(now, targetDay);
    // Apply extracted time if available
    if (extractedTime) {
      date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
    }
    return {
      success: true,
      date: date.toJSDate(),
    };
  }

  // Parse DD/MM/YYYY or DD/MM or DD.MM.YYYY or DD.MM format (supports both "/" and ".")
  const dateFormatMatch = dateInput.match(/^(\d{1,2})[\/\.](\d{1,2})(?:[\/\.](\d{4}))?$/);
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
    let parsedDate = DateTime.fromObject(
      { year, month, day },
      { zone: timezone }
    ).startOf('day');

    // Apply extracted time if available
    if (extractedTime) {
      parsedDate = parsedDate.set({ hour: extractedTime.hour, minute: extractedTime.minute });
    }

    if (!parsedDate.isValid) {
      return {
        success: false,
        date: null,
        error: `תאריך לא תקין: ${parsedDate.invalidReason}`,
      };
    }

    // Check if date is in the past (only if no time specified, or if both date and time are in the past)
    const comparison = extractedTime ? parsedDate : parsedDate.startOf('day');
    if (comparison < now.startOf(extractedTime ? 'minute' : 'day')) {
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
    error: 'קלט לא מזוהה. נסה: היום, מחר 14:00, יום ראשון 18:00, 16/10 19:00, או 16.10.2025 בשעה 20:00',
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
