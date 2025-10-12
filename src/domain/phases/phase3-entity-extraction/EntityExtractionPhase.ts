/**
 * Phase 3: Entity Extraction
 *
 * Extracts structured entities from user text:
 * - Dates and times (relative and absolute)
 * - Event titles
 * - Locations
 * - Contact names
 * - Durations
 * - Priorities
 *
 * This phase runs AFTER intent classification (Phase 1) and multi-event detection (Phase 2).
 * It enhances the entities that AI models provide with structured parsing.
 *
 * Priority: #3 (CRITICAL - Missing implementation)
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';
import { EntityExtractor } from './EntityExtractor.js';

export class EntityExtractionPhase extends BasePhase {
  readonly name = 'entity-extractor';
  readonly order = 3;
  readonly description = 'Extract structured entities from text (dates, times, titles, locations)';
  readonly isRequired = true; // Critical phase

  private extractor: EntityExtractor;

  constructor() {
    super();
    this.extractor = new EntityExtractor();
  }

  /**
   * Always run - we always need to extract entities
   */
  async shouldRun(context: PhaseContext): Promise<boolean> {
    return true;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const text = context.processedText;
      const intent = context.intent || 'create_event'; // Default intent
      const timezone = context.userTimezone;

      logger.info('Extracting entities', {
        text: text.substring(0, 100),
        intent,
        timezone
      });

      // Extract entities using EntityExtractor
      const extracted = this.extractor.extractEntities(text, intent, timezone);

      // Merge extracted entities into context
      // Preserve existing entities from previous phases, but add new ones
      if (extracted.title) {
        context.entities.title = extracted.title;
      }
      if (extracted.date) {
        context.entities.date = extracted.date;
      }
      if (extracted.time) {
        context.entities.time = extracted.time;
      }
      if (extracted.dateText) {
        context.entities.dateText = extracted.dateText;
      }
      if (extracted.location) {
        context.entities.location = extracted.location;
      }
      if (extracted.contactNames && extracted.contactNames.length > 0) {
        context.entities.contactName = extracted.contactNames[0]; // Store first contact
        // Store all as participants
        if (!context.entities.participants) {
          context.entities.participants = [];
        }
        for (const name of extracted.contactNames) {
          context.entities.participants.push({
            name,
            role: 'companion'
          });
        }
      }
      if (extracted.duration) {
        // Calculate end time if we have start time
        if (extracted.startTime || context.entities.date) {
          const startTime = extracted.startTime || context.entities.date!;
          const endTime = new Date(startTime.getTime() + extracted.duration * 60000);
          context.entities.endDate = endTime;
        }
      }
      if (extracted.priority) {
        context.entities.priority = extracted.priority;
      }
      if (extracted.notes) {
        context.entities.notes = extracted.notes;
      }

      // Calculate overall confidence
      const overallConfidence = this.extractor.getOverallConfidence(extracted);

      // Log extraction results
      const entityCount = [
        extracted.title,
        extracted.date,
        extracted.time,
        extracted.location,
        extracted.contactNames?.length,
        extracted.duration,
        extracted.priority
      ].filter(Boolean).length;

      logger.info('Entity extraction complete', {
        entityCount,
        confidence: overallConfidence.toFixed(2),
        hasTitle: !!extracted.title,
        hasDate: !!extracted.date,
        hasTime: !!extracted.time,
        hasLocation: !!extracted.location
      });

      // Warnings for low confidence
      const warnings: string[] = [];
      if (extracted.confidence.title < 0.7) {
        warnings.push('Low confidence in title extraction');
      }
      if (extracted.confidence.date < 0.7 && context.intent !== 'search_event') {
        warnings.push('Low confidence in date extraction');
      }

      return this.success({
        extracted,
        confidence: overallConfidence,
        entityCount
      }, warnings.length > 0 ? warnings : undefined);

    } catch (error) {
      logger.error('Entity extraction failed', { error });
      return this.error('Entity extraction failed: ' + (error as Error).message);
    }
  }
}
