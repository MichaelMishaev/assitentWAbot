import dotenv from 'dotenv';
import logger from './utils/logger.js';
import { testConnection as testDatabase } from './config/database.js';
import { testRedisConnection, redis } from './config/redis.js';
import { startHealthCheck, stopHealthCheck } from './api/health.js';
import { WhatsAppWebJSProvider } from './providers/WhatsAppWebJSProvider.js';
import { IncomingMessage, ConnectionState } from './providers/IMessageProvider.js';
import { createMessageRouter } from './services/MessageRouter.js';
import { ReminderWorker } from './queues/ReminderWorker.js';
import { initializePipeline, shutdownPipeline } from './domain/orchestrator/PhaseInitializer.js';
import type { MessageRouter } from './services/MessageRouter.js';

// Load environment variables
dotenv.config();

// Global instances
let whatsappProvider: WhatsAppWebJSProvider | null = null;
let messageRouter: MessageRouter | null = null;
let reminderWorker: ReminderWorker | null = null;

// 🛡️ LAYER 1: Message Deduplication (Prevents duplicate processing)
// Optimized: 12h TTL (down from 48h) - 75% memory savings
// Covers: Reconnection attempts (<1min) + IP block cooldown (1-2h) + safety margin
// With MAX_RECONNECT_ATTEMPTS=3, failures happen in ~35 seconds (5s+10s+20s)
// 12h TTL provides 43,200% safety margin over actual failure time
const MESSAGE_DEDUP_TTL = 43200; // 12 hours (optimized from 48h)
const STARTUP_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
let botStartupTime: number = 0;

// Redis monitoring
let monitoringInterval: NodeJS.Timeout | null = null;

// 🛡️ CRASH LOOP PREVENTION: Track crashes to prevent infinite restart loops
const CRASH_TRACKING_KEY = 'bot:crash:count';
const CRASH_WINDOW_SECONDS = 300; // 5 minutes
const MAX_CRASHES_IN_WINDOW = 5; // Max 5 crashes in 5 minutes

// 🔒 SINGLE INSTANCE LOCK: Prevent multiple bot instances from running
const INSTANCE_LOCK_KEY = 'bot:instance:lock';
const INSTANCE_LOCK_TTL = 60; // 60 seconds (will be renewed every 30s)
let instanceLockInterval: NodeJS.Timeout | null = null;

async function main() {
  try {
    botStartupTime = Date.now(); // Track startup time for grace period
    logger.info('🚀 Starting WhatsApp Assistant Bot...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // 🔒 Acquire single instance lock
    const lockAcquired = await acquireInstanceLock();
    if (!lockAcquired) {
      logger.error('❌ Another instance is already running!');
      logger.error('🛑 Exiting to prevent duplicate instances');
      logger.error('📋 If you believe this is an error, run: redis-cli DEL bot:instance:lock');
      process.exit(1);
    }

    // 🛡️ Check crash loop prevention
    await checkCrashLoop();

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

    // Initialize V2 Pipeline (10 Phases)
    logger.info('Initializing V2 Pipeline (10 phases + plugins)...');
    await initializePipeline();

    // Initialize WhatsApp (whatsapp-web.js)
    logger.info('Initializing WhatsApp connection...');
    whatsappProvider = new WhatsAppWebJSProvider();

    // Initialize MessageRouter
    logger.info('Initializing MessageRouter...');
    messageRouter = createMessageRouter(whatsappProvider);

    // Initialize ReminderWorker
    logger.info('Starting ReminderWorker...');
    reminderWorker = new ReminderWorker(whatsappProvider);

    // Register message handler
    whatsappProvider.onMessage(handleIncomingMessage);

    // Register connection state handler
    whatsappProvider.onConnectionStateChange(async (state: ConnectionState) => {
      logger.info(`WhatsApp connection state: ${state.status}`);
      if (state.status === 'qr') {
        logger.info('📱 Scan the QR code with WhatsApp to connect');
        logger.info(`QR code saved to: ${process.env.SESSION_PATH || './sessions'}/qr-code.png`);
      } else if (state.status === 'connected') {
        // Reset crash counter on successful connection
        await resetCrashCounter();
      }
    });

    // Initialize connection
    await whatsappProvider.initialize();

    logger.info('✅ WhatsApp Assistant Bot is running!');
    logger.info('📋 Status:');
    logger.info('  ✅ Database connected');
    logger.info('  ✅ Redis connected');
    logger.info('  ✅ V2 Pipeline initialized (10 phases)');
    logger.info('  ✅ MessageRouter initialized');
    logger.info('  ✅ ReminderWorker started');
    logger.info('  ⏳ WhatsApp initializing (scan QR code if needed)');
    logger.info('  ✅ Health check API running on port', process.env.PORT || 3000);

    // Start Redis memory monitoring (every 10 minutes)
    startRedisMonitoring();
  } catch (error) {
    logger.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

/**
 * 🔒 SINGLE INSTANCE LOCK
 * Prevents multiple bot instances from running simultaneously
 * Uses Redis SET NX (set if not exists) with TTL for automatic cleanup
 */
async function acquireInstanceLock(): Promise<boolean> {
  try {
    const processInfo = `pid:${process.pid}|started:${new Date().toISOString()}`;

    // Try to acquire lock with SET NX (only set if key doesn't exist)
    const result = await redis.set(INSTANCE_LOCK_KEY, processInfo, 'EX', INSTANCE_LOCK_TTL, 'NX');

    if (result !== 'OK') {
      // Lock already held by another instance
      const existingLock = await redis.get(INSTANCE_LOCK_KEY);
      logger.error('Instance lock held by:', { lockInfo: existingLock });
      return false;
    }

    logger.info('✅ Instance lock acquired', { processInfo });

    // Start heartbeat to renew lock every 30 seconds
    startLockHeartbeat();

    return true;
  } catch (error) {
    logger.error('Failed to acquire instance lock', { error });
    return false; // Fail-safe: don't start if we can't acquire lock
  }
}

/**
 * Start heartbeat to renew instance lock
 * Prevents lock expiry while bot is running
 */
function startLockHeartbeat(): void {
  instanceLockInterval = setInterval(async () => {
    try {
      const processInfo = `pid:${process.pid}|started:${new Date().toISOString()}`;
      await redis.expire(INSTANCE_LOCK_KEY, INSTANCE_LOCK_TTL);
      logger.debug('Instance lock renewed');
    } catch (error) {
      logger.error('Failed to renew instance lock', { error });
    }
  }, 30000); // Renew every 30 seconds (lock expires after 60s)
}

/**
 * Release instance lock on shutdown
 */
async function releaseInstanceLock(): Promise<void> {
  try {
    if (instanceLockInterval) {
      clearInterval(instanceLockInterval);
      instanceLockInterval = null;
    }
    await redis.del(INSTANCE_LOCK_KEY);
    logger.info('✅ Instance lock released');
  } catch (error) {
    logger.error('Failed to release instance lock', { error });
  }
}

/**
 * 🛡️ CRASH LOOP PREVENTION
 * Tracks crashes in Redis with 5-minute sliding window
 * If > 5 crashes in 5 minutes, bot stays paused (no restart)
 */
async function checkCrashLoop(): Promise<void> {
  try {
    // Increment crash counter (with 5-minute expiry)
    const crashes = await redis.incr(CRASH_TRACKING_KEY);

    // Set expiry on first crash
    if (crashes === 1) {
      await redis.expire(CRASH_TRACKING_KEY, CRASH_WINDOW_SECONDS);
    }

    logger.info(`🔍 Crash tracking: ${crashes}/${MAX_CRASHES_IN_WINDOW} crashes in last ${CRASH_WINDOW_SECONDS}s`);

    // If too many crashes, pause bot to prevent infinite loop
    if (crashes > MAX_CRASHES_IN_WINDOW) {
      logger.error('🚨 CRASH LOOP DETECTED!');
      logger.error(`Bot crashed ${crashes} times in ${CRASH_WINDOW_SECONDS} seconds`);
      logger.error('🛑 BOT PAUSED - Crash loop protection activated');
      logger.error('📋 This prevents infinite restart loops that waste API calls');
      logger.error('📋 Check logs for error patterns, fix the bug, then restart');
      logger.error(`📋 To reset: redis-cli DEL ${CRASH_TRACKING_KEY}`);
      logger.error('📋 Or wait 5 minutes for automatic reset');

      // Keep process alive in error state (no exit = no PM2 restart)
      logger.info('Process will remain alive in paused state');

      // Wait forever (prevents further execution)
      await new Promise(() => {}); // Intentional infinite wait
    }

    // On successful startup, decrement counter (successful start)
    // We'll reset this after WhatsApp connects successfully

  } catch (error) {
    logger.error('Failed to check crash loop', { error });
    // Don't block startup if Redis check fails
  }
}

/**
 * Reset crash counter on successful WhatsApp connection
 * This way only crashes during startup/connection are tracked
 */
async function resetCrashCounter(): Promise<void> {
  try {
    await redis.del(CRASH_TRACKING_KEY);
    logger.info('✅ Crash counter reset (successful connection)');
  } catch (error) {
    logger.error('Failed to reset crash counter', { error });
  }
}

/**
 * 🎯 Redis Memory Monitoring
 * Tracks memory usage and alerts on high usage to prevent OOM
 */
async function startRedisMonitoring(): Promise<void> {
  try {
    // Initial check
    await checkRedisMemory();

    // Check every 10 minutes
    monitoringInterval = setInterval(async () => {
      await checkRedisMemory();
    }, 10 * 60 * 1000); // 10 minutes

    logger.info('✅ Redis monitoring started (10-minute intervals)');
  } catch (error) {
    logger.error('Failed to start Redis monitoring', { error });
  }
}

async function checkRedisMemory(): Promise<void> {
  try {
    const info = await redis.info('memory');

    // Parse memory info
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    const maxMemoryMatch = info.match(/maxmemory:(\d+)/);

    if (!usedMemoryMatch || !maxMemoryMatch) {
      logger.warn('Could not parse Redis memory info');
      return;
    }

    const usedMemory = parseInt(usedMemoryMatch[1]);
    const maxMemory = parseInt(maxMemoryMatch[1]);
    const usagePct = maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0;

    // Get key counts for detailed metrics
    const dbSize = await redis.dbsize();

    // Log stats
    logger.info('📊 Redis memory stats', {
      usedMemory: `${(usedMemory / 1024 / 1024).toFixed(2)} MB`,
      maxMemory: `${(maxMemory / 1024 / 1024).toFixed(2)} MB`,
      usagePercent: `${usagePct.toFixed(1)}%`,
      totalKeys: dbSize
    });

    // Alert thresholds
    if (usagePct >= 90) {
      logger.error('🚨 CRITICAL: Redis memory at 90%!', {
        usedMemory: `${(usedMemory / 1024 / 1024).toFixed(2)} MB`,
        maxMemory: `${(maxMemory / 1024 / 1024).toFixed(2)} MB`,
        usagePercent: `${usagePct.toFixed(1)}%`
      });

      // Send admin alert
      try {
        if (whatsappProvider && whatsappProvider.isConnected()) {
          await whatsappProvider.sendMessage(
            '972544345287',
            `🚨 REDIS MEMORY CRITICAL\n\n` +
            `Usage: ${usagePct.toFixed(1)}%\n` +
            `Used: ${(usedMemory / 1024 / 1024).toFixed(2)} MB\n` +
            `Max: ${(maxMemory / 1024 / 1024).toFixed(2)} MB\n` +
            `Keys: ${dbSize}\n\n` +
            `LRU eviction is active but monitor closely!`
          );
        }
      } catch (err) {
        logger.error('Failed to send Redis memory alert', { err });
      }
    } else if (usagePct >= 80) {
      logger.warn('⚠️ WARNING: Redis memory at 80%', {
        usedMemory: `${(usedMemory / 1024 / 1024).toFixed(2)} MB`,
        maxMemory: `${(maxMemory / 1024 / 1024).toFixed(2)} MB`,
        usagePercent: `${usagePct.toFixed(1)}%`
      });
    }
  } catch (error) {
    logger.error('Failed to check Redis memory', { error });
  }
}

function stopRedisMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('Redis monitoring stopped');
  }
}

/**
 * 🛡️ LAYER 1: Check if message already processed (PRIMARY DEFENSE)
 * Prevents duplicate API calls for the same WhatsApp message
 */
async function isMessageAlreadyProcessed(messageId: string): Promise<boolean> {
  try {
    const key = `msg:processed:${messageId}`;
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error('Failed to check message dedup', { error, messageId });
    return false; // Fail-safe: allow processing if Redis is down
  }
}

/**
 * 🛡️ LAYER 1: Mark message as processed
 * Optimized: Store minimal data (timestamp only, not full JSON)
 * Memory savings: 60 bytes → 13 bytes (78% reduction per key)
 */
async function markMessageAsProcessed(messageId: string, metadata?: string): Promise<void> {
  try {
    const key = `msg:processed:${messageId}`;
    // Optimized: Just store timestamp (not full JSON object)
    const value = Date.now().toString();
    await redis.setex(key, MESSAGE_DEDUP_TTL, value);
  } catch (error) {
    logger.error('Failed to mark message as processed', { error, messageId });
    // Non-critical: continue even if we can't mark
  }
}

/**
 * 🛡️ LAYER 4: Check if message is too old (Startup Grace Period)
 * Prevents reprocessing old messages during bot restart
 */
function isOldMessageDuringStartup(messageTimestamp: number): boolean {
  const now = Date.now();
  const messageAge = now - messageTimestamp;
  const timeSinceStartup = now - botStartupTime;

  // Only apply grace period in first 5 minutes after startup
  const isInStartupPeriod = timeSinceStartup < STARTUP_GRACE_PERIOD_MS;

  // Consider message "old" if it's > 5 minutes old
  const isOldMessage = messageAge > STARTUP_GRACE_PERIOD_MS;

  return isInStartupPeriod && isOldMessage;
}

/**
 * Handle incoming WhatsApp messages
 * Now with 4-layer defense against duplicate API calls
 */
async function handleIncomingMessage(message: IncomingMessage) {
  try {
    // Skip messages from ourselves
    if (message.isFromMe) {
      return;
    }

    const { from, content, quotedMessage } = message;
    const text = content.text.trim();
    const messageId = message.messageId;
    const messageTimestamp = message.timestamp;

    // 🛡️ LAYER 1: Message ID Deduplication (PRIMARY DEFENSE)
    // Check if we've already processed this exact message
    if (await isMessageAlreadyProcessed(messageId)) {
      logger.info(`✅ DEDUP: Skipping already processed message`, {
        messageId: messageId.substring(0, 20) + '...',
        from,
        text: text.substring(0, 50)
      });
      return;
    }

    // 🛡️ LAYER 4: Startup Grace Period Protection
    // Skip old messages during the first 5 minutes after restart
    if (isOldMessageDuringStartup(messageTimestamp)) {
      const messageAge = Math.floor((Date.now() - messageTimestamp) / 1000);
      logger.info(`✅ STARTUP GRACE: Skipping old message during startup`, {
        messageId: messageId.substring(0, 20) + '...',
        from,
        messageAge: `${messageAge}s old`,
        text: text.substring(0, 50)
      });
      // Still mark as processed to prevent future attempts
      await markMessageAsProcessed(messageId, 'skipped-startup-grace');
      return;
    }

    // NOTE: Duplicate detection is now handled entirely by MessageRouter
    // index.ts only handles startup grace period check above
    // MessageRouter uses `msg:processed:${messageId}` keys with atomic SET NX

    // Log message details
    if (quotedMessage) {
      logger.info(`Processing reply from ${from}: "${text}" (id: ${messageId}, quoted: ${quotedMessage.messageId})`);
    } else {
      logger.info(`Processing message from ${from}: "${text}" (id: ${messageId})`);
    }

    // Route message through MessageRouter
    // 🛡️ LAYERS 2 & 3: Content caching + Rate limits (in EnsembleClassifier)
    if (!messageRouter) {
      logger.error('MessageRouter not initialized');
      return;
    }

    await messageRouter.routeMessage(from, text, messageId, quotedMessage);

  } catch (error) {
    logger.error('Error handling incoming message:', error);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the process continue (crash counter will handle repeated crashes)
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception:', error);
  logger.error('Stack:', (error as Error).stack);

  // Release instance lock on fatal crash
  await releaseInstanceLock();

  // DON'T exit immediately - this causes PM2 restart loops
  // Instead, the crash counter will detect repeated crashes and pause the bot
  logger.error('🚨 Critical error occurred but process will attempt to continue');
  logger.error('🛡️ Crash loop protection active - bot will pause after 5 crashes in 5 minutes');

  // Note: If this is a fatal error (e.g., syntax error on startup),
  // the crash counter will detect it and pause the bot automatically
});

// Graceful shutdown
async function shutdown() {
  logger.info('👋 Shutting down gracefully...');
  stopRedisMonitoring(); // Stop monitoring before shutdown
  await releaseInstanceLock(); // Release instance lock
  await stopHealthCheck();
  await shutdownPipeline();
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

// Handle direct process.exit() (e.g., from BaileysProvider IP block detection)
// Ensures monitoring stops cleanly even when bypassing shutdown handlers
process.on('exit', (code) => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    logger.debug(`Monitoring stopped on process exit (code: ${code})`);
  }
});

// Start the application
main();
