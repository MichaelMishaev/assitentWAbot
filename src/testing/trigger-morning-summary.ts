/**
 * Manual trigger for morning summary - sends summary to all enabled users NOW
 * Used for testing the morning summary feature
 */

import dotenv from 'dotenv';
import { pool } from '../config/database.js';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { MorningSummaryService } from '../services/MorningSummaryService.js';
import { UserService } from '../services/UserService.js';
import { WhatsAppWebJSProvider } from '../providers/WhatsAppWebJSProvider.js';
import { DateTime } from 'luxon';

dotenv.config();

async function triggerMorningSummaries() {
  console.log('\n🌅 Triggering Morning Summaries Manually\n');

  const morningSummaryService = new MorningSummaryService();
  const userService = new UserService();
  let whatsappProvider: WhatsAppWebJSProvider | null = null;

  try {
    // Get users with morning notifications enabled
    const users = await userService.getUsersWithMorningNotifications();
    console.log(`✅ Found ${users.length} users with morning notifications enabled\n`);

    if (users.length === 0) {
      console.log('⚠️  No users with morning notifications enabled');
      return;
    }

    // Initialize WhatsApp provider (for sending messages)
    console.log('📱 Initializing WhatsApp provider...');
    whatsappProvider = new WhatsAppWebJSProvider();
    await whatsappProvider.initialize();

    // Wait for connection
    console.log('⏳ Waiting for WhatsApp connection...');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    if (!whatsappProvider.isConnected()) {
      console.log('❌ WhatsApp not connected! Cannot send messages.');
      return;
    }

    console.log('✅ WhatsApp connected!\n');

    // Generate and send summary for each user
    let sent = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        console.log(`\n👤 Processing user: ${user.phone}`);

        // Check if should send today
        const shouldSend = morningSummaryService.shouldSendToday(user);
        if (!shouldSend) {
          console.log(`⏭️  Skipped - not scheduled for today`);
          skipped++;
          continue;
        }

        // Generate summary
        const summary = await morningSummaryService.generateSummaryForUser(
          user.id,
          DateTime.now().setZone(user.timezone || 'Asia/Jerusalem').toJSDate()
        );

        if (!summary) {
          console.log(`⏭️  Skipped - no events/reminders for today`);
          skipped++;
          continue;
        }

        // Send via WhatsApp
        console.log(`📤 Sending summary to ${user.phone}...`);
        await whatsappProvider.sendMessage(user.phone, summary);
        console.log(`✅ Summary sent successfully!`);
        sent++;

        // Small delay between messages
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Error processing user ${user.phone}:`, error);
      }
    }

    console.log('\n========================================');
    console.log('📊 Summary Statistics');
    console.log('========================================');
    console.log(`Total users with notifications: ${users.length}`);
    console.log(`✅ Summaries sent: ${sent}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    // Cleanup
    if (whatsappProvider) {
      await whatsappProvider.disconnect();
    }
    await pool.end();
    await redis.quit();
    process.exit(0);
  }
}

// Run the trigger
triggerMorningSummaries().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
