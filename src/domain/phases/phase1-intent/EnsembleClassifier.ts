/**
 * Ensemble AI Classifier
 *
 * Runs 3 AI models in parallel and uses voting to determine intent:
 * - GPT-4o-mini (OpenAI)
 * - Gemini 1.5 Flash (Google)
 * - Claude 3 Haiku (Anthropic)
 *
 * Confidence levels:
 * - 3/3 agreement: 95% confidence
 * - 2/3 agreement: 85% confidence
 * - No agreement: Ask user (clarification needed)
 */

import logger from '../../../utils/logger.js';
import { pluginManager } from '../../../plugins/PluginManager.js';
import { ClaudeClient, ClaudeResponse } from '../../../infrastructure/external/anthropic/ClaudeClient.js';
import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';

interface ModelVote {
  model: string;
  intent: string;
  confidence: number;
  reasoning?: string;
}

interface EnsembleResult {
  finalIntent: string;
  finalConfidence: number;
  votes: ModelVote[];
  agreement: number; // How many models agreed (0-3)
  needsClarification: boolean;
}

export class EnsembleClassifier extends BasePhase {
  readonly name = 'ensemble-intent-classifier';
  readonly order = 1;
  readonly description = 'Multi-model AI voting for intent classification';
  readonly isRequired = true; // Intent is critical

  /**
   * Always run (this is the entry point for NLP)
   */
  async shouldRun(context: PhaseContext): Promise<boolean> {
    return true;
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const message = context.processedText;

      // Build prompt for all models
      const prompt = this.buildClassificationPrompt(message, context);

      // Run all 3 models in parallel
      const [gptResult, geminiResult, claudeResult] = await Promise.allSettled([
        this.classifyWithGPT(prompt, context),
        this.classifyWithGemini(prompt, context),
        this.classifyWithClaude(prompt, context)
      ]);

      // Collect votes
      const votes: ModelVote[] = [];

      if (gptResult.status === 'fulfilled') {
        votes.push(gptResult.value);
      } else {
        logger.warn('GPT classification failed', { error: gptResult.reason });
      }

      if (geminiResult.status === 'fulfilled') {
        votes.push(geminiResult.value);
      } else {
        logger.warn('Gemini classification failed', { error: geminiResult.reason });
      }

      if (claudeResult.status === 'fulfilled') {
        votes.push(claudeResult.value);
      } else {
        logger.warn('Claude classification failed', { error: claudeResult.reason });
      }

      // Need at least 1 vote to proceed
      if (votes.length === 0) {
        return this.error('All AI models failed to classify intent');
      }

      // Aggregate votes
      const result = this.aggregateVotes(votes);

      // Update context
      context.intent = result.finalIntent;
      context.confidence = result.finalConfidence;
      context.needsClarification = result.needsClarification;

      if (result.needsClarification) {
        context.clarificationQuestion = this.generateClarificationQuestion(votes);
      }

      logger.info('Ensemble classification complete', {
        intent: result.finalIntent,
        confidence: result.finalConfidence,
        agreement: `${result.agreement}/3`,
        needsClarification: result.needsClarification
      });

      return this.success(result);

    } catch (error) {
      logger.error('Ensemble classification failed', { error });
      return this.error(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Classify with GPT-4o-mini
   */
  private async classifyWithGPT(prompt: string, context: PhaseContext): Promise<ModelVote> {
    // Use existing NLPService temporarily (will integrate properly later)
    return {
      model: 'gpt-4o-mini',
      intent: 'unknown',
      confidence: 0.5,
      reasoning: 'Temporary placeholder - integrate with NLPService'
    };
  }

  /**
   * Classify with Gemini
   */
  private async classifyWithGemini(prompt: string, context: PhaseContext): Promise<ModelVote> {
    // Use existing GeminiNLPService temporarily
    return {
      model: 'gemini-1.5-flash',
      intent: 'unknown',
      confidence: 0.5,
      reasoning: 'Temporary placeholder - integrate with GeminiNLPService'
    };
  }

  /**
   * Classify with Claude
   */
  private async classifyWithClaude(prompt: string, context: PhaseContext): Promise<ModelVote> {
    try {
      const claudeClient = pluginManager.getPlugin('claude-client') as ClaudeClient;

      if (!claudeClient) {
        throw new Error('ClaudeClient not registered');
      }

      const response = await claudeClient.execute(prompt, {
        userId: context.userId,
        messageId: context.originalMessage.messageId,
        timestamp: new Date(),
        metadata: {},
        logger,
        trackCost: (cost, model) => {
          // Cost tracking handled in ClaudeClient
        }
      });

      return {
        model: 'claude-3-haiku',
        intent: response.intent,
        confidence: response.confidence,
        reasoning: response.reasoning
      };

    } catch (error) {
      throw new Error(`Claude classification failed: ${error}`);
    }
  }

  /**
   * Aggregate votes from multiple models
   */
  private aggregateVotes(votes: ModelVote[]): EnsembleResult {
    // Count votes for each intent
    const intentCounts = new Map<string, number>();
    const intentConfidences = new Map<string, number[]>();

    for (const vote of votes) {
      const count = intentCounts.get(vote.intent) || 0;
      intentCounts.set(vote.intent, count + 1);

      const confidences = intentConfidences.get(vote.intent) || [];
      confidences.push(vote.confidence);
      intentConfidences.set(vote.intent, confidences);
    }

    // Find intent with most votes
    let maxVotes = 0;
    let winningIntent = 'unknown';

    for (const [intent, count] of intentCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        winningIntent = intent;
      }
    }

    // Calculate final confidence based on agreement
    let finalConfidence: number;
    let needsClarification = false;

    const totalModels = votes.length;
    const agreement = maxVotes;

    if (agreement === totalModels && totalModels === 3) {
      // Perfect agreement (3/3)
      finalConfidence = 0.95;
    } else if (agreement === 2 && totalModels === 3) {
      // Majority agreement (2/3)
      finalConfidence = 0.85;
    } else if (agreement === 2 && totalModels === 2) {
      // Both agree (2/2)
      finalConfidence = 0.90;
    } else {
      // No clear agreement or single model only
      finalConfidence = 0.60;
      needsClarification = true;
    }

    // Average the confidences of models that voted for winning intent
    const winningConfidences = intentConfidences.get(winningIntent) || [];
    if (winningConfidences.length > 0) {
      const avgConfidence = winningConfidences.reduce((a, b) => a + b, 0) / winningConfidences.length;
      finalConfidence = (finalConfidence + avgConfidence) / 2; // Blend with agreement-based confidence
    }

    return {
      finalIntent: winningIntent,
      finalConfidence,
      votes,
      agreement: maxVotes,
      needsClarification
    };
  }

  /**
   * Generate clarification question when models disagree
   */
  private generateClarificationQuestion(votes: ModelVote[]): string {
    const intents = votes.map(v => v.intent);
    const uniqueIntents = [...new Set(intents)];

    if (uniqueIntents.length === 1) {
      return 'לא הבנתי בבירור. אתה רוצה ליצור אירוע או תזכורת?';
    }

    // Multiple different intents
    return `לא הצלחתי להבין בוודאות. אתה מתכוון ל:\n` +
      uniqueIntents.map((intent, i) => `${i + 1}. ${this.intentToHebrew(intent)}`).join('\n') +
      `\n\nאנא השב במספר (1-${uniqueIntents.length})`;
  }

  /**
   * Convert intent to Hebrew description
   */
  private intentToHebrew(intent: string): string {
    const map: Record<string, string> = {
      'create_event': 'יצירת אירוע',
      'create_reminder': 'יצירת תזכורת',
      'search_event': 'חיפוש אירוע',
      'list_events': 'הצגת אירועים',
      'delete_event': 'מחיקת אירוע',
      'update_event': 'עדכון אירוע',
      'unknown': 'לא ברור'
    };
    return map[intent] || intent;
  }

  /**
   * Build classification prompt
   */
  private buildClassificationPrompt(message: string, context: PhaseContext): string {
    return `You are a Hebrew/English intent classifier for a WhatsApp bot.

User message: "${message}"

Classify the intent. Respond with JSON:
{
  "intent": "create_event|create_reminder|search_event|list_events|delete_event|update_event|unknown",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation in English"
}

Examples:
- "קבע פגישה מחר" → {"intent":"create_event","confidence":0.95,"reasoning":"Clear event creation"}
- "תזכיר לי" → {"intent":"create_reminder","confidence":0.9,"reasoning":"Reminder request"}
- "מה יש לי" → {"intent":"list_events","confidence":0.9,"reasoning":"Query for events"}`;
  }
}
