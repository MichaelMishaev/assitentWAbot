/**
 * Error Metrics Tracker
 *
 * Tracks error occurrences and patterns for production monitoring
 * Helps identify which bugs occur most frequently and impact users
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Error categories based on recent bug fixes
 */
export enum ErrorCategory {
  // Date/Time parsing issues
  DATE_PARSING = 'DATE_PARSING',
  TIME_PARSING = 'TIME_PARSING',
  TIME_PRESERVATION = 'TIME_PRESERVATION',
  TODAY_FILTER = 'TODAY_FILTER',

  // NLP issues
  NLP_INTENT_DETECTION = 'NLP_INTENT_DETECTION',
  NLP_ENTITY_EXTRACTION = 'NLP_ENTITY_EXTRACTION',
  FUZZY_SEARCH = 'FUZZY_SEARCH',

  // UI/UX issues
  MISSING_FEEDBACK = 'MISSING_FEEDBACK',
  RTL_FORMATTING = 'RTL_FORMATTING',
  COMMENT_VISIBILITY = 'COMMENT_VISIBILITY',

  // Data issues
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  REMINDER_FILTERING = 'REMINDER_FILTERING',
  REDIS_TTL_EXPIRED = 'REDIS_TTL_EXPIRED',

  // System errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  WHATSAPP_ERROR = 'WHATSAPP_ERROR',
  GENERAL_ERROR = 'GENERAL_ERROR'
}

interface ErrorMetric {
  category: ErrorCategory;
  message: string;
  userId?: string;
  phone?: string;
  context?: Record<string, any>;
  stackTrace?: string;
}

/**
 * In-memory error counter (resets on restart)
 * For production, consider Redis or database storage
 */
const errorCounts = new Map<ErrorCategory, number>();
const errorExamples = new Map<ErrorCategory, ErrorMetric[]>();
const MAX_EXAMPLES_PER_CATEGORY = 10;

// Metrics logger
const metricsLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error-metrics.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 30, // 30 days retention
    })
  ]
});

/**
 * Track an error occurrence
 */
export function trackError(metric: ErrorMetric): void {
  const { category } = metric;

  // Increment counter
  const currentCount = errorCounts.get(category) || 0;
  errorCounts.set(category, currentCount + 1);

  // Store example (keep last N examples)
  if (!errorExamples.has(category)) {
    errorExamples.set(category, []);
  }

  const examples = errorExamples.get(category)!;
  examples.push(metric);

  // Keep only last N examples
  if (examples.length > MAX_EXAMPLES_PER_CATEGORY) {
    examples.shift();
  }

  // Log to metrics file
  metricsLogger.info('Error tracked', {
    count: errorCounts.get(category),
    ...metric,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get error count for a specific category
 */
export function getErrorCount(category: ErrorCategory): number {
  return errorCounts.get(category) || 0;
}

/**
 * Get all error counts
 */
export function getAllErrorCounts(): Map<ErrorCategory, number> {
  return new Map(errorCounts);
}

/**
 * Get example errors for a category
 */
export function getErrorExamples(category: ErrorCategory): ErrorMetric[] {
  return errorExamples.get(category) || [];
}

/**
 * Get top N most common errors
 */
export function getTopErrors(n: number = 10): Array<{ category: ErrorCategory; count: number }> {
  return Array.from(errorCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * Reset all counters (useful for testing or periodic resets)
 */
export function resetCounters(): void {
  errorCounts.clear();
  errorExamples.clear();
}

/**
 * Generate error metrics report
 */
export function generateReport(): string {
  const topErrors = getTopErrors(10);
  const totalErrors = Array.from(errorCounts.values()).reduce((sum, count) => sum + count, 0);

  let report = `📊 Error Metrics Report\n`;
  report += `${'='.repeat(50)}\n`;
  report += `Total errors tracked: ${totalErrors}\n`;
  report += `Unique error categories: ${errorCounts.size}\n\n`;

  report += `Top 10 Most Common Errors:\n`;
  report += `${'-'.repeat(50)}\n`;

  topErrors.forEach((error, index) => {
    const percentage = ((error.count / totalErrors) * 100).toFixed(1);
    report += `${index + 1}. ${error.category}: ${error.count} (${percentage}%)\n`;

    // Show latest example
    const examples = getErrorExamples(error.category);
    if (examples.length > 0) {
      const latest = examples[examples.length - 1];
      report += `   Latest: ${latest.message}\n`;
    }
  });

  return report;
}

/**
 * Helper functions for common error scenarios
 */

export function trackDateParsingError(input: string, userId?: string, phone?: string): void {
  trackError({
    category: ErrorCategory.DATE_PARSING,
    message: `Failed to parse date: "${input}"`,
    userId,
    phone,
    context: { input }
  });
}

export function trackTimeDisambiguationError(input: string, userId?: string): void {
  trackError({
    category: ErrorCategory.TIME_PARSING,
    message: `Time disambiguation needed: "${input}"`,
    userId,
    context: { input }
  });
}

export function trackEventNotFoundError(searchTerm: string, userId?: string): void {
  trackError({
    category: ErrorCategory.EVENT_NOT_FOUND,
    message: `Event not found: "${searchTerm}"`,
    userId,
    context: { searchTerm }
  });
}

export function trackRedisTTLExpired(messageId: string, userId?: string): void {
  trackError({
    category: ErrorCategory.REDIS_TTL_EXPIRED,
    message: `Redis mapping expired for message: ${messageId}`,
    userId,
    context: { messageId }
  });
}

export function trackRTLFormattingIssue(context: string, userId?: string): void {
  trackError({
    category: ErrorCategory.RTL_FORMATTING,
    message: `RTL formatting issue detected`,
    userId,
    context: { context }
  });
}

export function trackNLPIntentFailure(
  input: string,
  detectedIntent: string | null,
  userId?: string
): void {
  trackError({
    category: ErrorCategory.NLP_INTENT_DETECTION,
    message: `NLP failed to detect intent: "${input}"`,
    userId,
    context: { input, detectedIntent }
  });
}

export default {
  trackError,
  getErrorCount,
  getAllErrorCounts,
  getErrorExamples,
  getTopErrors,
  generateReport,
  resetCounters,
  // Helper functions
  trackDateParsingError,
  trackTimeDisambiguationError,
  trackEventNotFoundError,
  trackRedisTTLExpired,
  trackRTLFormattingIssue,
  trackNLPIntentFailure
};
