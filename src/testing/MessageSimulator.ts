import { EventEmitter } from 'events';
import { StateManager } from '../services/StateManager.js';
import { AuthService } from '../services/AuthService.js';
import { EventService } from '../services/EventService.js';
import { ReminderService } from '../services/ReminderService.js';
import { TaskService } from '../services/TaskService.js';
import { SettingsService } from '../services/SettingsService.js';
import { ContactService } from '../services/ContactService.js';
import { MessageRouter } from '../services/MessageRouter.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';
import logger from '../utils/logger.js';

/**
 * Test Message Provider - Simulates WhatsApp messages for testing
 */
class TestMessageProvider extends EventEmitter implements IMessageProvider {
  private messageLog: Array<{ phone: string; message: string; timestamp: Date }> = [];

  async sendMessage(phone: string, message: string): Promise<string> {
    this.messageLog.push({ phone, message, timestamp: new Date() });
    logger.info('[TEST] Bot sends:', { phone, message: message.substring(0, 100) });
    return `test_msg_${Date.now()}`;
  }

  async sendWithButtons(phone: string, message: string, buttons: string[]): Promise<string> {
    return this.sendMessage(phone, `${message}\n\nButtons: ${buttons.join(', ')}`);
  }

  getMessageLog(): Array<{ phone: string; message: string; timestamp: Date }> {
    return this.messageLog;
  }

  clearLog(): void {
    this.messageLog = [];
  }

  async initialize(): Promise<void> {
    logger.info('[TEST] Test message provider initialized');
  }

  async disconnect(): Promise<void> {
    logger.info('[TEST] Test message provider disconnected');
  }

  getConnectionState(): string {
    return 'CONNECTED'; // Always connected in testing
  }
}

/**
 * Message Simulator - Simulates user sending messages to the bot
 */
export class MessageSimulator {
  private messageRouter: MessageRouter;
  private testProvider: TestMessageProvider;
  private stateManager: StateManager;
  private authService: AuthService;
  private eventService: EventService;

  constructor(
    private testPhone: string = '972500000000',
    private testUserId: string = 'test-user-001'
  ) {
    this.testProvider = new TestMessageProvider();

    // Initialize services
    this.stateManager = new StateManager();
    this.authService = new AuthService();
    this.eventService = new EventService();
    const reminderService = new ReminderService();
    const taskService = new TaskService();
    const settingsService = new SettingsService();
    const contactService = new ContactService();

    // Create message router with test provider
    this.messageRouter = new MessageRouter(
      this.stateManager,
      this.authService,
      this.eventService,
      reminderService,
      contactService,
      settingsService,
      taskService,
      this.testProvider
    );
  }

  /**
   * Initialize test environment - create test user if needed
   */
  async initialize(): Promise<void> {
    try {
      // Check if test user exists
      const user = await this.authService.getUserByPhone(this.testPhone);
      if (!user) {
        // Create test user
        const newUser = await this.authService.registerUser(this.testPhone, 'Test User', '1234');
        this.testUserId = newUser.id;
        logger.info('[TEST] Created test user', { phone: this.testPhone, userId: this.testUserId });
      } else {
        this.testUserId = user.id;
        logger.info('[TEST] Using existing test user', { userId: this.testUserId });
      }
    } catch (error) {
      logger.error('[TEST] Failed to initialize test user', { error });
      throw error;
    }
  }

  /**
   * Send a message from user to bot
   */
  async sendUserMessage(message: string): Promise<void> {
    logger.info('[TEST] User sends:', { message });

    this.testProvider.clearLog();
    await this.messageRouter.routeMessage(this.testPhone, message, `test_${Date.now()}`);
  }

  /**
   * Get all bot responses from last message
   */
  getBotResponses(): string[] {
    return this.testProvider.getMessageLog().map(m => m.message);
  }

  /**
   * Get last bot response
   */
  getLastBotResponse(): string | null {
    const log = this.testProvider.getMessageLog();
    return log.length > 0 ? log[log.length - 1].message : null;
  }

  /**
   * Clear message log
   */
  clearLog(): void {
    this.testProvider.clearLog();
  }

  /**
   * Get current conversation state
   */
  async getCurrentState(): Promise<string> {
    const session = await this.stateManager.getState(this.testUserId);
    return session?.state || 'IDLE';
  }

  /**
   * Search for events
   */
  async searchEvents(term: string): Promise<any[]> {
    return this.eventService.searchEventsByTitle(this.testUserId, term);
  }

  /**
   * Get all events
   */
  async getAllEvents(): Promise<any[]> {
    return this.eventService.getUpcomingEvents(this.testUserId, 100);
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    try {
      // Delete all test user's events
      const events = await this.getAllEvents();
      for (const event of events) {
        await this.eventService.deleteEvent(event.id, this.testUserId);
      }
      logger.info('[TEST] Cleaned up test data');
    } catch (error) {
      logger.error('[TEST] Cleanup failed', { error });
    }
  }
}

/**
 * Test case runner
 */
export interface TestCase {
  name: string;
  steps: Array<{
    userMessage: string;
    expectedResponse?: string | RegExp;
    expectedState?: string;
    validate?: (response: string, simulator: MessageSimulator) => Promise<boolean>;
  }>;
}

export class TestRunner {
  constructor(private simulator: MessageSimulator) {}

  async runTest(testCase: TestCase): Promise<{
    passed: boolean;
    results: Array<{ step: number; passed: boolean; error?: string }>;
  }> {
    logger.info(`[TEST] Running test: ${testCase.name}`);
    const results: Array<{ step: number; passed: boolean; error?: string }> = [];

    for (let i = 0; i < testCase.steps.length; i++) {
      const step = testCase.steps[i];
      logger.info(`[TEST] Step ${i + 1}: ${step.userMessage}`);

      try {
        await this.simulator.sendUserMessage(step.userMessage);
        const response = this.simulator.getLastBotResponse() || '';
        const state = await this.simulator.getCurrentState();

        let passed = true;
        let error: string | undefined;

        // Check expected response
        if (step.expectedResponse) {
          if (typeof step.expectedResponse === 'string') {
            if (!response.includes(step.expectedResponse)) {
              passed = false;
              error = `Response doesn't contain expected text: "${step.expectedResponse}"`;
            }
          } else {
            // RegExp
            if (!step.expectedResponse.test(response)) {
              passed = false;
              error = `Response doesn't match pattern: ${step.expectedResponse}`;
            }
          }
        }

        // Check expected state
        if (step.expectedState && state !== step.expectedState) {
          passed = false;
          error = `State mismatch: expected ${step.expectedState}, got ${state}`;
        }

        // Custom validation
        if (step.validate) {
          const validationResult = await step.validate(response, this.simulator);
          if (!validationResult) {
            passed = false;
            error = 'Custom validation failed';
          }
        }

        results.push({ step: i + 1, passed, error });

        if (!passed) {
          logger.error(`[TEST] Step ${i + 1} FAILED:`, { error, response });
        } else {
          logger.info(`[TEST] Step ${i + 1} PASSED`);
        }
      } catch (err) {
        logger.error(`[TEST] Step ${i + 1} ERROR:`, { err });
        results.push({
          step: i + 1,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const passed = results.every(r => r.passed);
    logger.info(`[TEST] Test ${testCase.name}: ${passed ? 'PASSED ✅' : 'FAILED ❌'}`);

    return { passed, results };
  }

  async runTests(tests: TestCase[]): Promise<void> {
    let passedCount = 0;
    let failedCount = 0;

    for (const test of tests) {
      const result = await this.runTest(test);
      if (result.passed) {
        passedCount++;
      } else {
        failedCount++;
      }

      // Cleanup between tests
      await this.simulator.cleanup();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between tests
    }

    logger.info(`[TEST] Summary: ${passedCount} passed, ${failedCount} failed`);
  }
}
