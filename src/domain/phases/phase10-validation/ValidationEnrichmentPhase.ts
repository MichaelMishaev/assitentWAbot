/**
 * Phase 10: Validation & Enrichment
 *
 * Final validation phase that:
 * - Validates all extracted data (dates not in past, times valid, etc.)
 * - Enrich with additional context (weather, travel time, related events)
 * - Apply business rules (working hours, conflicts, etc.)
 * - Calculate confidence scores for each field
 *
 * This runs LAST, after all entity extraction and processing phases.
 *
 * Priority: #10 (CRITICAL - Final quality gate)
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';
import { DateTime } from 'luxon';

export class ValidationEnrichmentPhase extends BasePhase {
  readonly name = 'validation-enrichment';
  readonly order = 10;
  readonly description = 'Validate extracted data and enrich with additional context';
  readonly isRequired = true; // Critical - final quality gate

  /**
   * Always run - we always need to validate before persisting
   */
  async shouldRun(context: PhaseContext): Promise<boolean> {
    return true;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      logger.info('Starting validation & enrichment', {
        intent: context.intent,
        hasTitle: !!context.entities.title,
        hasDate: !!context.entities.date
      });

      const errors: string[] = [];
      const warnings: string[] = [];
      const enrichments: string[] = [];

      // ===== VALIDATION PHASE =====

      // 1. Validate date/time consistency
      if (context.entities.date && context.entities.endDate) {
        if (context.entities.endDate <= context.entities.date) {
          errors.push('End time must be after start time');
        }
      }

      // 2. Validate date is not in past (for creation intents)
      if ((context.intent === 'create_event' || context.intent === 'create_reminder') && context.entities.date) {
        const now = DateTime.now().setZone(context.userTimezone);
        const eventDate = DateTime.fromJSDate(context.entities.date).setZone(context.userTimezone);

        if (eventDate < now.minus({ minutes: 5 })) {
          // Allow 5 minutes grace period for "now"
          warnings.push('⚠️ Event date is in the past. Did you mean a future date?');
        }
      }

      // 3. Validate time format
      if (context.entities.time) {
        const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timePattern.test(context.entities.time)) {
          errors.push('Invalid time format (expected HH:MM)');
        }
      }

      // 4. Validate title exists for creation intents
      if ((context.intent === 'create_event' || context.intent === 'create_reminder')) {
        if (!context.entities.title || context.entities.title.trim().length === 0) {
          warnings.push('⚠️ Event title is missing. Using default title.');
          context.entities.title = 'אירוע חדש'; // "New event" in Hebrew
          enrichments.push('Added default title');
        }
      }

      // 5. Validate working hours (optional warning)
      if (context.entities.date && context.entities.time) {
        const eventDateTime = DateTime.fromJSDate(context.entities.date).setZone(context.userTimezone);
        const hour = eventDateTime.hour;

        if (hour < 6 || hour > 23) {
          warnings.push('⚠️ Event is scheduled outside typical working hours (6 AM - 11 PM)');
        }
      }

      // 6. Check for double-booking (if we have eventId to check against)
      // TODO: Implement double-booking detection
      // This requires querying the database for overlapping events
      // For now, we'll skip this and add it in a future iteration

      // 7. Validate recurrence pattern (if exists)
      if (context.entities.recurrence) {
        if (!context.entities.recurrence.pattern) {
          errors.push('Recurrence pattern is missing');
        }
        if (context.entities.recurrence.interval && context.entities.recurrence.interval < 1) {
          errors.push('Recurrence interval must be at least 1');
        }
      }

      // ===== ENRICHMENT PHASE =====

      // 1. Add default duration if missing (1 hour for events, 0 for reminders)
      if (context.intent === 'create_event' && context.entities.date && !context.entities.endDate) {
        const startTime = DateTime.fromJSDate(context.entities.date).setZone(context.userTimezone);
        const endTime = startTime.plus({ hours: 1 });
        context.entities.endDate = endTime.toJSDate();
        enrichments.push('Added default 1-hour duration');
        logger.info('Enriched with default duration', { startTime: startTime.toISO(), endTime: endTime.toISO() });
      }

      // 2. Add default priority if missing
      if ((context.intent === 'create_event' || context.intent === 'create_reminder') && !context.entities.priority) {
        context.entities.priority = 'normal';
        enrichments.push('Added default priority: normal');
      }

      // 3. Enrich with Hebrew date (if exists from Phase 4)
      if (context.entities.date && !context.entities.hebrewDate) {
        // Phase 4 (HebrewCalendar) should have added this already
        // If not, we'll skip it here
      }

      // 4. Format date text for display if missing
      if (context.entities.date && !context.entities.dateText) {
        const dt = DateTime.fromJSDate(context.entities.date).setZone(context.userTimezone);
        context.entities.dateText = dt.toFormat('dd/MM/yyyy HH:mm');
        enrichments.push('Generated display date text');
      }

      // 5. Add metadata flags
      if (context.entities.isVoiceMessage) {
        enrichments.push('Voice message detected - applied normalization');
      }

      // 6. Calculate overall confidence score
      let overallConfidence = context.confidence;

      // Boost confidence if we have all required fields
      if (context.entities.title && context.entities.date) {
        overallConfidence = Math.min(0.95, overallConfidence + 0.05);
        enrichments.push('Boosted confidence (has title + date)');
      }

      // Reduce confidence if we have warnings
      if (warnings.length > 0) {
        overallConfidence = Math.max(0.5, overallConfidence - 0.1 * warnings.length);
      }

      // Update context confidence
      context.confidence = overallConfidence;

      // ===== RESULTS =====

      // Log validation results
      logger.info('Validation & enrichment complete', {
        errors: errors.length,
        warnings: warnings.length,
        enrichments: enrichments.length,
        confidence: overallConfidence.toFixed(2)
      });

      // If we have errors, this is a critical failure
      if (errors.length > 0) {
        logger.error('Validation failed', { errors });
        return this.error(errors.join('; '), {
          validationErrors: errors,
          warnings,
          enrichments
        });
      }

      // Success with optional warnings
      return this.success({
        validated: true,
        confidence: overallConfidence,
        enrichments,
        warnings
      }, warnings);

    } catch (error) {
      logger.error('Validation & enrichment failed', { error });
      return this.error('Validation failed: ' + (error as Error).message);
    }
  }

  /**
   * Helper: Check if date is in the past
   */
  private isInPast(date: Date, timezone: string): boolean {
    const now = DateTime.now().setZone(timezone);
    const eventDate = DateTime.fromJSDate(date).setZone(timezone);
    return eventDate < now;
  }

  /**
   * Helper: Check if two date ranges overlap
   */
  private dateRangesOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date
  ): boolean {
    return start1 < end2 && end1 > start2;
  }
}
