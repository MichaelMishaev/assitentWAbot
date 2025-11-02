/**
 * PhaseContext - Shared context object passed through the pipeline
 *
 * This is the "state" object that flows through all 10 phases.
 * Each phase can read from and write to this context.
 */

import { IncomingMessage } from '../../providers/IMessageProvider.js';

export class PhaseContext {
  // Original input
  public readonly originalMessage: IncomingMessage;
  public readonly userId: string;
  public readonly userTimezone: string;

  // Processing state
  private phaseResults: Map<string, PhaseResult> = new Map();
  private warnings: string[] = [];
  private errors: string[] = [];
  private metadata: Map<string, any> = new Map();

  // Shared data between phases
  public processedText: string;
  public intent: string | null = null;
  public confidence: number = 0;
  public entities: ExtractedEntities = {};
  public needsClarification: boolean = false;
  public clarificationQuestion?: string;

  constructor(message: IncomingMessage, userId: string, userTimezone: string = 'Asia/Jerusalem') {
    this.originalMessage = message;
    this.userId = userId;
    this.userTimezone = userTimezone;
    this.processedText = message.content.text;
  }

  /**
   * Store result from a phase
   */
  addPhaseResult(phaseName: string, result: PhaseResult): void {
    this.phaseResults.set(phaseName, result);
  }

  /**
   * Get result from a specific phase
   */
  getPhaseResult(phaseName: string): PhaseResult | undefined {
    return this.phaseResults.get(phaseName);
  }

  /**
   * Get all phase results
   */
  getAllPhaseResults(): Map<string, PhaseResult> {
    return new Map(this.phaseResults);
  }

  /**
   * Add a warning
   */
  addWarning(warning: string): void {
    this.warnings.push(warning);
  }

  /**
   * Add an error
   */
  addError(error: string): void {
    this.errors.push(error);
  }

  /**
   * Get all warnings
   */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /**
   * Get all errors
   */
  getErrors(): string[] {
    return [...this.errors];
  }

  /**
   * Set metadata
   */
  setMetadata(key: string, value: any): void {
    this.metadata.set(key, value);
  }

  /**
   * Get metadata
   */
  getMetadata(key: string): any {
    return this.metadata.get(key);
  }

  /**
   * Check if pipeline should stop early
   */
  shouldStopPipeline(): boolean {
    return this.needsClarification || this.errors.length > 0;
  }

  /**
   * Get final result to return to user
   */
  getFinalResult(): PipelineResult {
    return {
      success: this.errors.length === 0,
      intent: this.intent,
      confidence: this.confidence,
      entities: this.entities,
      needsClarification: this.needsClarification,
      clarificationQuestion: this.clarificationQuestion,
      warnings: this.warnings,
      errors: this.errors,
      phaseResults: Object.fromEntries(this.phaseResults)
    };
  }
}

/**
 * Result from a single phase
 */
export interface PhaseResult {
  success: boolean;
  data: any;
  stopPipeline?: boolean;
  warnings?: string[];
  errors?: string[];
}

/**
 * Extracted entities (shared across phases)
 */
export interface ExtractedEntities {
  // Event/Reminder data
  title?: string;
  date?: Date;
  dateText?: string;
  endDate?: Date;
  time?: string;
  location?: string;
  contactName?: string;
  notes?: string;
  leadTimeMinutes?: number; // Minutes before event to send reminder (e.g., 1440 for 1 day before)

  // Hebrew calendar data
  hebrewDate?: {
    year: number;
    month: string;
    day: number;
    formatted: string;
  };
  holidayConflict?: {
    name: string;
    type: 'jewish' | 'israeli' | 'shabbat';
    severity: 'block' | 'warn' | 'info';
    message: string;
  };

  // Recurrence
  recurrence?: {
    pattern: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    rrule?: string;
  };

  // Priority & urgency
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  urgency?: 'urgent' | 'important' | 'normal';

  // Participants
  participants?: Array<{
    name: string;
    role: 'primary' | 'companion';
  }>;

  // Comments
  comments?: string[];

  // Cost tracking
  estimatedCost?: number;

  // Voice metadata
  isVoiceMessage?: boolean;
  transcriptionConfidence?: number;

  // Multi-event
  isMultiEvent?: boolean;
  splitEvents?: Array<Partial<ExtractedEntities>>;

  // Event operations (update/delete)
  eventId?: string; // ID of event being updated/deleted
}

/**
 * Final pipeline result
 */
export interface PipelineResult {
  success: boolean;
  intent: string | null;
  confidence: number;
  entities: ExtractedEntities;
  needsClarification: boolean;
  clarificationQuestion?: string;
  warnings: string[];
  errors: string[];
  phaseResults: Record<string, PhaseResult>;
}
