/**
 * IPhase - Interface for pipeline phases
 *
 * Each of the 10 phases implements this interface.
 * Phases are executed in order by the PipelineOrchestrator.
 */

import { PhaseContext, PhaseResult } from './PhaseContext.js';

export interface IPhase {
  // Metadata
  readonly name: string;
  readonly order: number; // 0-10 (execution order)
  readonly description: string;
  readonly isRequired: boolean; // If true, pipeline fails if phase fails

  /**
   * Check if this phase should run
   * Allows conditional phase execution based on context
   */
  shouldRun(context: PhaseContext): Promise<boolean>;

  /**
   * Execute the phase
   * Modifies context and returns result
   */
  execute(context: PhaseContext): Promise<PhaseResult>;

  /**
   * Optional: Validate phase prerequisites
   */
  validate?(context: PhaseContext): Promise<ValidationResult>;
}

/**
 * Validation result for a phase
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Base abstract class for phases
 * Provides common functionality
 */
export abstract class BasePhase implements IPhase {
  abstract readonly name: string;
  abstract readonly order: number;
  abstract readonly description: string;
  abstract readonly isRequired: boolean;

  /**
   * Default implementation: always run
   * Override in subclasses for conditional execution
   */
  async shouldRun(context: PhaseContext): Promise<boolean> {
    return true;
  }

  /**
   * Must be implemented by subclasses
   */
  abstract execute(context: PhaseContext): Promise<PhaseResult>;

  /**
   * Optional validation
   */
  async validate?(context: PhaseContext): Promise<ValidationResult>;

  /**
   * Helper: Create success result
   */
  protected success(data: any, warnings?: string[]): PhaseResult {
    return {
      success: true,
      data,
      warnings
    };
  }

  /**
   * Helper: Create error result
   */
  protected error(error: string, data?: any): PhaseResult {
    return {
      success: false,
      data,
      errors: [error]
    };
  }

  /**
   * Helper: Create result that stops pipeline
   */
  protected stopPipeline(reason: string, data?: any): PhaseResult {
    return {
      success: true,
      data,
      stopPipeline: true,
      warnings: [reason]
    };
  }
}
