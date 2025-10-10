/**
 * Automated Test Runner for WhatsApp Assistant Bot
 * Executes comprehensive test conversations from test-conversations.md
 *
 * Usage: npm run test:conversations
 */

// Add global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

import { createMessageRouter } from './src/services/MessageRouter.js';
import { IMessageProvider } from './src/providers/IMessageProvider.js';
import logger from './src/utils/logger.js';
import { redis } from './src/config/redis.js';

interface TestMessage {
  from: string;
  text: string;
  expectedResponse?: string | RegExp;
  delay?: number; // ms to wait before sending
}

interface TestConversation {
  id: number;
  name: string;
  description: string;
  phone: string;
  messages: TestMessage[];
}

/**
 * Mock Message Provider for Testing
 * Captures bot responses for validation
 */
class TestMessageProvider implements IMessageProvider {
  private responses: Map<string, string[]> = new Map();
  private lastResponse: string = '';
  private connected: boolean = false;

  async initialize(): Promise<void> {
    logger.info('✅ Test message provider initialized');
    this.connected = true;
  }

  async sendMessage(to: string, message: string): Promise<string> {
    // Store response for validation
    if (!this.responses.has(to)) {
      this.responses.set(to, []);
    }
    this.responses.get(to)!.push(message);
    this.lastResponse = message;

    // Generate mock message ID
    const messageId = `test_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.debug('Mock sent message', { to, messageLength: message.length, messageId });
    return messageId;
  }

  async reactToMessage(to: string, messageId: string, emoji: string): Promise<void> {
    logger.debug('Mock reaction', { to, messageId, emoji });
  }

  onMessage(handler: (message: any) => Promise<void>): void {
    // Not needed for testing - we're directly calling routeMessage
  }

  onConnectionStateChange(handler: (state: any) => void): void {
    // Not needed for testing
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('✅ Test message provider disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionState(): any {
    return {
      status: this.connected ? 'connected' : 'disconnected'
    };
  }

  // Test-specific methods
  getLastResponse(): string {
    return this.lastResponse;
  }

  getResponses(phone: string): string[] {
    return this.responses.get(phone) || [];
  }

  clearResponses(phone: string): void {
    this.responses.delete(phone);
  }
}

/**
 * Test Conversation 1: New User Onboarding
 */
const conversation1: TestConversation = {
  id: 1,
  name: 'New User Onboarding',
  description: 'Sarah, 32, busy mom, first-time user',
  phone: '+972521234567',
  messages: [
    {
      from: '+972521234567',
      text: 'היי',
      expectedResponse: /שלום.*עוזר אישי/,
    },
    {
      from: '+972521234567',
      text: 'אני לא מבינה איך זה עובד',
      expectedResponse: /דרך 1.*דרך 2/,
    },
    {
      from: '+972521234567',
      text: 'קבע פגישה עם רופא שיניים ביום שלישי בשעה 15:00',
      expectedResponse: /רופא שיניים.*15\/10/,
      delay: 1000,
    },
    {
      from: '+972521234567',
      text: 'מה יש לי השבוע?',
      expectedResponse: /אירועים בשבוע.*רופא שיניים/,
    },
    {
      from: '+972521234567',
      text: 'תן לי דף סיכום',
      expectedResponse: /הלוח האישי שלך מוכן.*https/,
      delay: 2000,
    },
  ],
};

/**
 * Test Conversation 2: Power User NLP
 */
const conversation2: TestConversation = {
  id: 2,
  name: 'Power User NLP',
  description: 'David, 28, software engineer, rapid NLP usage',
  phone: '+972529876543',
  messages: [
    {
      from: '+972529876543',
      text: 'קבע פגישה עם המנכ"ל מחר בשעה 10',
      expectedResponse: /פגישה עם המנכ"ל.*10:00/,
    },
    {
      from: '+972529876543',
      text: 'קבע פגישה עם הצוות ביום רביעי ב-14:00 במשרד',
      expectedResponse: /פגישה עם הצוות.*14:00.*במשרד/,
    },
    {
      from: '+972529876543',
      text: 'תזכיר לי כל יום בשעה 17:00 לעדכן סטטוס',
      expectedResponse: /לעדכן סטטוס.*17:00.*חוזר מידי יום/,
    },
    {
      from: '+972529876543',
      text: 'כן',
      expectedResponse: /התזכורת נוספה/,
    },
    {
      from: '+972529876543',
      text: 'מה יש לי השבוע?',
      expectedResponse: /אירועים בשבוע/,
    },
    {
      from: '+972529876543',
      text: 'רוצה לראות הכל',
      expectedResponse: /הלוח האישי שלך מוכן.*https/,
      delay: 2000,
    },
  ],
};

/**
 * Test Conversation 3: Typo & Error Recovery
 */
const conversation3: TestConversation = {
  id: 3,
  name: 'Typo & Error Recovery',
  description: 'Rachel, 45, mobile user with typos',
  phone: '+972547654321',
  messages: [
    {
      from: '+972547654321',
      text: 'קבעפגושה מצר בשעה 2',
      expectedResponse: /לא הבנתי/,
    },
    {
      from: '+972547654321',
      text: 'קבע פגישה מחר בשעה 14:00',
      expectedResponse: /פגישה.*מחר.*14:00/,
    },
    {
      from: '+972547654321',
      text: 'רוצלראות מהיש למחר',
      expectedResponse: /לא הבנתי/,
    },
    {
      from: '+972547654321',
      text: 'מה יש לי מחר',
      expectedResponse: /אירועים.*פגישה/,
    },
    {
      from: '+972547654321',
      text: '/תפריט',
      expectedResponse: /תפריט ראשי/,
    },
  ],
};

/**
 * Test Conversation 4: Recurring Reminders
 */
const conversation4: TestConversation = {
  id: 4,
  name: 'Recurring Reminders Master',
  description: 'Michael, 52, routine-oriented, loves recurring tasks',
  phone: '+972528765432',
  messages: [
    {
      from: '+972528765432',
      text: 'תזכיר לי כל יום ראשון בשעה 8:00 לשים זבל',
      expectedResponse: /לשים זבל.*חוזר כל יום ראשון/,
    },
    {
      from: '+972528765432',
      text: 'כן',
      expectedResponse: /התזכורת נוספה/,
    },
    {
      from: '+972528765432',
      text: 'תזכיר לי כל יום בשעה 7:30 לקחת תרופות',
      expectedResponse: /לקחת תרופות.*חוזר מידי יום/,
    },
    {
      from: '+972528765432',
      text: 'כן',
      expectedResponse: /התזכורת נוספה/,
    },
    {
      from: '+972528765432',
      text: 'הצג את כל התזכורות שלי',
      expectedResponse: /התזכורות שלך/,
    },
  ],
};

/**
 * Test Runner Class
 */
class TestRunner {
  private testsPassed = 0;
  private testsFailed = 0;
  private testResults: Array<{
    conversation: string;
    message: number;
    status: 'PASS' | 'FAIL';
    expected?: string;
    received?: string;
    error?: string;
  }> = [];
  private messageProvider: TestMessageProvider;
  private messageRouter: any;
  private authService: any;
  private stateManager: any;
  private pool: any;

  async initialize() {
    // Initialize test message provider and message router
    this.messageProvider = new TestMessageProvider();
    this.messageRouter = createMessageRouter(this.messageProvider);

    // Import services
    const { default: authService } = await import('./src/services/AuthService.js');
    const { default: stateManager } = await import('./src/services/StateManager.js');
    const { pool } = await import('./src/config/database.js');

    this.authService = authService;
    this.stateManager = stateManager;
    this.pool = pool;

    logger.info('✅ Test runner initialized with real MessageRouter');
  }

  /**
   * Run all test conversations
   */
  async runAll(): Promise<void> {
    logger.info('🧪 Starting Automated Test Suite');
    logger.info('================================\n');

    const conversations = [conversation1, conversation2, conversation3, conversation4];

    for (const conversation of conversations) {
      await this.runConversation(conversation);
      await this.sleep(5000); // 5 second delay between conversations
    }

    this.printResults();
  }

  /**
   * Run a single test conversation
   */
  async runConversation(conversation: TestConversation): Promise<void> {
    logger.info(`\n📋 Test Conversation ${conversation.id}: ${conversation.name}`);
    logger.info(`👤 Profile: ${conversation.description}`);
    logger.info(`📱 Phone: ${conversation.phone}`);
    logger.info('─'.repeat(70));

    // Clean up user data before test
    await this.cleanupUser(conversation.phone);

    let messageCount = 0;
    for (const message of conversation.messages) {
      messageCount++;
      await this.sendAndVerify(conversation, messageCount, message);

      // Wait between messages if specified
      if (message.delay) {
        await this.sleep(message.delay);
      } else {
        await this.sleep(500); // Default 500ms delay
      }
    }

    logger.info(`✅ Conversation ${conversation.id} completed\n`);
  }

  /**
   * Send message and verify response
   */
  private async sendAndVerify(
    conversation: TestConversation,
    messageNum: number,
    message: TestMessage
  ): Promise<void> {
    try {
      logger.info(`\n💬 Message ${messageNum}: "${message.text}"`);

      // Send message through real MessageRouter and capture bot response
      const response = await this.simulateMessage(message.text, message.from);

      // Verify expected response
      if (message.expectedResponse) {
        const matched = this.matchesExpected(response, message.expectedResponse);

        if (matched) {
          logger.info(`✅ PASS: Response matches expected pattern`);
          this.testsPassed++;
          this.testResults.push({
            conversation: `${conversation.id}: ${conversation.name}`,
            message: messageNum,
            status: 'PASS',
          });
        } else {
          logger.error(`❌ FAIL: Response does not match expected pattern`);
          logger.error(`   Expected: ${message.expectedResponse}`);
          logger.error(`   Received: ${response}`);
          this.testsFailed++;
          this.testResults.push({
            conversation: `${conversation.id}: ${conversation.name}`,
            message: messageNum,
            status: 'FAIL',
            expected: message.expectedResponse.toString(),
            received: response,
          });
        }
      } else {
        logger.info(`ℹ️  No verification - message sent successfully`);
        this.testsPassed++;
        this.testResults.push({
          conversation: `${conversation.id}: ${conversation.name}`,
          message: messageNum,
          status: 'PASS',
        });
      }
    } catch (error: any) {
      logger.error(`❌ ERROR: ${error.message}`);
      this.testsFailed++;
      this.testResults.push({
        conversation: `${conversation.id}: ${conversation.name}`,
        message: messageNum,
        status: 'FAIL',
        error: error.message,
      });
    }
  }

  /**
   * Send message through real MessageRouter and capture response
   */
  private async simulateMessage(text: string, from: string = '+972521234567'): Promise<string> {
    // Clear previous responses
    this.messageProvider.clearResponses(from);

    // Generate unique message ID for this test message
    const messageId = `test_incoming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Route message through real MessageRouter
    await this.messageRouter.routeMessage(from, text, messageId);

    // Wait a bit for async processing
    await this.sleep(200);

    // Get the bot's response
    const responses = this.messageProvider.getResponses(from);
    if (responses.length === 0) {
      return '[No response from bot]';
    }

    // Return the last response (most recent)
    return responses[responses.length - 1];
  }

  /**
   * Check if response matches expected pattern
   */
  private matchesExpected(response: string, expected: string | RegExp): boolean {
    if (typeof expected === 'string') {
      return response.includes(expected);
    } else {
      return expected.test(response);
    }
  }

  /**
   * Clean up and register user before test
   */
  private async cleanupUser(phone: string): Promise<void> {
    try {
      // Clean up Redis data
      const cleanPhone = phone.replace(/\+/g, '');
      const keys = await redis.keys(`*${cleanPhone}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      // Check if user exists in database
      let user = await this.authService.getUserByPhone(phone);

      if (user) {
        // Delete existing test user from database
        await this.pool.query('DELETE FROM users WHERE phone = $1', [phone]);
        await this.pool.query('DELETE FROM events WHERE user_id = $1', [user.id]);
        await this.pool.query('DELETE FROM reminders WHERE user_id = $1', [user.id]);
        logger.info(`🧹 Deleted existing test user from database: ${phone}`);
      }

      // Register new test user
      const testName = `Test User ${cleanPhone.slice(-4)}`;
      user = await this.authService.registerUser(phone, testName, '1234');

      // Authenticate the user
      await this.authService.loginUser(phone, '1234');

      // Set auth state in Redis (CRITICAL for authentication to work)
      // AuthRouter uses 'auth:state:' prefix + phone
      await redis.setex(`auth:state:${phone}`, 172800, JSON.stringify({
        authenticated: true,
        userId: user.id,
        phone: phone,
        failedAttempts: 0,
        lockoutUntil: null
      }));

      // Set main menu state
      await this.stateManager.setState(user.id, 'MAIN_MENU' as any, {});

      logger.info(`✅ Test user registered and authenticated: ${testName} (${phone})`);
    } catch (error: any) {
      logger.error(`Error setting up test user ${phone}:`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Print final test results
   */
  private printResults(): void {
    logger.info('\n\n');
    logger.info('═'.repeat(70));
    logger.info('📊 TEST RESULTS SUMMARY');
    logger.info('═'.repeat(70));
    logger.info(`\n✅ Tests Passed: ${this.testsPassed}`);
    logger.info(`❌ Tests Failed: ${this.testsFailed}`);
    logger.info(`📝 Total Tests: ${this.testsPassed + this.testsFailed}`);

    const passRate = ((this.testsPassed / (this.testsPassed + this.testsFailed)) * 100).toFixed(2);
    logger.info(`📈 Pass Rate: ${passRate}%\n`);

    if (this.testsFailed > 0) {
      logger.info('Failed Tests:');
      logger.info('─'.repeat(70));
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(result => {
          logger.error(`\n❌ ${result.conversation} - Message ${result.message}`);
          if (result.expected) logger.error(`   Expected: ${result.expected}`);
          if (result.received) logger.error(`   Received: ${result.received}`);
          if (result.error) logger.error(`   Error: ${result.error}`);
        });
    }

    logger.info('\n' + '═'.repeat(70));
    logger.info(`\n🏁 Test Suite Completed - ${passRate}% Pass Rate\n`);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info('🚀 Initializing test runner...');
    const runner = new TestRunner();
    await runner.initialize();
    logger.info('✅ Test runner initialized successfully');

    await runner.runAll();
    logger.info('✅ All tests completed successfully');

    // Close Redis connection
    await redis.quit();
    process.exit(0);
  } catch (error: any) {
    logger.error('❌ Fatal error running tests:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('Full error:', error);

    // Close Redis connection
    try {
      await redis.quit();
    } catch (redisError) {
      // Ignore
    }
    process.exit(1);
  }
}

// Run if called directly (ES module check)
main();

export { TestRunner, conversation1, conversation2, conversation3, conversation4 };
