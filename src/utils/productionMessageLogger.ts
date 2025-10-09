import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Production message logs directory
const LOGS_DIR = path.join(process.cwd(), 'logs');
const MESSAGES_LOG_FILE = path.join(LOGS_DIR, 'user-messages.json');
const DAILY_LOG_DIR = path.join(LOGS_DIR, 'daily-messages');

// Ensure directories exist
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

if (!fs.existsSync(DAILY_LOG_DIR)) {
  fs.mkdirSync(DAILY_LOG_DIR, { recursive: true });
}

interface UserMessage {
  timestamp: string;
  messageId: string;
  userId: string;
  phone: string;
  direction: 'incoming' | 'outgoing';
  messageText: string;
  messageType?: string;
  intent?: {
    intent: string;
    confidence: number;
    entities?: any;
  };
  response?: string;
  processingTime?: number;
  error?: string;
  conversationState?: string;
  metadata?: any;
}

interface DailyStats {
  date: string;
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueUsers: number;
  topIntents: Record<string, number>;
  errors: number;
  avgProcessingTime: number;
}

class ProductionMessageLogger {
  private messageBuffer: UserMessage[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 10; // Flush every 10 messages
  private readonly FLUSH_INTERVAL = 30000; // Or every 30 seconds

  constructor() {
    // Start auto-flush interval
    this.startAutoFlush();

    // Flush on process exit
    process.on('beforeExit', () => this.flush());
    process.on('SIGINT', () => {
      this.flush();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.flush();
      process.exit(0);
    });
  }

  /**
   * Log incoming message from user
   */
  logIncomingMessage(data: {
    messageId: string;
    userId: string;
    phone: string;
    messageText: string;
    messageType?: string;
    conversationState?: string;
    metadata?: any;
  }): void {
    const message: UserMessage = {
      timestamp: new Date().toISOString(),
      messageId: data.messageId,
      userId: data.userId,
      phone: data.phone,
      direction: 'incoming',
      messageText: data.messageText,
      messageType: data.messageType || 'text',
      conversationState: data.conversationState,
      metadata: data.metadata,
    };

    this.addToBuffer(message);
  }

  /**
   * Log outgoing message to user (bot response)
   */
  logOutgoingMessage(data: {
    messageId: string;
    userId: string;
    phone: string;
    messageText: string;
    conversationState?: string;
    processingTime?: number;
    metadata?: any;
  }): void {
    const message: UserMessage = {
      timestamp: new Date().toISOString(),
      messageId: data.messageId,
      userId: data.userId,
      phone: data.phone,
      direction: 'outgoing',
      messageText: data.messageText,
      conversationState: data.conversationState,
      processingTime: data.processingTime,
      metadata: data.metadata,
    };

    this.addToBuffer(message);
  }

  /**
   * Log NLP intent parsing result
   */
  logIntent(data: {
    messageId: string;
    userId: string;
    phone: string;
    intent: string;
    confidence: number;
    entities?: any;
  }): void {
    // Find the last incoming message from this user and add intent
    const lastMessage = this.messageBuffer
      .reverse()
      .find(
        (m) =>
          m.userId === data.userId &&
          m.direction === 'incoming' &&
          m.messageId === data.messageId
      );

    if (lastMessage) {
      lastMessage.intent = {
        intent: data.intent,
        confidence: data.confidence,
        entities: data.entities,
      };
    }

    this.messageBuffer.reverse(); // Restore order
  }

  /**
   * Log error in message processing
   */
  logError(data: {
    messageId: string;
    userId: string;
    phone: string;
    error: string;
  }): void {
    const message: UserMessage = {
      timestamp: new Date().toISOString(),
      messageId: data.messageId,
      userId: data.userId,
      phone: data.phone,
      direction: 'incoming',
      messageText: '[ERROR]',
      error: data.error,
    };

    this.addToBuffer(message);
  }

  /**
   * Add message to buffer and flush if needed
   */
  private addToBuffer(message: UserMessage): void {
    this.messageBuffer.push(message);

    // Flush if buffer is full
    if (this.messageBuffer.length >= this.BUFFER_SIZE) {
      this.flush();
    }
  }

  /**
   * Flush buffer to file
   */
  private flush(): void {
    if (this.messageBuffer.length === 0) return;

    try {
      // Get current date for daily log
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dailyLogFile = path.join(DAILY_LOG_DIR, `${today}.json`);

      // Read existing daily log
      let dailyMessages: UserMessage[] = [];
      if (fs.existsSync(dailyLogFile)) {
        const content = fs.readFileSync(dailyLogFile, 'utf-8');
        try {
          dailyMessages = JSON.parse(content);
        } catch (e) {
          console.error('Failed to parse daily log file:', e);
        }
      }

      // Append new messages
      dailyMessages.push(...this.messageBuffer);

      // Write daily log
      fs.writeFileSync(dailyLogFile, JSON.stringify(dailyMessages, null, 2), 'utf-8');

      // Also append to main log file (for historical data)
      const logLine = this.messageBuffer.map((m) => JSON.stringify(m)).join('\n') + '\n';
      fs.appendFileSync(MESSAGES_LOG_FILE, logLine, 'utf-8');

      // Generate daily stats
      this.generateDailyStats(today, dailyMessages);

      // Clear buffer
      this.messageBuffer = [];
    } catch (error) {
      console.error('Failed to flush message buffer:', error);
    }
  }

  /**
   * Generate daily statistics
   */
  private generateDailyStats(date: string, messages: UserMessage[]): void {
    const statsFile = path.join(DAILY_LOG_DIR, `${date}-stats.json`);

    const incoming = messages.filter((m) => m.direction === 'incoming');
    const outgoing = messages.filter((m) => m.direction === 'outgoing');
    const uniqueUsers = new Set(messages.map((m) => m.userId)).size;

    const topIntents: Record<string, number> = {};
    let totalProcessingTime = 0;
    let processedCount = 0;
    let errorCount = 0;

    messages.forEach((m) => {
      if (m.intent) {
        topIntents[m.intent.intent] = (topIntents[m.intent.intent] || 0) + 1;
      }
      if (m.processingTime) {
        totalProcessingTime += m.processingTime;
        processedCount++;
      }
      if (m.error) {
        errorCount++;
      }
    });

    const stats: DailyStats = {
      date,
      totalMessages: messages.length,
      incomingMessages: incoming.length,
      outgoingMessages: outgoing.length,
      uniqueUsers,
      topIntents,
      errors: errorCount,
      avgProcessingTime: processedCount > 0 ? totalProcessingTime / processedCount : 0,
    };

    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
  }

  /**
   * Start auto-flush interval
   */
  private startAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Get messages for a specific date
   */
  getMessagesForDate(date: string): UserMessage[] {
    const dailyLogFile = path.join(DAILY_LOG_DIR, `${date}.json`);

    if (!fs.existsSync(dailyLogFile)) {
      return [];
    }

    try {
      const content = fs.readFileSync(dailyLogFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read daily log:', error);
      return [];
    }
  }

  /**
   * Get stats for a specific date
   */
  getStatsForDate(date: string): DailyStats | null {
    const statsFile = path.join(DAILY_LOG_DIR, `${date}-stats.json`);

    if (!fs.existsSync(statsFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(statsFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read stats:', error);
      return null;
    }
  }

  /**
   * Get all available log dates
   */
  getAvailableDates(): string[] {
    try {
      const files = fs.readdirSync(DAILY_LOG_DIR);
      const dates = files
        .filter((f) => f.endsWith('.json') && !f.endsWith('-stats.json'))
        .map((f) => f.replace('.json', ''))
        .sort()
        .reverse();
      return dates;
    } catch (error) {
      console.error('Failed to read log directory:', error);
      return [];
    }
  }
}

// Singleton instance
export const prodMessageLogger = new ProductionMessageLogger();
