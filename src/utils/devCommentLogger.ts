import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Dedicated logger for developer comments (messages starting with #)
 *
 * Purpose: Capture real-time bug reports and feature requests from users
 * Format: Special formatting for easy searching and analysis
 * Retention: 30 days (longer than normal logs for historical tracking)
 */
const devCommentLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    // Dedicated dev-comments.log file
    new winston.transports.File({
      filename: path.join(logsDir, 'dev-comments.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 30, // 30 days retention
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf((info: any) => {
          const { timestamp, userId, phone, commentText, messageId, conversationState } = info;
          const maskedPhone = phone ? (phone as string).substring(0, 6) + '****' : 'unknown';
          return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 DEV COMMENT DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 Timestamp: ${timestamp}
👤 User ID: ${userId || 'N/A'}
📱 Phone: ${maskedPhone}
📋 Message ID: ${messageId || 'N/A'}
🔄 State: ${conversationState || 'UNKNOWN'}

💬 Comment:
${commentText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        })
      )
    }),
    // Also log to all.log for completeness (JSON format)
    new winston.transports.File({
      filename: path.join(logsDir, 'all.log'),
      format: winston.format.json()
    })
  ]
});

/**
 * Log a developer comment
 *
 * @param userId - User ID
 * @param phone - User phone number
 * @param commentText - The full comment text (including #)
 * @param messageId - WhatsApp message ID
 * @param conversationState - Current conversation state
 */
export const logDevComment = (
  userId: string | undefined,
  phone: string,
  commentText: string,
  messageId?: string,
  conversationState?: string
) => {
  devCommentLogger.info('Developer comment received', {
    userId,
    phone,
    commentText,
    messageId,
    conversationState,
    operation: 'DEV_COMMENT',
    timestamp: new Date().toISOString()
  });
};

/**
 * Check if a message is a developer comment
 *
 * @param text - Message text
 * @returns true if message starts with #
 */
export const isDevComment = (text: string): boolean => {
  return text.trim().startsWith('#');
};

export default devCommentLogger;
