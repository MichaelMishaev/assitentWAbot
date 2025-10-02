import dotenv from 'dotenv';
import logger from './utils/logger';
import { testConnection as testDatabase } from './config/database';
import { testRedisConnection } from './config/redis';
import { startHealthCheck, stopHealthCheck } from './api/health';
import { BaileysProvider } from './providers';
import { IncomingMessage } from './providers/IMessageProvider';
import { createMessageRouter } from './services/MessageRouter';
import { ReminderWorker } from './queues/ReminderWorker';
import type { MessageRouter } from './services/MessageRouter';

// Load environment variables
dotenv.config();

// Global instances
let whatsappProvider: BaileysProvider | null = null;
let messageRouter: MessageRouter | null = null;
let reminderWorker: ReminderWorker | null = null;

async function main() {
  try {
    logger.info('🚀 Starting WhatsApp Assistant Bot...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testDatabase();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Test Redis connection
    logger.info('Testing Redis connection...');
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      throw new Error('Failed to connect to Redis');
    }

    // Start health check API
    logger.info('Starting health check API...');
    startHealthCheck();

    // Initialize WhatsApp (Baileys)
    logger.info('Initializing WhatsApp connection...');
    whatsappProvider = new BaileysProvider();

    // Initialize MessageRouter
    logger.info('Initializing MessageRouter...');
    messageRouter = createMessageRouter(whatsappProvider);

    // Initialize ReminderWorker
    logger.info('Starting ReminderWorker...');
    reminderWorker = new ReminderWorker(whatsappProvider);

    // Register message handler
    whatsappProvider.onMessage(handleIncomingMessage);

    // Register connection state handler
    whatsappProvider.onConnectionStateChange((state) => {
      logger.info(`WhatsApp connection state: ${state.status}`);
      if (state.status === 'qr') {
        logger.info('📱 Scan the QR code with WhatsApp to connect');
        logger.info(`QR code saved to: ${process.env.SESSION_PATH || './sessions'}/qr-code.png`);
      }
    });

    // Initialize connection
    await whatsappProvider.initialize();

    logger.info('✅ WhatsApp Assistant Bot is running!');
    logger.info('📋 Status:');
    logger.info('  ✅ Database connected');
    logger.info('  ✅ Redis connected');
    logger.info('  ✅ MessageRouter initialized');
    logger.info('  ✅ ReminderWorker started');
    logger.info('  ⏳ WhatsApp initializing (scan QR code if needed)');
    logger.info('  ✅ Health check API running on port', process.env.PORT || 3000);
  } catch (error) {
    logger.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

/**
 * Handle incoming WhatsApp messages
 */
async function handleIncomingMessage(message: IncomingMessage) {
  try {
    // Skip messages from ourselves
    if (message.isFromMe) {
      return;
    }

    const { from, content } = message;
    const text = content.text.trim();

    logger.info(`Processing message from ${from}: "${text}"`);

    // Route message through MessageRouter
    if (!messageRouter) {
      logger.error('MessageRouter not initialized');
      return;
    }

    await messageRouter.routeMessage(from, text);

  } catch (error) {
    logger.error('Error handling incoming message:', error);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
async function shutdown() {
  logger.info('👋 Shutting down gracefully...');
  await stopHealthCheck();
  if (reminderWorker) {
    await reminderWorker.close();
  }
  if (whatsappProvider) {
    await whatsappProvider.disconnect();
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the application
main();
