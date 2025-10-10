/**
 * Comment Formatter Utility
 * Formats event comments for WhatsApp display in Hebrew
 */

import { EventComment } from '../types/index.js';
import { Event } from '../services/EventService.js';
import { DateTime } from 'luxon';

/**
 * Get priority indicator emoji
 */
export function getPriorityIndicator(priority: EventComment['priority']): string {
  switch (priority) {
    case 'urgent':
      return '🔴';
    case 'high':
      return '🟡';
    case 'normal':
    default:
      return '';
  }
}

/**
 * Get priority label in Hebrew
 */
export function getPriorityLabel(priority: EventComment['priority']): string {
  switch (priority) {
    case 'urgent':
      return 'דחוף';
    case 'high':
      return 'חשוב';
    case 'normal':
    default:
      return 'רגיל';
  }
}

/**
 * Format timestamp for display
 */
export function formatCommentTimestamp(timestamp: string, timezone: string = 'Asia/Jerusalem'): string {
  const dt = DateTime.fromISO(timestamp).setZone(timezone);
  return dt.toFormat('dd/MM HH:mm');
}

/**
 * Format a single comment for display
 */
export function formatComment(
  comment: EventComment,
  index: number,
  timezone: string = 'Asia/Jerusalem'
): string {
  const priority = getPriorityIndicator(comment.priority);
  const time = formatCommentTimestamp(comment.timestamp, timezone);
  const reminderIcon = comment.reminderId ? ' ⏰' : '';

  return `${index}️⃣ ${comment.text}${priority ? ' ' + priority : ''}${reminderIcon}\n   🕐 ${time}`;
}

/**
 * Format all comments for an event
 */
export function formatEventComments(
  event: Event,
  timezone: string = 'Asia/Jerusalem'
): string {
  if (!event.notes || event.notes.length === 0) {
    return '📋 אין הערות לאירוע זה';
  }

  const eventDate = DateTime.fromJSDate(event.startTsUtc)
    .setZone(timezone)
    .toFormat('dd/MM/yyyy HH:mm');

  let output = `📋 הערות לאירוע '${event.title}'\n`;
  output += `🗓️ ${eventDate}\n\n`;

  event.notes.forEach((comment, idx) => {
    output += formatComment(comment, idx + 1, timezone) + '\n';

    // Add reminder info if exists
    if (comment.reminderId) {
      output += `   ⏰ תזכורת מקושרת\n`;
    }

    output += '\n';
  });

  output += `💡 למחיקת הערה: 'מחק הערה [מספר]'`;

  return output;
}

/**
 * Format comment added confirmation
 */
export function formatCommentAdded(
  comment: EventComment,
  event: Event,
  timezone: string = 'Asia/Jerusalem'
): string {
  const priority = getPriorityIndicator(comment.priority);
  const eventDate = DateTime.fromJSDate(event.startTsUtc)
    .setZone(timezone)
    .toFormat('dd/MM/yyyy HH:mm');

  let output = `✅ הערה נוספה לאירוע '${event.title}'\n\n`;
  output += `📝 ${comment.text}${priority ? ' ' + priority : ''}\n`;
  output += `🗓️ ${eventDate}`;

  return output;
}

/**
 * Format comment added with priority info
 */
export function formatCommentAddedWithPriority(
  comment: EventComment,
  event: Event,
  timezone: string = 'Asia/Jerusalem'
): string {
  const priority = getPriorityIndicator(comment.priority);
  const priorityLabel = getPriorityLabel(comment.priority);
  const eventDate = DateTime.fromJSDate(event.startTsUtc)
    .setZone(timezone)
    .toFormat('dd/MM/yyyy HH:mm');

  let output = '';

  if (comment.priority === 'urgent') {
    output = `✅ הערה דחופה נוספה! ${priority}\n\n`;
  } else if (comment.priority === 'high') {
    output = `✅ הערה חשובה נוספה! ${priority}\n\n`;
  } else {
    output = `✅ הערה נוספה\n\n`;
  }

  output += `📝 ${comment.text}\n`;
  output += `🗓️ אירוע: ${event.title} - ${eventDate}`;

  if (comment.priority !== 'normal') {
    output += `\n🏷️ עדיפות: ${priorityLabel}`;
  }

  return output;
}

/**
 * Format comment added with reminder
 */
export function formatCommentWithReminder(
  comment: EventComment,
  event: Event,
  reminderDate: Date,
  timezone: string = 'Asia/Jerusalem'
): string {
  const eventDate = DateTime.fromJSDate(event.startTsUtc)
    .setZone(timezone)
    .toFormat('dd/MM/yyyy HH:mm');

  // CRITICAL FIX: Validate reminderDate before formatting
  // Prevents "Invalid DateTime" string from showing to user
  const reminderDateTime = DateTime.fromJSDate(reminderDate).setZone(timezone);
  const reminderTime = reminderDateTime.isValid
    ? reminderDateTime.toFormat('dd/MM/yyyy HH:mm')
    : 'תאריך לא תקין';

  let output = `✅ הערה ותזכורת נקבעו!\n\n`;
  output += `📝 ${comment.text}\n`;
  output += `🗓️ אירוע: ${event.title} - ${eventDate}\n`;
  output += `⏰ תזכורת: ${reminderTime}`;

  return output;
}

/**
 * Format comment deleted confirmation
 */
export function formatCommentDeleted(
  comment: EventComment,
  event: Event,
  remainingCount: number,
  timezone: string = 'Asia/Jerusalem'
): string {
  const eventDate = DateTime.fromJSDate(event.startTsUtc)
    .setZone(timezone)
    .toFormat('dd/MM/yyyy HH:mm');

  let output = `✅ הערה נמחקה\n\n`;
  output += `🗑️ '${comment.text}'\n`;
  output += `🗓️ ${event.title} - ${eventDate}\n\n`;

  if (remainingCount > 0) {
    output += `נותרו ${remainingCount} הערות באירוע זה.`;
  } else {
    output += `אין יותר הערות באירוע זה.`;
  }

  return output;
}

/**
 * Format first-time user education tip
 */
export function formatCommentEducationTip(): string {
  return `💡 תכונות הערות:

דוגמאות שימוש:
• הוסף הערה דחוף: [טקסט] - עדיפות גבוהה 🔴
• הוסף הערה חשוב: [טקסט] - עדיפות בינונית 🟡
• הוסף הערה והזכר לי ב16:00: [טקסט] - יצירת תזכורת
• הצג הערות [אירוע] - צפייה בכל ההערות
• מחק הערה 2 - מחיקת הערה ספציפית
• מחק הערה אחרונה - מחיקת ההערה האחרונה

העדיפויות:
• רגיל (ברירת מחדל)
• חשוב 🟡
• דחוף 🔴`;
}

/**
 * Format error: event not found
 */
export function formatEventNotFound(eventTitle?: string): string {
  if (eventTitle) {
    return `❌ לא נמצא אירוע בשם '${eventTitle}'`;
  }
  return `❌ אירוע לא נמצא`;
}

/**
 * Format error: comment not found
 */
export function formatCommentNotFound(index?: number): string {
  if (index) {
    return `❌ הערה מספר ${index} לא נמצאה`;
  }
  return `❌ הערה לא נמצאה`;
}

/**
 * Format error: no comments to delete
 */
export function formatNoCommentsToDelete(eventTitle: string): string {
  return `❌ אין הערות למחוק באירוע '${eventTitle}'`;
}

/**
 * Format event in list view with inline comment preview
 */
export function formatEventInList(
  event: Event,
  index: number,
  timezone: string = 'Asia/Jerusalem',
  showFullDate: boolean = false,
  allEvents?: Event[] // Optional: used to detect parallel events
): string {
  const dt = DateTime.fromJSDate(event.startTsUtc).setZone(timezone);
  const dateFormat = showFullDate ? 'dd/MM/yyyy HH:mm' : 'dd/MM HH:mm';

  // Check for parallel events at the same time
  let hasParallel = false;
  let parallelTitles: string[] = [];

  if (allEvents && allEvents.length > 0) {
    const eventStart = event.startTsUtc.getTime();
    const eventEnd = event.endTsUtc ? event.endTsUtc.getTime() : eventStart + 60 * 60 * 1000; // 1 hour default

    parallelTitles = allEvents
      .filter(e => {
        if (e.id === event.id) return false; // Skip self
        const eStart = e.startTsUtc.getTime();
        const eEnd = e.endTsUtc ? e.endTsUtc.getTime() : eStart + 60 * 60 * 1000;
        // Check overlap
        return (eStart < eventEnd && eEnd > eventStart);
      })
      .map(e => e.title);

    hasParallel = parallelTitles.length > 0;
  }

  let output = `${index}. ${event.title}`;

  // Add parallel event indicator
  if (hasParallel) {
    output += ` ⚠️ (במקביל: ${parallelTitles.join(', ')})`;
  }

  output += `\n   📅 ${dt.toFormat(dateFormat)}`;

  if (event.location) {
    output += `\n   📍 ${event.location}`;
  }

  // Add all comments inline
  if (event.notes && event.notes.length > 0) {
    output += `\n   💬 ${event.notes.length} הערות:`;
    event.notes.forEach((comment, idx) => {
      const priority = getPriorityIndicator(comment.priority);
      // Use proper numbering for RTL (Right-To-Left) Hebrew display
      output += `\n      ${idx + 1}.\u200E ${comment.text}${priority ? ' ' + priority : ''}`;
    });
  }

  return output;
}

/**
 * Format event details with comments (for event display/updates)
 */
export function formatEventWithComments(
  event: Event,
  timezone: string = 'Asia/Jerusalem'
): string {
  const dt = DateTime.fromJSDate(event.startTsUtc).setZone(timezone);

  let output = `📌 ${event.title}\n`;
  output += `📅 ${dt.toFormat('dd/MM/yyyy HH:mm')}`;

  if (event.location) {
    output += `\n📍 ${event.location}`;
  }

  // Add comments if they exist
  if (event.notes && event.notes.length > 0) {
    output += `\n\n📝 הערות:\n`;
    event.notes.forEach((comment, idx) => {
      const priority = getPriorityIndicator(comment.priority);
      const time = formatCommentTimestamp(comment.timestamp, timezone);
      // Use proper numbering for RTL (Right-To-Left) Hebrew display
      output += `${idx + 1}.\u200E ${comment.text}${priority ? ' ' + priority : ''}\n`;
      output += `   🕐 ${time}\n`;
    });
  }

  return output;
}
