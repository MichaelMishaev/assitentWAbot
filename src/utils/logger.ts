import winston from 'winston';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const logLevel = process.env.LOG_LEVEL || 'info';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for detailed operation logging
const detailedFormat = winston.format.printf(({ timestamp, level, message, operation, userId, phone, data, error, ...meta }: any) => {
  let logMessage = `${timestamp} [${level.toUpperCase()}]`;

  // Add operation type
  if (operation) {
    logMessage += ` [${operation}]`;
  }

  // Add user info (masked for privacy)
  if (phone) {
    const maskedPhone = phone.substring(0, 6) + '****';
    logMessage += ` [Phone: ${maskedPhone}]`;
  }
  if (userId) {
    logMessage += ` [User: ${userId.substring(0, 8)}]`;
  }

  // Add main message
  logMessage += ` ${message}`;

  // Add data if present
  if (data) {
    logMessage += `\n  📊 Data: ${JSON.stringify(data, null, 2)}`;
  }

  // Add error details if present
  if (error) {
    if (error.stack) {
      logMessage += `\n  ❌ Error: ${error.message}\n  Stack: ${error.stack}`;
    } else {
      logMessage += `\n  ❌ Error: ${JSON.stringify(error)}`;
    }
  }

  // Add any remaining metadata
  const remainingMeta = { ...meta };
  delete remainingMeta.service;
  if (Object.keys(remainingMeta).length > 0) {
    logMessage += `\n  ℹ️  Meta: ${JSON.stringify(remainingMeta, null, 2)}`;
  }

  return logMessage;
});

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat()
  ),
  defaultMeta: { service: 'whatsapp-bot' },
  transports: [
    // Console output with colors and detailed format
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        detailedFormat
      ),
    }),
    // All logs file (with detailed format)
    new winston.transports.File({
      filename: path.join(logsDir, 'all.log'),
      format: winston.format.combine(
        winston.format.json()
      ),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Error logs file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.json()
      ),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Operations log (user actions)
    new winston.transports.File({
      filename: path.join(logsDir, 'operations.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.json()
      ),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Helper functions for structured logging
export const logOperation = (operation: string, message: string, data?: any) => {
  logger.info(message, { operation, data });
};

export const logUserAction = (operation: string, userId: string, phone: string, message: string, data?: any) => {
  logger.info(message, { operation, userId, phone, data });
};

export const logNLPParsing = (userId: string, userMessage: string, intent: any) => {
  logger.info('NLP intent parsed', {
    operation: 'NLP_PARSE',
    userId,
    data: {
      message: userMessage,
      intent: intent.intent,
      confidence: intent.confidence,
      details: intent
    }
  });
};

export const logEventCreation = (userId: string, phone: string, event: any) => {
  logger.info('Event created', {
    operation: 'EVENT_CREATE',
    userId,
    phone,
    data: {
      eventId: event.id,
      title: event.title,
      startTime: event.startTsUtc,
      location: event.location
    }
  });
};

export const logReminderCreation = (userId: string, phone: string, reminder: any) => {
  logger.info('Reminder created', {
    operation: 'REMINDER_CREATE',
    userId,
    phone,
    data: {
      reminderId: reminder.id,
      title: reminder.title,
      dueTime: reminder.dueTsUtc,
      recurrence: reminder.rrule
    }
  });
};

export const logMessageReceived = (phone: string, message: string, state?: string) => {
  const maskedPhone = phone.substring(0, 6) + '****';
  logger.info('Message received', {
    operation: 'MESSAGE_IN',
    phone: maskedPhone,
    data: {
      messageLength: message.length,
      messagePreview: message.substring(0, 50),
      currentState: state
    }
  });
};

export const logMessageSent = (phone: string, message: string) => {
  const maskedPhone = phone.substring(0, 6) + '****';
  logger.info('Message sent', {
    operation: 'MESSAGE_OUT',
    phone: maskedPhone,
    data: {
      messageLength: message.length,
      messagePreview: message.substring(0, 50)
    }
  });
};

export const logStateChange = (userId: string, fromState: string, toState: string, context?: any) => {
  logger.info('State changed', {
    operation: 'STATE_CHANGE',
    userId,
    data: {
      from: fromState,
      to: toState,
      context
    }
  });
};

export const logError = (operation: string, message: string, error: Error, context?: any) => {
  logger.error(message, {
    operation,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    data: context
  });
};

export const logDatabaseQuery = (operation: string, query: string, params?: any[], duration?: number) => {
  logger.debug('Database query', {
    operation: 'DB_QUERY',
    data: {
      operation,
      query: query.substring(0, 100),
      paramsCount: params?.length || 0,
      duration: duration ? `${duration}ms` : undefined
    }
  });
};

export const logAPICall = (operation: string, endpoint: string, status?: number, duration?: number) => {
  logger.info('API call', {
    operation: 'API_CALL',
    data: {
      operation,
      endpoint,
      status,
      duration: duration ? `${duration}ms` : undefined
    }
  });
};

export default logger;
