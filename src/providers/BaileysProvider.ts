/**
 * Baileys WhatsApp Provider Implementation
 *
 * Uses @whiskeysockets/baileys for unofficial WhatsApp Web connection.
 * Implements IMessageProvider interface for abstraction.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  BaileysEventMap,
  proto,
  WAMessage,
  ConnectionState as BaileysConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import logger, {
  logWhatsAppConnection,
  logWhatsAppQRCode,
  logWhatsAppDisconnect,
  logWhatsAppReconnect,
  logWhatsAppMessageReceived,
  logWhatsAppMessageSent
} from '../utils/logger.js';
import {
  IMessageProvider,
  IncomingMessage,
  MessageHandler,
  ConnectionState,
  ConnectionStateHandler,
} from './IMessageProvider.js';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import qrCodeTerminal from 'qrcode-terminal';

export class BaileysProvider implements IMessageProvider {
  private socket: WASocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private connectionState: ConnectionState = { status: 'disconnected' };
  private sessionPath: string;
  private shouldReconnect: boolean = true;
  private authFailureCount: number = 0;
  private readonly MAX_AUTH_FAILURES = 3;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10; // HARD LIMIT: Max 10 reconnection attempts
  private readonly MAX_RECONNECT_DELAY = 60000; // 60 seconds max

  constructor(sessionPath?: string) {
    this.sessionPath = sessionPath || process.env.SESSION_PATH || './sessions';

    // Ensure session directory exists
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
      logger.info(`Created session directory: ${this.sessionPath}`);
    }
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Baileys WhatsApp client...');
      this.updateConnectionState({ status: 'connecting' });

      // Load auth state (session) from file
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

      // Create WhatsApp socket with proper configuration
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We handle QR manually
        markOnlineOnConnect: true,
        // Add browser info for better compatibility
        browser: ['Ubuntu', 'Chrome', '22.04.4'],
        // Enable retries
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        // Connect timeout
        connectTimeoutMs: 60000, // 60 seconds
      });

      // Save credentials whenever they update
      this.socket.ev.on('creds.update', saveCreds);

      // Handle connection updates (QR code, connected, disconnected)
      this.socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this));

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));

      logger.info('Baileys client initialized');
    } catch (error) {
      logger.error('Failed to initialize Baileys:', error);
      this.updateConnectionState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async handleConnectionUpdate(update: Partial<BaileysConnectionState>) {
    const { connection, lastDisconnect, qr } = update;

    // Handle QR code
    if (qr) {
      logger.info('QR Code received, scan with WhatsApp');
      logger.info('📱 Please scan the QR code to authenticate');

      // Display QR in terminal
      console.log('\n=== SCAN THIS QR CODE WITH WHATSAPP ===\n');
      qrCodeTerminal.generate(qr, { small: true });
      console.log('\n=== WhatsApp → Settings → Linked Devices → Link Device ===\n');

      // Also save to file
      try {
        const qrCodePath = path.join(this.sessionPath, 'qr-code.png');
        await QRCode.toFile(qrCodePath, qr);
        logger.info(`QR code also saved to: ${qrCodePath}`);

        // Log QR code event for monitoring
        logWhatsAppQRCode(qrCodePath);

        this.updateConnectionState({ status: 'qr', qrCode: qr });
      } catch (error) {
        logger.error('Failed to generate QR code file:', error);
        logWhatsAppQRCode('QR code generation failed');
        this.updateConnectionState({ status: 'qr', qrCode: qr });
      }
    }

    // Handle connection state changes
    if (connection) {
      logger.info(`Connection status: ${connection}`);
      logWhatsAppConnection(connection);

      if (connection === 'open') {
        logger.info('✅ WhatsApp connection established');
        // Reset counters on successful connection
        this.authFailureCount = 0;
        this.reconnectAttempts = 0;
        logWhatsAppConnection('connected', { authFailures: 0 });
        this.updateConnectionState({ status: 'connected' });
      } else if (connection === 'close') {
        await this.handleDisconnect(lastDisconnect);
      }
    }
  }

  private async handleDisconnect(lastDisconnect: any) {
    const shouldReconnect = this.shouldReconnect;
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const errorMessage = lastDisconnect?.error?.message || '';

    logger.warn(`Connection closed. Status code: ${statusCode}, Error: ${errorMessage}`);
    logWhatsAppDisconnect(errorMessage, statusCode);

    // Check if this is a real logout vs connection error
    // Real logout: status 401 with explicit logout
    // Connection failure: status 401 with "Connection Failure" message
    const isRealLogout = statusCode === DisconnectReason.loggedOut &&
                         !errorMessage.includes('Connection Failure') &&
                         !errorMessage.includes('Connection Error');

    // Determine if we should reconnect based on disconnect reason
    if (isRealLogout) {
      logger.error('❌ Logged out from WhatsApp. Please delete session and scan QR again.');
      logger.error('Run: rm -rf ./sessions && npm run dev');
      this.updateConnectionState({
        status: 'error',
        error: 'Logged out. Session invalidated.'
      });
      this.shouldReconnect = false;
    } else if (statusCode === DisconnectReason.restartRequired) {
      logger.warn('Restart required, reconnecting...');
      await this.reconnect();
    } else if (statusCode === DisconnectReason.timedOut) {
      logger.warn('Connection timed out, reconnecting...');
      await this.reconnect();
    } else if (statusCode === DisconnectReason.connectionLost) {
      logger.warn('Connection lost, reconnecting...');
      await this.reconnect();
    } else if (statusCode === DisconnectReason.connectionClosed) {
      logger.warn('Connection closed, attempting reconnect...');
      await this.reconnect();
    } else if (statusCode === 428) {
      // Connection Closed - try reconnecting once, might be temporary
      logger.warn('Connection closed (428), attempting reconnect...');
      await this.reconnect();
    } else if (statusCode === 405) {
      // Connection Failure (often shows as 405 in Baileys)
      // This is usually an auth issue, treat similar to 401/403
      this.authFailureCount++;
      logger.warn(`⚠️ Connection Failure (405) - Attempt ${this.authFailureCount}/${this.MAX_AUTH_FAILURES}`);

      if (this.authFailureCount >= this.MAX_AUTH_FAILURES) {
        logger.error(`❌ Connection failed ${this.MAX_AUTH_FAILURES} times. Session likely corrupted.`);
        logger.error('🧹 Automatically clearing session...');
        await this.clearSession();
        logger.info('✅ Session cleared. Attempting fresh connection to generate QR code...');

        // Reset counters and flags for fresh start
        this.authFailureCount = 0;
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;

        // Wait a bit before reconnecting to ensure session is fully cleared
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to reconnect - this should generate a QR code
        await this.reconnect();
      } else {
        logger.warn(`Connection failure, but might be temporary. Trying to reconnect... (${this.authFailureCount}/${this.MAX_AUTH_FAILURES})`);
        await this.reconnect();
      }
    } else if (statusCode === 401 || statusCode === 403) {
      // Connection failure during auth - could be:
      // 1. Normal restart disconnect (temporary 401)
      // 2. Actually corrupted session (persistent 401)

      this.authFailureCount++;
      logger.warn(`⚠️ Authentication failed (401/403) - Attempt ${this.authFailureCount}/${this.MAX_AUTH_FAILURES}`);

      // Don't auto-delete on first failure - could be temporary disconnect
      // Only delete if explicitly logged out or if connection keeps failing
      if (errorMessage.includes('Logged Out')) {
        logger.error('❌ Explicitly logged out from WhatsApp');
        await this.clearSession();
        this.updateConnectionState({
          status: 'error',
          error: 'Logged out. Session cleared. Restart to scan QR code.'
        });
        this.shouldReconnect = false;
      } else if (this.authFailureCount >= this.MAX_AUTH_FAILURES) {
        logger.error(`❌ Authentication failed ${this.MAX_AUTH_FAILURES} times. Session likely corrupted.`);
        logger.error('🧹 Automatically clearing session...');
        await this.clearSession();
        logger.info('✅ Session cleared. Attempting fresh connection to generate QR code...');

        // Reset counters and flags for fresh start
        this.authFailureCount = 0;
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;

        // Wait a bit before reconnecting to ensure session is fully cleared
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to reconnect - this should generate a QR code
        await this.reconnect();
      } else {
        logger.warn(`Authentication failed, but might be temporary. Trying to reconnect... (${this.authFailureCount}/${this.MAX_AUTH_FAILURES})`);
        logger.warn('If this keeps happening, session will be auto-cleared after 3 failures');
        // Try to reconnect - session files might still be valid
        await this.reconnect();
      }
    } else if (shouldReconnect) {
      logger.info('Attempting to reconnect...');
      await this.reconnect();
    } else {
      this.updateConnectionState({ status: 'disconnected' });
    }
  }

  private async reconnect() {
    if (!this.shouldReconnect) {
      logger.info('Reconnection disabled');
      return;
    }

    // 🚨 CRITICAL: Check max reconnection attempts (prevent infinite loops & cost disasters)
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error(`🛑 MAX RECONNECTION ATTEMPTS REACHED (${this.MAX_RECONNECT_ATTEMPTS})`);
      logger.error('🧹 Auto-clearing session to prevent cost escalation...');
      await this.clearSession();
      logger.error('❌ RECONNECTION STOPPED. Manual restart required.');
      logger.error('Run: pm2 restart ultrathink');

      this.shouldReconnect = false;
      this.updateConnectionState({
        status: 'error',
        error: `Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Session cleared. Restart required.`
      });
      return;
    }

    // Exponential backoff: 5s, 10s, 20s, 40s, 60s (max)
    this.reconnectAttempts++;
    const delay = Math.min(
      5000 * Math.pow(2, this.reconnectAttempts - 1),
      this.MAX_RECONNECT_DELAY
    );

    logger.info(`Reconnecting in ${delay / 1000} seconds... (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
    logWhatsAppReconnect();
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.initialize();
    } catch (error) {
      logger.error('Reconnection failed:', error);
      logWhatsAppDisconnect('Reconnection failed', 0);
      // Will retry on next disconnect with increased backoff (up to MAX_RECONNECT_ATTEMPTS)
    }
  }

  private async handleMessagesUpsert(event: BaileysEventMap['messages.upsert']) {
    const { messages, type } = event;

    // Only process new messages (not historical)
    if (type !== 'notify') return;

    for (const msg of messages) {
      await this.processIncomingMessage(msg);
    }
  }

  private async processIncomingMessage(msg: WAMessage) {
    try {
      // Skip if no message content
      if (!msg.message) return;

      // Extract basic message info
      const messageId = msg.key.id || '';
      const from = msg.key.remoteJid || '';
      const isFromMe = msg.key.fromMe || false;
      const timestamp = msg.messageTimestamp as number || Date.now();

      // Extract text content (handle different message types)
      let text = '';
      let quotedMessage: any = undefined;

      if (msg.message.conversation) {
        text = msg.message.conversation;
      } else if (msg.message.extendedTextMessage?.text) {
        text = msg.message.extendedTextMessage.text;

        // Extract quoted message info if this is a reply
        const contextInfo = msg.message.extendedTextMessage.contextInfo;
        if (contextInfo?.stanzaId) {
          quotedMessage = {
            messageId: contextInfo.stanzaId,
            participant: contextInfo.participant
          };
        }
      }

      // Skip if no text content
      if (!text) {
        logger.debug('Skipping non-text message');
        return;
      }

      // Clean phone number (remove @s.whatsapp.net suffix)
      const cleanPhone = from.replace('@s.whatsapp.net', '');

      const incomingMessage: IncomingMessage = {
        from: cleanPhone,
        messageId,
        timestamp,
        content: { text },
        isFromMe,
        quotedMessage
      };

      logger.info(`📩 Received message from ${cleanPhone}: "${text}"`);

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
    if (!this.socket) {
      throw new Error('WhatsApp socket not initialized');
    }

    if (!this.isConnected()) {
      throw new Error('WhatsApp not connected');
    }

    try {
      // Format phone number for WhatsApp (add @s.whatsapp.net suffix)
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

      // Send message
      const result = await this.socket.sendMessage(jid, { text: message });

      logger.info(`📤 Sent message to ${to}: "${message}"`);

      return result?.key?.id || 'unknown';
    } catch (error) {
      logger.error(`Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  async reactToMessage(to: string, messageId: string, emoji: string): Promise<void> {
    if (!this.socket) {
      throw new Error('WhatsApp socket not initialized');
    }

    if (!this.isConnected()) {
      throw new Error('WhatsApp not connected');
    }

    try {
      // Format phone number for WhatsApp (add @s.whatsapp.net suffix)
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

      // Send reaction
      await this.socket.sendMessage(jid, {
        react: {
          text: emoji,
          key: {
            remoteJid: jid,
            fromMe: false,
            id: messageId
          }
        }
      });

      logger.info(`👍 Reacted to message ${messageId} from ${to} with ${emoji}`);
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

    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
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

  private async clearSession(): Promise<void> {
    try {
      logger.info(`Clearing session directory: ${this.sessionPath}`);

      if (fs.existsSync(this.sessionPath)) {
        // Delete all files in session directory
        const files = fs.readdirSync(this.sessionPath);
        for (const file of files) {
          const filePath = path.join(this.sessionPath, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            logger.debug(`Deleted: ${filePath}`);
          }
        }
        logger.info('✅ Session files cleared successfully');
      } else {
        logger.info('Session directory does not exist, nothing to clear');
      }
    } catch (error) {
      logger.error('Failed to clear session:', error);
      throw error;
    }
  }
}

export default BaileysProvider;
