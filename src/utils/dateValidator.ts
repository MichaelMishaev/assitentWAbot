/**
 * Date Validation Utility
 *
 * Provides safe date parsing and validation to prevent Invalid Date bugs
 * that cause PostgreSQL timestamp errors like "0NaN-NaN-NaN..."
 */

import logger from './logger';

/**
 * Check if a value is a valid date string that can be parsed
 *
 * @param dateStr - The date string to validate
 * @returns true if the string can be parsed into a valid Date
 */
export function isValidDateString(dateStr: any): boolean {
  // Reject null, undefined, or non-string values
  if (!dateStr) return false;

  // Allow Date objects to pass through
  if (dateStr instanceof Date) {
    return !isNaN(dateStr.getTime());
  }

  // Must be a string
  if (typeof dateStr !== 'string') return false;

  // Try to parse
  const date = new Date(dateStr);

  // Check if the date is valid (not NaN)
  return !isNaN(date.getTime());
}

/**
 * Safely parse a date string into a Date object
 * Returns null if the date is invalid, preventing NaN timestamp bugs
 *
 * @param dateStr - The date string to parse
 * @param context - Optional context for logging (e.g., "handleNLPSearchEvents")
 * @returns Valid Date object or null
 */
export function safeParseDate(dateStr: any, context?: string): Date | null {
  if (!isValidDateString(dateStr)) {
    logger.warn('Invalid date string detected', {
      dateStr,
      type: typeof dateStr,
      context: context || 'unknown',
      message: 'Prevented NaN timestamp bug'
    });
    return null;
  }

  // If already a Date object, return it
  if (dateStr instanceof Date) {
    return dateStr;
  }

  return new Date(dateStr);
}

/**
 * Validate that a date is in the future (with optional buffer)
 *
 * @param date - The date to check
 * @param bufferMs - Buffer in milliseconds (default: 30 seconds)
 * @returns true if date is in the future (accounting for buffer)
 */
export function isFutureDate(date: Date, bufferMs: number = 30 * 1000): boolean {
  const now = new Date();
  return date.getTime() >= (now.getTime() - bufferMs);
}

/**
 * Format date for user display in Hebrew locale
 * Returns "תאריך לא תקין" if date is invalid
 *
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDateHebrew(date: Date | null): string {
  if (!date || isNaN(date.getTime())) {
    return 'תאריך לא תקין';
  }

  return date.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

/**
 * Safely extract date from NLP intent result
 * Handles both event.date and reminder.dueDate patterns
 *
 * @param intent - NLP intent object
 * @param field - Field path (e.g., "event.date" or "reminder.dueDate")
 * @returns Valid Date or null
 */
export function extractDateFromIntent(intent: any, field: 'event.date' | 'reminder.dueDate'): Date | null {
  const [entity, dateField] = field.split('.');

  if (!intent[entity] || !intent[entity][dateField]) {
    logger.debug('No date found in NLP intent', { field, intent: JSON.stringify(intent) });
    return null;
  }

  return safeParseDate(intent[entity][dateField], `extractDateFromIntent.${field}`);
}
