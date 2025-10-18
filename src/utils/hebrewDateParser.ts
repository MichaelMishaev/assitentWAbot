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
    'שבוע הקרוב': () => now.plus({ weeks: 1 }).startOf('week'),
    'בשבוע הקרוב': () => now.plus({ weeks: 1 }).startOf('week'),

    // Month keywords
    'החודש': () => now.startOf('month'),
    'החודש הזה': () => now.startOf('month'),
    'בחודש': () => now.startOf('month'),
    'חודש הבא': () => now.plus({ months: 1 }).startOf('month'),
    'בחודש הבא': () => now.plus({ months: 1 }).startOf('month'),
  };

  // Extract time from input (HH:MM or "בשעה HH:MM" or "ב-HH:MM" or natural language)
  let extractedTime: { hour: number; minute: number } | null = null;
  let dateInput = trimmedInput;

  // FIRST: Match natural language time patterns: "3 אחרי הצהריים", "8 בערב", "10 בבוקר", "12 בלילה"
  const naturalTimeMatch = trimmedInput.match(/(?:,?\s*(?:בשעה|ב-?)?\s*)?(\d{1,2})\s*(אחרי הצהריים|אחה"צ|אחה״צ|בערב|בלילה|בבוקר)/);
  if (naturalTimeMatch) {
    const hour = parseInt(naturalTimeMatch[1], 10);
    const period = naturalTimeMatch[2];

    let adjustedHour = hour;

    // Convert to 24-hour format
    if (period === 'אחרי הצהריים' || period === 'אחה"צ' || period === 'אחה״צ') {
      // Afternoon: PM hours (12:00-18:00)
      if (hour >= 1 && hour <= 11) {
        adjustedHour = hour + 12; // 1-11 → 13-23
      } else if (hour === 12) {
        adjustedHour = 12; // noon stays 12
      }
    } else if (period === 'בערב') {
      // Evening: 6 PM onwards
      if (hour >= 1 && hour <= 11) {
        adjustedHour = hour + 12; // 1-11 → 13-23
      } else if (hour === 12) {
        adjustedHour = 0; // midnight
      }
    } else if (period === 'בלילה') {
      // Night: midnight or late night
      if (hour === 12) {
        adjustedHour = 0; // midnight
      } else if (hour >= 1 && hour <= 3) {
        adjustedHour = hour; // early morning 1-3 AM stays as is
      } else if (hour >= 4 && hour <= 11) {
        adjustedHour = hour + 12; // late night 4-11 → 16-23
      }
    } else if (period === 'בבוקר') {
      // Morning: AM hours
      if (hour >= 1 && hour <= 11) {
        adjustedHour = hour; // 1-11 stays as is
      } else if (hour === 12) {
        adjustedHour = 12; // noon
      }
    }

    // Validate hour
    if (adjustedHour >= 0 && adjustedHour <= 23) {
      extractedTime = { hour: adjustedHour, minute: 0 };
      // Remove natural time from input for date parsing
      dateInput = trimmedInput.replace(/(?:,?\s*(?:בשעה|ב-?)?\s*)?\d{1,2}\s*(?:אחרי הצהריים|אחה"צ|אחה״צ|בערב|בלילה|בבוקר)/, '').trim();
    }
  }

  // SECOND: Match standard time patterns: "14:00", "בשעה 14:00", "ב-14:00", ", בשעה 14:00"
  if (!extractedTime) {
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
  } // Close if (!extractedTime)

  // FIX #1: Support "עוד X ימים" (in X days) pattern
  const relativeDaysMatch = dateInput.match(/^עוד\s+(\d+)\s+ימים?$/);
  if (relativeDaysMatch) {
    const daysToAdd = parseInt(relativeDaysMatch[1], 10);
    if (daysToAdd >= 0 && daysToAdd <= 365) { // Reasonable range
      let date = now.plus({ days: daysToAdd });
      // Apply extracted time if available
      if (extractedTime) {
        date = date.set({ hour: extractedTime.hour, minute: extractedTime.minute });
      }
      return {
        success: true,
        date: date.toJSDate(),
      };
    }
  }

  // FIX #2: Support "יום X הקרוב/הבא" patterns (next Saturday, next Sunday, etc.)
  // Match: "שבת הקרוב", "יום ראשון הבא", "רביעי הקרוב", etc.
  const nextDayMatch = dateInput.match(/^(?:יום\s+)?([א-ת]+)\s+(הקרוב|הבא)$/);
  if (nextDayMatch) {
    const dayName = nextDayMatch[1];
    const hebrewDays: Record<string, number> = {
      'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3,
      'חמישי': 4, 'שישי': 5, 'שבת': 6,
      'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5,
    };

    if (hebrewDays.hasOwnProperty(dayName)) {
      const targetDay = hebrewDays[dayName];
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
    // Full names
    'ראשון': 0,
    'שני': 1,
    'שלישי': 2,
    'רביעי': 3,
    'חמישי': 4,
    'שישי': 5,
    'שבת': 6,
    // Abbreviated forms (יום א = Sunday, etc.)
    'א': 0,  // יום א
    'ב': 1,  // יום ב
    'ג': 2,  // יום ג
    'ד': 3,  // יום ד
    'ה': 4,  // יום ה
    'ו': 5,  // יום ו
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
    let year = dateFormatMatch[3] ? parseInt(dateFormatMatch[3], 10) : now.year;

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

    // SMART YEAR DETECTION: If no year provided and date would be in past, use next year
    if (!dateFormatMatch[3]) {
      // User didn't specify year - we defaulted to current year above
      // Check if this would result in a past date
      const testDate = DateTime.fromObject(
        { year, month, day },
        { zone: timezone }
      ).startOf('day');

      if (testDate.isValid && testDate < now.startOf('day')) {
        // Date is in the past - user likely meant next year
        year = now.year + 1;
        console.log(`[SMART_YEAR] Date ${day}/${month} is past, using next year: ${year}`);
      }
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

    // REMOVED: No longer reject past dates since we auto-correct them above
    // The old code rejected all past dates, but with smart year detection,
    // dates without year are automatically moved to next year if needed

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
