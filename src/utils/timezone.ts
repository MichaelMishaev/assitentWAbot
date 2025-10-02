import { DateTime } from 'luxon';

/**
 * Convert UTC Date to user's timezone
 * @param utcDate - Date object in UTC
 * @param timezone - IANA timezone string (default: 'Asia/Jerusalem')
 * @returns DateTime object in user's timezone
 */
export function utcToUserTz(
  utcDate: Date,
  timezone: string = 'Asia/Jerusalem'
): DateTime {
  return DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(timezone);
}

/**
 * Convert user's local date to UTC
 * @param localDate - Date object in user's timezone
 * @param timezone - IANA timezone string (default: 'Asia/Jerusalem')
 * @returns Date object in UTC
 */
export function userTzToUtc(
  localDate: Date,
  timezone: string = 'Asia/Jerusalem'
): Date {
  const dt = DateTime.fromJSDate(localDate, { zone: timezone });
  return dt.toUTC().toJSDate();
}

/**
 * Format DateTime according to locale and timezone
 * @param date - Date object to format
 * @param locale - Locale string (default: 'he' for Hebrew)
 * @param timezone - IANA timezone string (default: 'Asia/Jerusalem')
 * @returns Formatted date string
 */
export function formatDateTime(
  date: Date,
  locale: string = 'he',
  timezone: string = 'Asia/Jerusalem'
): string {
  const dt = DateTime.fromJSDate(date).setZone(timezone);

  if (locale === 'he') {
    // Hebrew format: DD/MM/YYYY HH:mm
    return dt.toFormat('dd/MM/yyyy HH:mm');
  } else {
    // English format: MM/DD/YYYY hh:mm A
    return dt.toFormat('MM/dd/yyyy hh:mm a');
  }
}

/**
 * Get current time in user's timezone
 * @param timezone - IANA timezone string (default: 'Asia/Jerusalem')
 * @returns DateTime object representing current time in user's timezone
 */
export function getCurrentTimeInUserTz(
  timezone: string = 'Asia/Jerusalem'
): DateTime {
  return DateTime.now().setZone(timezone);
}
