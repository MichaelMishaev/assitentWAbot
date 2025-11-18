/**
 * Recovery Script: Send Onboarding Message to User 972505900799
 *
 * This user was previously ignored due to bug in MessageRouter.ts
 * Now sending them the registration greeting message
 */

import dotenv from 'dotenv';
import logger from './src/utils/logger.js';
import { WhatsAppWebJSProvider } from './src/providers/WhatsAppWebJSProvider.js';

dotenv.config();

// User who didn't get a response
const TARGET_PHONE = '972505900799';

// Registration greeting message (from AuthRouter.ts line 60)
const ONBOARDING_MESSAGE = `ברוך הבא! 👋

בואו נתחיל ברישום.
מה השם שלך?`;

async function sendRecoveryMessage() {
  let provider: WhatsAppWebJSProvider | null = null;

  try {
    logger.info('🚀 Starting recovery script...');
    logger.info(`📱 Target: ${TARGET_PHONE}`);

    // Initialize WhatsApp provider
    logger.info('Initializing WhatsApp connection...');
    provider = new WhatsAppWebJSProvider();

    // Wait for connection
    provider.onConnectionStateChange((state) => {
      logger.info(`Connection state: ${state.status}`);
    });

    await provider.initialize();

    // Wait a bit for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (!provider.isConnected()) {
      throw new Error('WhatsApp provider not connected');
    }

    // Send the message
    logger.info('📤 Sending recovery message...');
    const messageId = await provider.sendMessage(TARGET_PHONE, ONBOARDING_MESSAGE);

    logger.info('✅ Recovery message sent successfully!', {
      messageId,
      phone: TARGET_PHONE,
      message: ONBOARDING_MESSAGE
    });

    // Disconnect
    logger.info('👋 Disconnecting...');
    await provider.disconnect();

    logger.info('✅ Script completed successfully');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Failed to send recovery message:', error);

    if (provider) {
      try {
        await provider.disconnect();
      } catch (err) {
        logger.error('Failed to disconnect:', err);
      }
    }

    process.exit(1);
  }
}

// Run the script
sendRecoveryMessage();
