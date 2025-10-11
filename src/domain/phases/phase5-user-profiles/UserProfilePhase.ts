/**
 * Phase 5: User Profiles & Smart Defaults
 *
 * Applies learned patterns and user preferences to fill missing fields:
 * - Uses default location for Hebrew calendar
 * - Applies preferred time of day if no time specified
 * - Uses common locations from history
 * - Applies default event duration
 *
 * Priority: #5
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';
import { pluginManager } from '../../../plugins/PluginManager.js';

interface UserProfile {
  userId: string;
  defaultLocation: string;
  patterns: UserPatterns;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  defaultEventDuration: number;
}

interface UserPatterns {
  commonTimes?: string[]; // e.g., ["10:00", "14:00", "16:00"]
  commonLocations?: string[]; // e.g., ["משרד", "בית", "תל אביב"]
  commonTitles?: string[]; // e.g., ["פגישה", "רופא", "ישיבה"]
  avgDuration?: number; // average event duration in minutes
}

export class UserProfilePhase extends BasePhase {
  readonly name = 'user-profiles';
  readonly order = 5;
  readonly description = 'Apply user preferences and learned patterns';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    // Always run to apply defaults
    return true;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const profile = await this.getUserProfile(context.userId);

      if (!profile) {
        logger.info('No user profile found, using system defaults');
        return this.success({ appliedDefaults: false });
      }

      const appliedDefaults = this.applySmartDefaults(context, profile);

      logger.info('User profile applied', {
        userId: context.userId,
        appliedDefaults,
        hasPatterns: Object.keys(profile.patterns).length > 0
      });

      return this.success({
        appliedDefaults,
        profile: {
          defaultLocation: profile.defaultLocation,
          preferredTimeOfDay: profile.preferredTimeOfDay,
          patternsCount: profile.patterns.commonTimes?.length || 0
        }
      });

    } catch (error) {
      logger.error('User profile phase failed', { error });
      return this.success({ appliedDefaults: false }, ['Failed to load user profile']);
    }
  }

  /**
   * Get user profile from database
   */
  private async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      // Get database plugin
      const db = pluginManager.getPlugin('database');
      if (!db) {
        logger.warn('Database plugin not registered');
        return null;
      }

      const result = await db.execute(
        `SELECT
          id as user_id,
          default_location,
          patterns_jsonb as patterns,
          preferred_time_of_day,
          default_event_duration
        FROM users
        WHERE id = $1`,
        { userId, messageId: '', timestamp: new Date(), metadata: {}, logger }
      );

      if (!result || result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        userId: row.user_id,
        defaultLocation: row.default_location || 'jerusalem',
        patterns: row.patterns || {},
        preferredTimeOfDay: row.preferred_time_of_day,
        defaultEventDuration: row.default_event_duration || 60
      };

    } catch (error) {
      logger.error('Failed to get user profile', { error });
      return null;
    }
  }

  /**
   * Apply smart defaults based on user profile
   */
  private applySmartDefaults(context: PhaseContext, profile: UserProfile): string[] {
    const applied: string[] = [];

    // 1. Apply default location for Hebrew calendar (if not already set)
    if (!context.getMetadata('userLocation')) {
      context.setMetadata('userLocation', profile.defaultLocation);
      applied.push('default_location');
    }

    // 2. Apply default time if no time specified
    if (context.entities.date && !context.entities.time && profile.preferredTimeOfDay) {
      const defaultTime = this.getDefaultTimeForPreference(profile.preferredTimeOfDay);
      context.entities.time = defaultTime;
      applied.push(`default_time_${profile.preferredTimeOfDay}`);
      context.addWarning(`שעה לא צוינה, השתמשתי בזמן ברירת מחדל: ${defaultTime}`);
    }

    // 3. Apply common location if missing and user has pattern
    if (!context.entities.location && profile.patterns.commonLocations && profile.patterns.commonLocations.length > 0) {
      const mostCommonLocation = profile.patterns.commonLocations[0];
      context.entities.location = mostCommonLocation;
      applied.push('common_location');
      context.addWarning(`מיקום לא צוין, השתמשתי במיקום הנפוץ: ${mostCommonLocation}`);
    }

    // 4. Apply default duration if not specified (for events with end time calculation)
    if (context.intent === 'create_event' && context.entities.date && !context.entities.endDate) {
      const duration = profile.patterns.avgDuration || profile.defaultEventDuration;

      if (context.entities.time) {
        // Calculate end time based on start time + duration
        const endDate = new Date(context.entities.date);
        endDate.setMinutes(endDate.getMinutes() + duration);
        context.entities.endDate = endDate;
        applied.push('default_duration');
      }
    }

    // 5. Enhance title with common patterns if very short
    if (context.entities.title && context.entities.title.length < 5 && profile.patterns.commonTitles) {
      // If user says just "פגישה", and they usually say "פגישה עם לקוח", suggest it
      const similarTitle = profile.patterns.commonTitles.find(t =>
        t.includes(context.entities.title!)
      );

      if (similarTitle && similarTitle !== context.entities.title) {
        context.addWarning(`האם התכוונת ל: "${similarTitle}"?`);
      }
    }

    return applied;
  }

  /**
   * Get default time based on user preference
   */
  private getDefaultTimeForPreference(preference: 'morning' | 'afternoon' | 'evening'): string {
    const defaults = {
      morning: '10:00',
      afternoon: '14:00',
      evening: '18:00'
    };
    return defaults[preference];
  }
}
