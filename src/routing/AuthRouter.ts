import { StateManager } from '../services/StateManager.js';
import { AuthService } from '../services/AuthService.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';
import { ConversationState, AuthState } from '../types/index.js';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * AuthRouter - Handles all authentication-related flows
 * Extracted from MessageRouter for better separation of concerns
 */
export class AuthRouter {
  private readonly AUTH_STATE_PREFIX = 'auth:state:';
  private readonly AUTH_STATE_TTL = 48 * 60 * 60; // 48 hours in seconds (172,800)
  private showMenuCallback?: (phone: string) => Promise<void>;

  constructor(
    private authService: AuthService,
    private stateManager: StateManager,
    private messageProvider: IMessageProvider,
    private redisClient: typeof redis
  ) {}

  /**
   * Set callback for showing menu after successful authentication
   */
  setShowMenuCallback(callback: (phone: string) => Promise<void>): void {
    this.showMenuCallback = callback;
  }

  /**
   * Main authentication flow handler
   * Routes to registration or login based on current auth state
   */
  async handleAuthFlow(
    from: string,
    text: string,
    authState: AuthState
  ): Promise<void> {
    if (authState.registrationStep === 'name') {
      await this.handleRegistrationName(from, text, authState);
    }
  }

  /**
   * Start new user registration flow
   */
  async startRegistration(from: string): Promise<void> {
    const authState: AuthState = {
      userId: null,
      phone: from,
      authenticated: false,
      failedAttempts: 0,
      lockoutUntil: null,
      registrationStep: 'name',
      tempData: {}
    };

    await this.setAuthState(from, authState);
    await this.sendMessage(from, 'ברוך הבא! 👋\n\nבואו נתחיל ברישום.\nמה השם שלך?');
  }

  /**
   * Handle registration - name input step
   */
  async handleRegistrationName(
    from: string,
    text: string,
    authState: AuthState
  ): Promise<void> {
    const name = text.trim();

    if (name.length < 2) {
      await this.sendMessage(from, 'השם קצר מדי. אנא הזן שם בן 2 תווים לפחות.');
      return;
    }

    if (name.length > 50) {
      await this.sendMessage(from, 'השם ארוך מדי. אנא הזן שם קצר יותר.');
      return;
    }

    try {
      const user = await this.authService.registerUser(from, name);
      authState.userId = user.id;
      authState.authenticated = true;
      authState.registrationStep = 'complete';
      authState.tempData = {};
      await this.setAuthState(from, authState);
      await this.stateManager.setState(user.id, ConversationState.MAIN_MENU);

      // Send welcome message with onboarding instructions
      const welcomeMessage = `🎉 הרישום הושלם בהצלחה!

ברוך הבא, ${name}! 👋

אני עוזר הווטסאפ שלך לניהול יומן ותזכורות.

💬 דבר אליי בשפה טבעית:
• "צור אירוע מחר בשעה 3 - פגישה עם דני"
• "תזכיר לי להתקשר לרופא מחר ב-10:00"
• "מה יש לי היום?"
• "create personal report" - דוח HTML מעוצב 📊

📋 או השתמש בתפריט:
שלח /תפריט בכל עת`;

      await this.sendMessage(from, welcomeMessage);

      // Show main menu after successful registration
      if (this.showMenuCallback) {
        await this.showMenuCallback(from);
      }

    } catch (error) {
      logger.error('Registration failed', { from, error });
      await this.sendMessage(from, 'אירעה שגיאה ברישום. אנא נסה שוב מאוחר יותר.');
      await this.clearAuthState(from);
    }
  }


  /**
   * Start user login flow (auto-login)
   */
  async startLogin(from: string): Promise<void> {
    try {
      const user = await this.authService.loginUser(from);

      if (!user) {
        // User doesn't exist
        await this.sendMessage(from, 'משתמש לא קיים. נסה להירשם תחילה.');
        return;
      }

      const authState: AuthState = {
        userId: user.id,
        phone: from,
        authenticated: true,
        failedAttempts: 0,
        lockoutUntil: null
      };

      await this.setAuthState(from, authState);
      await this.stateManager.setState(user.id, ConversationState.MAIN_MENU);

      await this.sendMessage(from, `שלום, ${user.name}! 😊`);

      // Show main menu after successful login
      if (this.showMenuCallback) {
        await this.showMenuCallback(from);
      }

    } catch (error: any) {
      logger.error('Login failed', { from, error });
      const errorMessage = error.message || 'אירעה שגיאה בהתחברות. אנא נסה שוב.';
      await this.sendMessage(from, errorMessage);
      await this.clearAuthState(from);
    }
  }


  // ========== AUTH STATE HELPERS ==========

  /**
   * Get authentication state for a phone number
   */
  async getAuthState(phone: string): Promise<AuthState | null> {
    try {
      const key = this.getAuthStateKey(phone);
      const data = await this.redisClient.get(key);
      if (!data) return null;

      const authState: AuthState = JSON.parse(data);
      if (authState.lockoutUntil) {
        authState.lockoutUntil = new Date(authState.lockoutUntil);
      }
      return authState;
    } catch (error) {
      logger.error('Failed to get auth state', { phone, error });
      return null;
    }
  }

  /**
   * Set authentication state for a phone number
   */
  async setAuthState(phone: string, authState: AuthState): Promise<void> {
    const key = this.getAuthStateKey(phone);
    await this.redisClient.setex(key, this.AUTH_STATE_TTL, JSON.stringify(authState));
  }

  /**
   * Clear authentication state for a phone number
   */
  async clearAuthState(phone: string): Promise<void> {
    const key = this.getAuthStateKey(phone);
    await this.redisClient.del(key);
  }

  /**
   * Get Redis key for auth state
   */
  private getAuthStateKey(phone: string): string {
    return `${this.AUTH_STATE_PREFIX}${phone}`;
  }

  /**
   * Send message via message provider
   */
  private async sendMessage(to: string, message: string): Promise<string> {
    return await this.messageProvider.sendMessage(to, message);
  }
}
