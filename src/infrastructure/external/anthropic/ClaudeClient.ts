/**
 * Claude Client (Anthropic)
 * For ensemble AI classification
 */

import Anthropic from '@anthropic-ai/sdk';
import logger from '../../../utils/logger.js';
import { BasePlugin, PluginContext } from '../../../plugins/IPlugin.js';
import { costTracker } from '../../../shared/services/CostTracker.js';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface ClaudeResponse {
  intent: string;
  confidence: number;
  reasoning: string;
}

export class ClaudeClient extends BasePlugin<string, ClaudeResponse, ClaudeConfig> {
  readonly name = 'claude-client';
  readonly version = '1.0.0';
  readonly type = 'ai-model' as const;
  readonly description = 'Claude AI for intent classification';

  private client: Anthropic | null = null;
  private model: string = 'claude-3-haiku-20240307';
  private maxTokens: number = 500;

  async initialize(config?: ClaudeConfig): Promise<void> {
    await super.initialize(config);

    if (!config?.apiKey) {
      throw new Error('Claude API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey
    });

    this.model = config.model || this.model;
    this.maxTokens = config.maxTokens || this.maxTokens;

    logger.info('ClaudeClient initialized', { model: this.model });
  }

  async execute(prompt: string, context: PluginContext): Promise<ClaudeResponse> {
    this.assertInitialized();

    if (!this.client) {
      throw new Error('Claude client not initialized');
    }

    try {
      const startTime = Date.now();

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const duration = Date.now() - startTime;

      // Extract response
      const content = response.content[0];
      const responseText = content.type === 'text' ? content.text : '';

      // Parse JSON response
      let parsed: ClaudeResponse;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        // If not JSON, create structured response
        parsed = {
          intent: 'unknown',
          confidence: 0.5,
          reasoning: responseText
        };
      }

      // Track cost
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cost = costTracker.calculateCost(this.model, inputTokens, outputTokens);

      if (context.trackCost) {
        await costTracker.trackCost({
          userId: context.userId,
          model: this.model,
          operation: 'intent-classification',
          costUsd: cost,
          tokensUsed: inputTokens + outputTokens,
          timestamp: new Date()
        });
      }

      logger.info('Claude classification complete', {
        intent: parsed.intent,
        confidence: parsed.confidence,
        duration,
        cost: cost.toFixed(6)
      });

      return parsed;

    } catch (error) {
      logger.error('Claude API call failed', { error });
      throw error;
    }
  }

  getSupportedCapabilities(): string[] {
    return ['intent-classification', 'entity-extraction', 'sentiment-analysis'];
  }
}
