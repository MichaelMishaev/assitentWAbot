/**
 * Recovery Script: Send Onboarding Message to User 972505900799
 *
 * This user was previously ignored due to bug in MessageRouter.ts
 * Now sending them the registration greeting message
 *
 * USAGE: node send-recovery-message.js (on production server)
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

// User who didn't get a response
const TARGET_PHONE = '972505900799@c.us';

// Registration greeting message (from AuthRouter.ts line 60)
const ONBOARDING_MESSAGE = `ברוך הבא! 👋

בואו נתחיל ברישום.
מה השם שלך?`;

async function sendRecoveryMessage() {
  console.log('🚀 Starting recovery script...');
  console.log(`📱 Target: ${TARGET_PHONE}`);

  // Initialize WhatsApp client with existing session
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'bot-session',
      dataPath: process.env.SESSION_PATH || './sessions'
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', () => {
    console.error('❌ QR code required - bot session not found!');
    console.error('This script requires an existing authenticated session.');
    process.exit(1);
  });

  client.on('authenticated', () => {
    console.log('✅ Authenticated with existing session');
  });

  client.on('ready', async () => {
    console.log('✅ Client is ready!');

    try {
      // Send the message
      console.log('📤 Sending recovery message...');
      await client.sendMessage(TARGET_PHONE, ONBOARDING_MESSAGE);

      console.log('✅ Recovery message sent successfully!');
      console.log('Message:', ONBOARDING_MESSAGE);

      // Disconnect
      console.log('👋 Disconnecting...');
      await client.destroy();

      console.log('✅ Script completed successfully');
      process.exit(0);

    } catch (error) {
      console.error('❌ Failed to send message:', error);
      await client.destroy();
      process.exit(1);
    }
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failure:', msg);
    process.exit(1);
  });

  console.log('🔌 Initializing client...');
  await client.initialize();
}

// Run the script
sendRecoveryMessage().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
