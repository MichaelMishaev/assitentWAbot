#!/usr/bin/env node

/**
 * Send WhatsApp deployment notification
 * Usage: node send-deployment-notification.js <status> <commit> <message>
 */

import { BaileysProvider } from '../dist/providers/BaileysProvider.js';

const NOTIFY_PHONE = '972544345287'; // Your phone number

async function sendNotification() {
  const status = process.argv[2] || 'unknown';
  const commit = process.argv[3] || 'unknown';
  const message = process.argv[4] || 'Deployment notification';

  const emoji = status === 'success' ? '✅' : status === 'failure' ? '❌' : '⚠️';

  const notificationMessage = `${emoji} *Deployment ${status.toUpperCase()}*

📦 Repository: wAssitenceBot
🔀 Branch: main
📝 Commit: ${commit}

${message}

🕐 Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })}`;

  try {
    console.log('Initializing WhatsApp provider...');
    const provider = new BaileysProvider();

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);

      provider.onConnectionStateChange((state) => {
        if (state.status === 'connected') {
          clearTimeout(timeout);
          resolve();
        } else if (state.status === 'error') {
          clearTimeout(timeout);
          reject(new Error(state.error || 'Connection error'));
        }
      });

      provider.initialize();
    });

    console.log('Sending notification to', NOTIFY_PHONE);
    await provider.sendMessage(NOTIFY_PHONE, notificationMessage);
    console.log('✅ Notification sent successfully');

    // Disconnect
    await provider.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    process.exit(1);
  }
}

sendNotification();
