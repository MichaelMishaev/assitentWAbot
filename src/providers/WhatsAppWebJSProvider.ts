/**
 * WhatsApp-Web.js Provider Implementation
 *
 * Uses whatsapp-web.js (Puppeteer-based) for WhatsApp Web connection.
 * Implements IMessageProvider interface for abstraction.
 *
 * This replaces BaileysProvider due to WhatsApp blocking Baileys buildHash (Oct 13, 2025).
 */

// whatsapp-web.js is a CommonJS module, need to import differently for ESM
import wwebjs from 'whatsapp-web.js';
const { Client, LocalAuth } = wwebjs;
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import logger from '../utils/logger.js';
import {
  IMessageProvider,
  IncomingMessage,
  MessageHandler,
  ConnectionState,
  ConnectionStateHandler,
} from './IMessageProvider.js';
import path from 'path';
import fs from 'fs';

export class WhatsAppWebJSProvider implements IMessageProvider {
  private client: any = null; // Client type from whatsapp-web.js
  private messageHandlers: MessageHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private connectionState: ConnectionState = { status: 'disconnected' };
  private sessionPath: string;
  private shouldReconnect: boolean = true;
  private isInitializing: boolean = false;

  // Cache message objects for reactions (messageId -> Message object)
  private messageCache: Map<string, any> = new Map();

  constructor(sessionPath?: string) {
    this.sessionPath = sessionPath || process.env.SESSION_PATH || './sessions';

    // Ensure session directory exists
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
      logger.info(`Created session directory: ${this.sessionPath}`);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitializing) {
      logger.warn('Already initializing, skipping duplicate call');
      return;
    }

    try {
      this.isInitializing = true;
      logger.info('Initializing WhatsApp-Web.js client...');
      this.updateConnectionState({ status: 'connecting' });

      // Create WhatsApp client with LocalAuth strategy
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.sessionPath,
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
            '--disable-gpu',
          ],
        },
      });

      // QR Code event
      this.client.on('qr', async (qr: string) => {
        logger.info('📱 QR Code received, scan with WhatsApp');

        // Display QR in terminal
        console.log('\n=== SCAN THIS QR CODE WITH WHATSAPP ===\n');
        qrcode.generate(qr, { small: true });
        console.log('\n=== WhatsApp → Settings → Linked Devices → Link Device ===\n');

        // Save to file
        try {
          const qrCodePath = path.join(this.sessionPath, 'qr-code.png');
          await QRCode.toFile(qrCodePath, qr);
          logger.info(`QR code also saved to: ${qrCodePath}`);
        } catch (error) {
          logger.error('Failed to generate QR code file:', error);
        }

        this.updateConnectionState({ status: 'qr', qrCode: qr });
      });

      // Ready event
      this.client.on('ready', () => {
        logger.info('✅ WhatsApp connection established');
        this.updateConnectionState({ status: 'connected' });
        this.isInitializing = false;
      });

      // Authenticated event
      this.client.on('authenticated', () => {
        logger.info('✅ WhatsApp authenticated');
      });

      // Authentication failure event
      this.client.on('auth_failure', (msg: any) => {
        logger.error('❌ Authentication failure:', msg);
        this.updateConnectionState({
          status: 'error',
          error: `Authentication failed: ${msg}`,
        });
        this.isInitializing = false;
      });

      // Disconnected event
      this.client.on('disconnected', (reason: any) => {
        logger.warn('⚠️ WhatsApp disconnected:', reason);
        this.updateConnectionState({ status: 'disconnected' });

        if (this.shouldReconnect) {
          logger.info('Attempting to reconnect...');
          setTimeout(() => {
            this.initialize();
          }, 5000);
        }
      });

      // Message event
      this.client.on('message', async (msg: any) => {
        console.log('🔔 MESSAGE EVENT FIRED!', { from: msg.from, body: msg.body, fromMe: msg.fromMe });
        await this.processIncomingMessage(msg);
      });

      // Initialize the client
      await this.client.initialize();

      logger.info('WhatsApp-Web.js client initialized');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp-Web.js:', error);
      this.updateConnectionState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.isInitializing = false;
      throw error;
    }
  }

  private async processIncomingMessage(msg: any) {
    try {
      console.log('🔍 Processing message:', { from: msg.from, fromMe: msg.fromMe, body: msg.body });

      // Skip messages from ourselves
      if (msg.fromMe) {
        console.log('⏭️ Skipping message from self');
        return;
      }

      // Extract message info
      const messageId = msg.id._serialized;
      const from = msg.from.replace('@c.us', ''); // Clean phone number
      // whatsapp-web.js returns timestamp in SECONDS, we need MILLISECONDS
      const timestamp = msg.timestamp * 1000;
      const text = msg.body;

      console.log('📝 Extracted info:', { messageId, from, timestamp, text });

      // Cache message object for potential reactions
      // Keep last 100 messages (clear old ones to prevent memory leak)
      if (this.messageCache.size > 100) {
        const firstKey = this.messageCache.keys().next().value;
        if (firstKey) {
          this.messageCache.delete(firstKey);
        }
      }
      this.messageCache.set(messageId, msg);

      // Skip if no text content
      if (!text) {
        console.log('⏭️ Skipping non-text message');
        logger.debug('Skipping non-text message');
        return;
      }

      // Extract quoted message info if this is a reply
      let quotedMessage: any = undefined;
      if (msg.hasQuotedMsg) {
        const quoted = await msg.getQuotedMessage();
        quotedMessage = {
          messageId: quoted.id._serialized,
          participant: quoted.from,
        };
      }

      const incomingMessage: IncomingMessage = {
        from,
        messageId,
        timestamp,
        content: { text },
        isFromMe: msg.fromMe,
        quotedMessage,
      };

      logger.info(`📩 Received message from ${from}: "${text}"`);

      // Call all registered message handlers
      for (const handler of this.messageHandlers) {
        try {
          await handler(incomingMessage);
        } catch (error) {
          logger.error('Error in message handler:', error);
        }
      }
    } catch (error) {
      logger.error('Error processing incoming message:', error);
    }
  }

  async sendMessage(to: string, message: string): Promise<string> {
    if (!this.client) {
      throw new Error('WhatsApp client not initialized');
    }

    if (!this.isConnected()) {
      throw new Error('WhatsApp not connected');
    }

    try {
      // Format phone number for WhatsApp (add @c.us suffix)
      const chatId = to.includes('@') ? to : `${to}@c.us`;

      // Send message
      const result = await this.client.sendMessage(chatId, message);

      logger.info(`📤 Sent message to ${to}: "${message}"`);

      return result.id._serialized;
    } catch (error) {
      logger.error(`Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  async reactToMessage(to: string, messageId: string, emoji: string): Promise<void> {
    if (!this.client) {
      throw new Error('WhatsApp client not initialized');
    }

    if (!this.isConnected()) {
      throw new Error('WhatsApp not connected');
    }

    try {
      // Get cached message object
      const messageObj = this.messageCache.get(messageId);

      if (!messageObj) {
        logger.warn(`Message ${messageId} not found in cache, cannot react`);
        return;
      }

      // Use whatsapp-web.js react() API
      await messageObj.react(emoji);
      logger.info(`✅ Reacted to message ${messageId} with ${emoji}`);
    } catch (error) {
      logger.error(`Failed to react to message ${messageId} from ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
    logger.debug('Message handler registered');
  }

  onConnectionStateChange(handler: ConnectionStateHandler): void {
    this.connectionStateHandlers.push(handler);
    logger.debug('Connection state handler registered');
  }

  private updateConnectionState(state: ConnectionState) {
    this.connectionState = state;

    // Notify all handlers
    for (const handler of this.connectionStateHandlers) {
      try {
        handler(state);
      } catch (error) {
        logger.error('Error in connection state handler:', error);
      }
    }
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting WhatsApp...');
    this.shouldReconnect = false;

    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }

    this.updateConnectionState({ status: 'disconnected' });
    logger.info('WhatsApp disconnected');
  }

  isConnected(): boolean {
    return this.connectionState.status === 'connected';
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
}

export default WhatsAppWebJSProvider;
