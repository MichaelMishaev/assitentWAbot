import Redis from 'ioredis';
import logger from './utils/logger.js';

/**
 * Check production Redis for pending # bug reports
 */
async function checkProdBugs() {
  const prodRedisUrl = 'redis://default:uVqJSRHgJHxcckklpcZbFN00sRGAkpLZ@centerbeam.proxy.rlwy.net:19475';

  logger.info('🔍 Connecting to production Redis...');
  const redis = new Redis(prodRedisUrl);

  try {
    // Test connection
    await redis.ping();
    logger.info('✅ Connected to production Redis');

    // Get all user messages
    const messagesJson = await redis.lrange('user_messages', 0, -1);
    logger.info(`📨 Found ${messagesJson.length} total messages`);

    // Parse and filter for # bug reports
    const allMessages = messagesJson.map(json => JSON.parse(json));
    const bugReports = allMessages.filter(msg =>
      msg.messageText &&
      msg.messageText.trim().startsWith('#') &&
      msg.direction === 'incoming'
    );

    logger.info(`\n🐛 Found ${bugReports.length} total bug reports (# messages)`);

    // Separate pending vs fixed bugs
    const pendingBugs = bugReports.filter(bug => bug.status !== 'fixed');
    const fixedBugs = bugReports.filter(bug => bug.status === 'fixed');

    logger.info(`  ⏳ Pending: ${pendingBugs.length}`);
    logger.info(`  ✅ Fixed: ${fixedBugs.length}`);

    // Display pending bugs
    if (pendingBugs.length > 0) {
      logger.info('\n📋 PENDING BUGS:');
      logger.info('='.repeat(80));
      pendingBugs.forEach((bug, index) => {
        const timestamp = new Date(bug.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        logger.info(`\n${index + 1}. [${timestamp}]`);
        logger.info(`   Message: ${bug.messageText}`);
        logger.info(`   Phone: ${bug.phone}`);
        logger.info(`   Status: ${bug.status || 'pending'}`);
      });
      logger.info('\n' + '='.repeat(80));
    } else {
      logger.info('\n✨ No pending bugs found! All clean!');
    }

    // Display recently fixed bugs (for reference)
    if (fixedBugs.length > 0) {
      logger.info('\n📝 RECENTLY FIXED BUGS (for reference):');
      logger.info('='.repeat(80));
      const recentFixed = fixedBugs.slice(-5); // Last 5 fixed bugs
      recentFixed.forEach((bug, index) => {
        const timestamp = new Date(bug.timestamp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        const fixedAt = bug.fixedAt ? new Date(bug.fixedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : 'N/A';
        logger.info(`\n${index + 1}. [${timestamp}]`);
        logger.info(`   Message: ${bug.messageText}`);
        logger.info(`   Fixed: ${fixedAt}`);
        logger.info(`   Commit: ${bug.commitHash || 'N/A'}`);
      });
      logger.info('\n' + '='.repeat(80));
    }

    // Summary statistics
    logger.info('\n📊 SUMMARY:');
    logger.info(`  Total messages: ${messagesJson.length}`);
    logger.info(`  Total bug reports: ${bugReports.length}`);
    logger.info(`  Pending bugs: ${pendingBugs.length}`);
    logger.info(`  Fixed bugs: ${fixedBugs.length}`);

    if (pendingBugs.length > 0) {
      logger.info(`\n⚠️  ACTION REQUIRED: ${pendingBugs.length} bug(s) need fixing!`);
    }

    await redis.quit();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error checking prod bugs:', error);
    await redis.quit();
    process.exit(1);
  }
}

checkProdBugs();
