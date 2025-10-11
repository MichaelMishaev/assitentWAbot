/**
 * PipelineOrchestrator - Coordinates execution of all 10 phases
 *
 * This is the main entry point for message processing.
 * It orchestrates the flow through all phases in order.
 */

import logger from '../../utils/logger.js';
import { IPhase } from './IPhase.js';
import { PhaseContext, PipelineResult } from './PhaseContext.js';
import { IncomingMessage } from '../../providers/IMessageProvider.js';

export class PipelineOrchestrator {
  private phases: IPhase[] = [];
  private executionMetrics: Map<string, PhaseMetrics> = new Map();

  /**
   * Register a phase
   */
  registerPhase(phase: IPhase): void {
    // Check for duplicate order
    const existingPhase = this.phases.find(p => p.order === phase.order);
    if (existingPhase) {
      throw new Error(
        `Phase order ${phase.order} already taken by ${existingPhase.name}`
      );
    }

    this.phases.push(phase);

    // Sort by order
    this.phases.sort((a, b) => a.order - b.order);

    // Initialize metrics
    this.executionMetrics.set(phase.name, {
      executionCount: 0,
      successCount: 0,
      errorCount: 0,
      skipCount: 0,
      totalDuration: 0,
      averageDuration: 0
    });

    logger.info(`Phase registered: ${phase.name} (order: ${phase.order})`);
  }

  /**
   * Execute the full pipeline
   */
  async execute(
    message: IncomingMessage,
    userId: string,
    userTimezone?: string
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const context = new PhaseContext(message, userId, userTimezone);

    logger.info(`🚀 Starting pipeline for user ${userId}`, {
      messageId: message.messageId,
      text: message.content.text.substring(0, 100)
    });

    try {
      // Execute each phase in order
      for (const phase of this.phases) {
        const phaseStartTime = Date.now();
        const metrics = this.executionMetrics.get(phase.name)!;
        metrics.executionCount++;

        try {
          // Check if phase should run
          const shouldRun = await phase.shouldRun(context);

          if (!shouldRun) {
            logger.info(`⏭️  Skipping phase: ${phase.name}`);
            metrics.skipCount++;
            continue;
          }

          logger.info(`▶️  Executing phase: ${phase.name}`);

          // Optional validation
          if (phase.validate) {
            const validation = await phase.validate(context);
            if (!validation.valid) {
              logger.warn(`⚠️  Phase validation failed: ${phase.name}`, {
                errors: validation.errors
              });

              if (phase.isRequired) {
                const error = `Required phase ${phase.name} validation failed: ${validation.errors?.join(', ')}`;
                context.addError(error);
                throw new Error(error);
              }

              // Non-required phase validation failure → skip
              validation.warnings?.forEach(w => context.addWarning(w));
              metrics.skipCount++;
              continue;
            }
          }

          // Execute phase
          const result = await phase.execute(context);

          // Store result
          context.addPhaseResult(phase.name, result);

          // Update metrics
          const phaseDuration = Date.now() - phaseStartTime;
          metrics.totalDuration += phaseDuration;
          metrics.averageDuration = metrics.totalDuration / metrics.executionCount;

          if (result.success) {
            metrics.successCount++;
            logger.info(`✅ Phase completed: ${phase.name} (${phaseDuration}ms)`);
          } else {
            metrics.errorCount++;
            logger.error(`❌ Phase failed: ${phase.name}`, {
              errors: result.errors,
              duration: phaseDuration
            });

            // Add errors to context
            result.errors?.forEach(e => context.addError(e));

            // If required phase fails, stop pipeline
            if (phase.isRequired) {
              logger.error(`🛑 Pipeline stopped: Required phase ${phase.name} failed`);
              break;
            }
          }

          // Add warnings to context
          result.warnings?.forEach(w => context.addWarning(w));

          // Check if we should stop pipeline early
          if (result.stopPipeline || context.shouldStopPipeline()) {
            logger.info(`🛑 Pipeline stopped early by ${phase.name}`);
            break;
          }

        } catch (error) {
          metrics.errorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);

          logger.error(`💥 Phase crashed: ${phase.name}`, {
            error,
            duration: Date.now() - phaseStartTime
          });

          context.addError(`Phase ${phase.name} crashed: ${errorMessage}`);

          // If required phase crashes, stop pipeline
          if (phase.isRequired) {
            logger.error(`🛑 Pipeline stopped: Required phase ${phase.name} crashed`);
            break;
          }
        }
      }

      // Pipeline complete
      const totalDuration = Date.now() - startTime;
      const result = context.getFinalResult();

      logger.info(`✨ Pipeline completed`, {
        success: result.success,
        duration: totalDuration,
        intent: result.intent,
        confidence: result.confidence,
        warnings: result.warnings.length,
        errors: result.errors.length
      });

      return result;

    } catch (error) {
      logger.error(`💥 Pipeline crashed`, { error });

      return {
        success: false,
        intent: null,
        confidence: 0,
        entities: {},
        needsClarification: false,
        warnings: context.getWarnings(),
        errors: [
          ...context.getErrors(),
          `Pipeline crashed: ${error instanceof Error ? error.message : String(error)}`
        ],
        phaseResults: Object.fromEntries(context.getAllPhaseResults())
      };
    }
  }

  /**
   * Get registered phases
   */
  getPhases(): IPhase[] {
    return [...this.phases];
  }

  /**
   * Get phase by name
   */
  getPhase(name: string): IPhase | undefined {
    return this.phases.find(p => p.name === name);
  }

  /**
   * Get execution metrics
   */
  getMetrics(): Map<string, PhaseMetrics> {
    return new Map(this.executionMetrics);
  }

  /**
   * Get metrics for a specific phase
   */
  getPhaseMetrics(phaseName: string): PhaseMetrics | undefined {
    return this.executionMetrics.get(phaseName);
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    for (const [phaseName, metrics] of this.executionMetrics) {
      this.executionMetrics.set(phaseName, {
        executionCount: 0,
        successCount: 0,
        errorCount: 0,
        skipCount: 0,
        totalDuration: 0,
        averageDuration: 0
      });
    }
    logger.info('Pipeline metrics reset');
  }
}

/**
 * Phase execution metrics
 */
export interface PhaseMetrics {
  executionCount: number;
  successCount: number;
  errorCount: number;
  skipCount: number;
  totalDuration: number;
  averageDuration: number;
}

/**
 * Singleton instance
 */
export const pipelineOrchestrator = new PipelineOrchestrator();
