import dotenv from 'dotenv';
import logger from './utils/logger';
import { testConnection as testDatabase } from './config/database';
import { testRedisConnection } from './config/redis';
import { startHealthCheck } from './api/health';

// Load environment variables
dotenv.config();

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

    logger.info('✅ WhatsApp Assistant Bot is running!');
    logger.info('📋 Next steps:');
    logger.info('  1. Run migrations: npm run migrate:up');
    logger.info('  2. Setup Baileys WhatsApp client');
    logger.info('  3. Implement authentication service');
  } catch (error) {
    logger.error('❌ Failed to start bot:', error);
    process.exit(1);
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
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

// Start the application
main();
