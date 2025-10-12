/**
 * Phase Initializer
 *
 * Registers all 10 phases with the PipelineOrchestrator.
 * This should be called during application startup.
 */

import logger from '../../utils/logger.js';
import { pipelineOrchestrator } from './PipelineOrchestrator.js';
import { pluginManager } from '../../plugins/PluginManager.js';

// Import all phases
import { VoiceNormalizerPhase } from '../phases/phase10-voice/VoiceNormalizerPhase.js';
import { EnsembleClassifier } from '../phases/phase1-intent/EnsembleClassifier.js';
import { MultiEventPhase } from '../phases/phase2-multi-event/MultiEventPhase.js';
import { EntityExtractionPhase } from '../phases/phase3-entity-extraction/EntityExtractionPhase.js';
import { HebrewCalendarPhase } from '../phases/phase4-hebrew-calendar/HebrewCalendarPhase.js';
import { UserProfilePhase } from '../phases/phase5-user-profiles/UserProfilePhase.js';
import { UpdateDeletePhase } from '../phases/phase6-update-delete/UpdateDeletePhase.js';
import { RecurrencePhase } from '../phases/phase7-recurrence/RecurrencePhase.js';  // ENABLED: RRule import issue fixed
import { CommentPhase } from '../phases/phase8-comments/CommentPhase.js';
import { ParticipantPhase } from '../phases/phase9-participants/ParticipantPhase.js';
import { ValidationEnrichmentPhase } from '../phases/phase10-validation/ValidationEnrichmentPhase.js';

// Import plugins
import { HebcalClient } from '../../infrastructure/external/hebcal/HebcalClient.js';
import { ClaudeClient } from '../../infrastructure/external/anthropic/ClaudeClient.js';

/**
 * Initialize all plugins and phases
 */
export async function initializePipeline(): Promise<void> {
  try {
    logger.info('🔧 Initializing pipeline...');

    // ===== Step 1: Register Plugins =====
    logger.info('📦 Registering plugins...');

    // Register HebcalClient (Hebrew calendar)
    const hebcalClient = new HebcalClient();
    await hebcalClient.initialize({
      defaultLocation: {
        name: 'Jerusalem',
        latitude: 31.7683,
        longitude: 35.2137,
        tzid: 'Asia/Jerusalem'
      }
    });
    await pluginManager.registerPlugin(hebcalClient);
    logger.info('✅ HebcalClient registered');

    // Register ClaudeClient (Ensemble AI)
    const claudeClient = new ClaudeClient();
    await pluginManager.registerPlugin(claudeClient, {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-haiku-20240307',
      maxTokens: 1024
    });
    logger.info('✅ ClaudeClient registered');

    // ===== Step 2: Register All Phases =====
    logger.info('🔄 Registering phases...');

    // Phase 0: Voice Normalizer (order: 0)
    // Runs FIRST to clean up voice transcriptions
    const voiceNormalizer = new VoiceNormalizerPhase();
    pipelineOrchestrator.registerPhase(voiceNormalizer);

    // Phase 1: Intent Classification (order: 1)
    // Ensemble AI with 3-model voting
    const ensembleClassifier = new EnsembleClassifier();
    pipelineOrchestrator.registerPhase(ensembleClassifier);

    // Phase 2: Multi-Event Detection (order: 2)
    // Detects if user wants multiple events
    const multiEventPhase = new MultiEventPhase();
    pipelineOrchestrator.registerPhase(multiEventPhase);

    // Phase 3: Entity Extraction (order: 3)
    // Extracts dates, times, titles, locations from text
    const entityExtractionPhase = new EntityExtractionPhase();
    pipelineOrchestrator.registerPhase(entityExtractionPhase);
    logger.info('✅ Entity Extraction Phase enabled');

    // Phase 4: Hebrew Calendar (order: 4)
    // Checks for holidays and Shabbat conflicts
    const hebrewCalendarPhase = new HebrewCalendarPhase();
    await hebrewCalendarPhase.initialize();
    pipelineOrchestrator.registerPhase(hebrewCalendarPhase);

    // Phase 5: User Profiles (order: 5)
    // Applies smart defaults based on user history
    const userProfilePhase = new UserProfilePhase();
    pipelineOrchestrator.registerPhase(userProfilePhase);

    // Phase 6: Update/Delete Matcher (order: 6)
    // Fuzzy matching for event updates/deletions
    const updateDeletePhase = new UpdateDeletePhase();
    pipelineOrchestrator.registerPhase(updateDeletePhase);

    // Phase 7: Recurrence Pattern (order: 7)
    // Generates RRULE for recurring events
    // ENABLED: RRule import issue fixed with default import workaround
    const recurrencePhase = new RecurrencePhase();
    pipelineOrchestrator.registerPhase(recurrencePhase);
    logger.info('✅ Recurrence Phase enabled');

    // Phase 8: Comment System (order: 8)
    // Detects and manages event comments
    const commentPhase = new CommentPhase();
    pipelineOrchestrator.registerPhase(commentPhase);

    // Phase 9: Participant Detection (order: 9)
    // Handles multi-participant events
    const participantPhase = new ParticipantPhase();
    pipelineOrchestrator.registerPhase(participantPhase);

    // Phase 10: Validation & Enrichment (order: 10)
    // Final quality gate - validates and enriches data
    const validationEnrichmentPhase = new ValidationEnrichmentPhase();
    pipelineOrchestrator.registerPhase(validationEnrichmentPhase);
    logger.info('✅ Validation & Enrichment Phase enabled');

    logger.info('✅ All phases registered successfully');

    // Print summary
    const phases = pipelineOrchestrator.getPhases();
    logger.info(`📋 Registered ${phases.length} phases:`);
    phases.forEach(phase => {
      logger.info(`   ${phase.order}. ${phase.name} (${phase.isRequired ? 'REQUIRED' : 'optional'})`);
    });

  } catch (error) {
    logger.error('❌ Failed to initialize pipeline', { error });
    throw error;
  }
}

/**
 * Shutdown all plugins
 */
export async function shutdownPipeline(): Promise<void> {
  try {
    logger.info('👋 Shutting down pipeline...');
    await pluginManager.shutdownAll();
    logger.info('✅ Pipeline shutdown complete');
  } catch (error) {
    logger.error('❌ Error during pipeline shutdown', { error });
  }
}
