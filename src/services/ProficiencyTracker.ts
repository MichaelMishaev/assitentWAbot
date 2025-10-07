import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { UserProficiencyMetrics, ProficiencyLevel, MenuDisplayMode } from '../types/index.js';

/**
 * Tracks user proficiency and determines when to show menus
 * Uses Redis for fast access and PostgreSQL for persistence
 */
export class ProficiencyTracker {
  private readonly METRICS_KEY_PREFIX = 'user:proficiency:';
  private readonly IDLE_THRESHOLD_MS = 60000; // 60 seconds

  /**
   * Initialize metrics for a new user
   */
  async initializeMetrics(userId: string): Promise<void> {
    const metrics: UserProficiencyMetrics = {
      totalMessages: 0,
      nlpSuccessCount: 0,
      nlpFailureCount: 0,
      menuRequestCount: 0,
      lastMenuRequestTime: null,
      commandUsageCount: 0,
      errorCount: 0,
      sessionCount: 1,
      firstMessageAt: new Date(),
      lastUpdated: new Date()
    };

    await redis.set(
      this.METRICS_KEY_PREFIX + userId,
      JSON.stringify(metrics),
      'EX',
      86400 * 30 // 30 days TTL
    );

    logger.info('Initialized proficiency metrics', { userId });
  }

  /**
   * Get user metrics from Redis
   */
  async getMetrics(userId: string): Promise<UserProficiencyMetrics | null> {
    try {
      const data = await redis.get(this.METRICS_KEY_PREFIX + userId);
      if (!data) return null;

      const metrics = JSON.parse(data);
      // Convert date strings back to Date objects
      metrics.lastMenuRequestTime = metrics.lastMenuRequestTime
        ? new Date(metrics.lastMenuRequestTime)
        : null;
      metrics.firstMessageAt = new Date(metrics.firstMessageAt);
      metrics.lastUpdated = new Date(metrics.lastUpdated);

      return metrics;
    } catch (error) {
      logger.error('Failed to get proficiency metrics', { userId, error });
      return null;
    }
  }

  /**
   * Update metrics after user action
   */
  async trackMessage(userId: string): Promise<void> {
    let metrics = await this.getMetrics(userId);
    if (!metrics) {
      await this.initializeMetrics(userId);
      metrics = await this.getMetrics(userId);
      if (!metrics) return;
    }

    metrics.totalMessages++;
    metrics.lastUpdated = new Date();

    await this.saveMetrics(userId, metrics);
  }

  /**
   * Track successful NLP interaction
   */
  async trackNLPSuccess(userId: string): Promise<void> {
    const metrics = await this.getMetrics(userId);
    if (!metrics) return;

    metrics.nlpSuccessCount++;
    metrics.lastUpdated = new Date();

    await this.saveMetrics(userId, metrics);
  }

  /**
   * Track failed NLP interaction
   */
  async trackNLPFailure(userId: string): Promise<void> {
    const metrics = await this.getMetrics(userId);
    if (!metrics) return;

    metrics.nlpFailureCount++;
    metrics.lastUpdated = new Date();

    await this.saveMetrics(userId, metrics);
  }

  /**
   * Track menu request
   */
  async trackMenuRequest(userId: string): Promise<void> {
    const metrics = await this.getMetrics(userId);
    if (!metrics) return;

    metrics.menuRequestCount++;
    metrics.lastMenuRequestTime = new Date();
    metrics.lastUpdated = new Date();

    await this.saveMetrics(userId, metrics);
  }

  /**
   * Track command usage (like /ביטול, /תפריט)
   */
  async trackCommandUsage(userId: string): Promise<void> {
    const metrics = await this.getMetrics(userId);
    if (!metrics) return;

    metrics.commandUsageCount++;
    metrics.lastUpdated = new Date();

    await this.saveMetrics(userId, metrics);
  }

  /**
   * Track error
   */
  async trackError(userId: string): Promise<void> {
    const metrics = await this.getMetrics(userId);
    if (!metrics) return;

    metrics.errorCount++;
    metrics.lastUpdated = new Date();

    await this.saveMetrics(userId, metrics);
  }

  /**
   * Calculate proficiency level
   */
  async getProficiencyLevel(userId: string): Promise<ProficiencyLevel> {
    const metrics = await this.getMetrics(userId);
    if (!metrics) return 'novice';

    // Novice: 0-15 messages OR high error rate
    if (metrics.totalMessages < 15) {
      return 'novice';
    }

    // Calculate success rate
    const totalNLP = metrics.nlpSuccessCount + metrics.nlpFailureCount;
    const nlpSuccessRate = totalNLP > 0 ? metrics.nlpSuccessCount / totalNLP : 0;

    // Calculate command usage ratio (power user indicator)
    const commandRatio = metrics.totalMessages > 0
      ? metrics.commandUsageCount / metrics.totalMessages
      : 0;

    // Expert: 40+ messages AND high success rate AND uses commands
    if (
      metrics.totalMessages >= 40 &&
      nlpSuccessRate > 0.7 &&
      commandRatio > 0.2
    ) {
      return 'expert';
    }

    // Intermediate: everything in between
    if (metrics.totalMessages >= 15 && nlpSuccessRate > 0.5) {
      return 'intermediate';
    }

    // Default to novice if conditions aren't clear
    return 'novice';
  }

  /**
   * Determine if menu should be shown based on proficiency and preferences
   */
  async shouldShowMenu(
    userId: string,
    userMenuPreference: MenuDisplayMode,
    context: {
      isError: boolean;
      isIdle: boolean;
      lastMessageTime?: Date;
      isExplicitRequest: boolean;
    }
  ): Promise<{ show: boolean; type: 'full' | 'contextual' | 'none' }> {
    // Explicit menu request always shows full menu
    if (context.isExplicitRequest) {
      await this.trackMenuRequest(userId);
      return { show: true, type: 'full' };
    }

    // User preference overrides
    if (userMenuPreference === 'always') {
      return { show: true, type: 'full' };
    }

    if (userMenuPreference === 'never') {
      return { show: false, type: 'none' };
    }

    // Error-triggered menu (works for both 'adaptive' and 'errors_only')
    if (context.isError) {
      await this.trackError(userId);
      return { show: true, type: 'full' };
    }

    // For 'errors_only' mode, only show on errors
    if (userMenuPreference === 'errors_only') {
      // Show if idle for too long
      if (context.isIdle) {
        return { show: true, type: 'full' };
      }
      return { show: false, type: 'none' };
    }

    // Adaptive mode (default)
    const proficiency = await this.getProficiencyLevel(userId);

    // Novice users: show full menu after every action
    if (proficiency === 'novice') {
      return { show: true, type: 'full' };
    }

    // Intermediate users: show contextual mini-menu
    if (proficiency === 'intermediate') {
      // Show full menu if idle
      if (context.isIdle) {
        return { show: true, type: 'full' };
      }
      return { show: true, type: 'contextual' };
    }

    // Expert users: only show on idle or explicit request
    if (context.isIdle) {
      return { show: true, type: 'contextual' };
    }

    return { show: false, type: 'none' };
  }

  /**
   * Check if user is idle (no message in last 60 seconds)
   */
  isIdle(lastMessageTime: Date | undefined): boolean {
    if (!lastMessageTime) return true;
    return Date.now() - lastMessageTime.getTime() > this.IDLE_THRESHOLD_MS;
  }

  /**
   * Save metrics to Redis
   */
  private async saveMetrics(userId: string, metrics: UserProficiencyMetrics): Promise<void> {
    try {
      await redis.set(
        this.METRICS_KEY_PREFIX + userId,
        JSON.stringify(metrics),
        'EX',
        86400 * 30 // 30 days TTL
      );
    } catch (error) {
      logger.error('Failed to save proficiency metrics', { userId, error });
    }
  }

  /**
   * Get debug info for user proficiency
   */
  async getDebugInfo(userId: string): Promise<string> {
    const metrics = await this.getMetrics(userId);
    if (!metrics) return 'No metrics found';

    const proficiency = await this.getProficiencyLevel(userId);
    const totalNLP = metrics.nlpSuccessCount + metrics.nlpFailureCount;
    const successRate = totalNLP > 0
      ? ((metrics.nlpSuccessCount / totalNLP) * 100).toFixed(1)
      : '0';

    return `📊 Proficiency Debug:
Level: ${proficiency}
Messages: ${metrics.totalMessages}
NLP Success Rate: ${successRate}% (${metrics.nlpSuccessCount}/${totalNLP})
Commands Used: ${metrics.commandUsageCount}
Errors: ${metrics.errorCount}
Menu Requests: ${metrics.menuRequestCount}`;
  }
}

// Export singleton
export const proficiencyTracker = new ProficiencyTracker();
export default proficiencyTracker;
