/**
 * Message Provider Interface
 *
 * Abstraction layer for WhatsApp messaging providers.
 * Currently supports Baileys (unofficial), designed for future migration to WhatsApp Business API.
 */

export interface MessageContent {
  text: string;
  isVoice?: boolean; // True if this is a voice message transcription
  // Future: support for media, location, etc.
}

export interface QuotedMessageInfo {
  messageId: string;      // ID of the quoted/replied-to message
  participant?: string;   // Who sent the quoted message (for group chats)
}

export interface IncomingMessage {
  from: string;           // Phone number in international format (e.g., "972501234567")
  messageId: string;      // Unique message ID
  timestamp: number;      // Unix timestamp
  content: MessageContent;
  isFromMe: boolean;      // True if sent by the bot
  quotedMessage?: QuotedMessageInfo;  // Info about quoted/replied-to message (if any)
}

export interface MessageHandler {
  (message: IncomingMessage): Promise<void>;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'qr' | 'error';
  qrCode?: string;        // QR code for scanning (base64 or text)
  error?: string;         // Error message if status is 'error'
}

export interface ConnectionStateHandler {
  (state: ConnectionState): void;
}

export interface IMessageProvider {
  /**
   * Initialize the provider and establish connection
   * @returns Promise that resolves when initialized
   */
  initialize(): Promise<void>;

  /**
   * Send a text message to a recipient
   * @param to Phone number in international format (without +)
   * @param message Text message to send
   * @returns Promise that resolves with message ID
   */
  sendMessage(to: string, message: string): Promise<string>;

  /**
   * React to a message with an emoji
   * @param to Phone number in international format (without +)
   * @param messageId Message ID to react to
   * @param emoji Emoji to react with (e.g., '👍', '❤️', '✅')
   * @returns Promise that resolves when reaction is sent
   */
  reactToMessage(to: string, messageId: string, emoji: string): Promise<void>;

  /**
   * Register a handler for incoming messages
   * @param handler Function to call when message is received
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Register a handler for connection state changes
   * @param handler Function to call when connection state changes
   */
  onConnectionStateChange(handler: ConnectionStateHandler): void;

  /**
   * Disconnect and cleanup
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected
   */
  isConnected(): boolean;

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState;
}

export default IMessageProvider;
