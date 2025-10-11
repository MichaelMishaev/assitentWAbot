/**
 * Pattern Learner Service
 *
 * Learns user patterns over time by analyzing their event history:
 * - Common times (e.g., user often creates events at 10:00, 14:00)
 * - Common locations (e.g., "משרד", "בית", "תל אביב")
 * - Common titles/keywords (e.g., "פגישה", "רופא")
 * - Average event duration
 *
 * Patterns are stored in users.patterns_jsonb and used by UserProfilePhase
 */

import logger from '../../utils/logger.js';
import { pluginManager } from '../../plugins/PluginManager.js';

interface EventData {
  title?: string;
  time?: string;
  location?: string;
  duration?: number; // in minutes
}

interface LearnedPatterns {
  commonTimes: string[];
  commonLocations: string[];
  commonTitles: string[];
  avgDuration: number;
}

export class PatternLearner {
  private static instance: PatternLearner;

  private constructor() {}

  static getInstance(): PatternLearner {
    if (!PatternLearner.instance) {
      PatternLearner.instance = new PatternLearner();
    }
    return PatternLearner.instance;
  }

  /**
   * Learn patterns from a new event
   * Called after successful event creation
   */
  async learnFromEvent(userId: string, eventData: EventData): Promise<void> {
    try {
      // Get current patterns
      const currentPatterns = await this.getUserPatterns(userId);

      // Update patterns with new data
      const updatedPatterns = this.updatePatterns(currentPatterns, eventData);

      // Save back to database
      await this.savePatterns(userId, updatedPatterns);

      logger.info('Patterns updated for user', {
        userId,
        patternsCount: {
          times: updatedPatterns.commonTimes.length,
          locations: updatedPatterns.commonLocations.length,
          titles: updatedPatterns.commonTitles.length
        }
      });

    } catch (error) {
      logger.error('Failed to learn patterns', { error, userId });
      // Don't throw - pattern learning is not critical
    }
  }

  /**
   * Get user's current patterns
   */
  private async getUserPatterns(userId: string): Promise<LearnedPatterns> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        return this.getDefaultPatterns();
      }

      const result = await db.execute(
        'SELECT patterns_jsonb FROM users WHERE id = $1',
        { userId, messageId: '', timestamp: new Date(), metadata: {}, logger }
      );

      if (!result || result.length === 0) {
        return this.getDefaultPatterns();
      }

      const patterns = result[0].patterns_jsonb || {};
      return {
        commonTimes: patterns.commonTimes || [],
        commonLocations: patterns.commonLocations || [],
        commonTitles: patterns.commonTitles || [],
        avgDuration: patterns.avgDuration || 60
      };

    } catch (error) {
      logger.error('Failed to get user patterns', { error });
      return this.getDefaultPatterns();
    }
  }

  /**
   * Update patterns with new event data
   */
  private updatePatterns(current: LearnedPatterns, newEvent: EventData): LearnedPatterns {
    const updated = { ...current };

    // Update common times
    if (newEvent.time) {
      updated.commonTimes = this.addToFrequencyList(current.commonTimes, newEvent.time, 10);
    }

    // Update common locations
    if (newEvent.location) {
      updated.commonLocations = this.addToFrequencyList(current.commonLocations, newEvent.location, 10);
    }

    // Update common titles (extract keywords)
    if (newEvent.title) {
      const keywords = this.extractKeywords(newEvent.title);
      for (const keyword of keywords) {
        updated.commonTitles = this.addToFrequencyList(current.commonTitles, keyword, 20);
      }
    }

    // Update average duration
    if (newEvent.duration) {
      // Weighted average: 80% old, 20% new
      if (current.avgDuration > 0) {
        updated.avgDuration = Math.round(current.avgDuration * 0.8 + newEvent.duration * 0.2);
      } else {
        updated.avgDuration = newEvent.duration;
      }
    }

    return updated;
  }

  /**
   * Add item to frequency list, keeping only top N
   */
  private addToFrequencyList(list: string[], item: string, maxSize: number): string[] {
    const frequency = new Map<string, number>();

    // Count existing frequencies
    for (const existingItem of list) {
      frequency.set(existingItem, (frequency.get(existingItem) || 0) + 1);
    }

    // Increment new item
    frequency.set(item, (frequency.get(item) || 0) + 1);

    // Sort by frequency (descending)
    const sorted = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSize)
      .map(([value]) => value);

    return sorted;
  }

  /**
   * Extract keywords from title (simple Hebrew tokenization)
   */
  private extractKeywords(title: string): string[] {
    // Remove common words
    const stopWords = ['עם', 'ב', 'ל', 'של', 'את', 'על', 'אל', 'מ', 'ה'];

    const words = title
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !stopWords.includes(word));

    return words;
  }

  /**
   * Save patterns to database
   */
  private async savePatterns(userId: string, patterns: LearnedPatterns): Promise<void> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        throw new Error('Database plugin not available');
      }

      const sql = `UPDATE users
         SET patterns_jsonb = $2
         WHERE id = $1`;

      await db.execute(sql, {
        userId,
        messageId: '',
        timestamp: new Date(),
        metadata: { patterns: JSON.stringify(patterns) },
        logger
      });

    } catch (error) {
      logger.error('Failed to save patterns', { error });
      throw error;
    }
  }

  /**
   * Get default empty patterns
   */
  private getDefaultPatterns(): LearnedPatterns {
    return {
      commonTimes: [],
      commonLocations: [],
      commonTitles: [],
      avgDuration: 60
    };
  }

  /**
   * Suggest defaults based on learned patterns
   */
  suggestTime(patterns: LearnedPatterns): string | null {
    return patterns.commonTimes.length > 0 ? patterns.commonTimes[0] : null;
  }

  suggestLocation(patterns: LearnedPatterns): string | null {
    return patterns.commonLocations.length > 0 ? patterns.commonLocations[0] : null;
  }

  suggestDuration(patterns: LearnedPatterns): number {
    return patterns.avgDuration || 60;
  }
}

// Export singleton instance
export const patternLearner = PatternLearner.getInstance();
