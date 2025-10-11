/**
 * Cost Tracker - Monitor AI API costs and send alerts
 *
 * Features:
 * - Track costs per API call
 * - Accumulate daily/monthly totals
 * - Send WhatsApp alerts at $10 increments
 * - Cost breakdown by model
 * - Store in database for analysis
 */

import logger from '../../utils/logger.js';
import { pool } from '../../config/database.js';

export interface CostEntry {
  userId: string;
  model: string;
  operation: string;
  costUsd: number;
  tokensUsed?: number;
  timestamp: Date;
}

export interface CostSummary {
  totalCost: number;
  byModel: Record<string, number>;
  byOperation: Record<string, number>;
  period: 'day' | 'month';
}

/**
 * AI Model pricing (as of 2025)
 */
const MODEL_PRICING = {
  'gpt-4o-mini': {
    input: 0.00015 / 1000,  // $0.15 per 1M tokens
    output: 0.0006 / 1000    // $0.60 per 1M tokens
  },
  'gemini-1.5-flash': {
    input: 0.000075 / 1000,  // $0.075 per 1M tokens
    output: 0.0003 / 1000    // $0.30 per 1M tokens
  },
  'claude-3-haiku-20240307': {
    input: 0.00025 / 1000,   // $0.25 per 1M tokens
    output: 0.00125 / 1000   // $1.25 per 1M tokens
  }
};

export class CostTracker {
  private alertThresholds: number[] = [10, 20, 30, 40, 50]; // $ amounts
  private lastAlertedThreshold: number = 0;
  private adminPhone: string;

  constructor(adminPhone: string = '+972544345287') {
    this.adminPhone = adminPhone;
  }

  /**
   * Track a cost entry
   */
  async trackCost(entry: CostEntry): Promise<void> {
    try {
      // Store in database
      await pool.query(
        `INSERT INTO ai_cost_log (user_id, model, operation, cost_usd, tokens_used, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [entry.userId, entry.model, entry.operation, entry.costUsd, entry.tokensUsed || null, entry.timestamp]
      );

      logger.info('Cost tracked', {
        model: entry.model,
        cost: entry.costUsd,
        operation: entry.operation
      });

      // Check if we should send an alert
      await this.checkAndSendAlert();

    } catch (error) {
      logger.error('Failed to track cost', { error, entry });
    }
  }

  /**
   * Calculate cost for a specific API call
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING];
    if (!pricing) {
      logger.warn(`Unknown model pricing: ${model}`);
      return 0;
    }

    const inputCost = inputTokens * pricing.input;
    const outputCost = outputTokens * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get cost summary for today
   */
  async getDailyCost(): Promise<CostSummary> {
    try {
      const result = await pool.query(
        `SELECT
           SUM(cost_usd) as total_cost,
           model,
           operation
         FROM ai_cost_log
         WHERE created_at >= CURRENT_DATE
         GROUP BY model, operation`
      );

      const totalCost = parseFloat(result.rows[0]?.total_cost || '0');
      const byModel: Record<string, number> = {};
      const byOperation: Record<string, number> = {};

      for (const row of result.rows) {
        byModel[row.model] = (byModel[row.model] || 0) + parseFloat(row.total_cost);
        byOperation[row.operation] = (byOperation[row.operation] || 0) + parseFloat(row.total_cost);
      }

      return {
        totalCost,
        byModel,
        byOperation,
        period: 'day'
      };
    } catch (error) {
      logger.error('Failed to get daily cost', { error });
      return {
        totalCost: 0,
        byModel: {},
        byOperation: {},
        period: 'day'
      };
    }
  }

  /**
   * Get cost summary for this month
   */
  async getMonthlyCost(): Promise<CostSummary> {
    try {
      const result = await pool.query(
        `SELECT
           SUM(cost_usd) as total_cost,
           model,
           operation
         FROM ai_cost_log
         WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
         GROUP BY model, operation`
      );

      const totalCost = parseFloat(result.rows[0]?.total_cost || '0');
      const byModel: Record<string, number> = {};
      const byOperation: Record<string, number> = {};

      for (const row of result.rows) {
        byModel[row.model] = (byModel[row.model] || 0) + parseFloat(row.total_cost);
        byOperation[row.operation] = (byOperation[row.operation] || 0) + parseFloat(row.total_cost);
      }

      return {
        totalCost,
        byModel,
        byOperation,
        period: 'month'
      };
    } catch (error) {
      logger.error('Failed to get monthly cost', { error });
      return {
        totalCost: 0,
        byModel: {},
        byOperation: {},
        period: 'month'
      };
    }
  }

  /**
   * Check if we've crossed a cost threshold and send alert
   */
  private async checkAndSendAlert(): Promise<void> {
    try {
      const monthlyCost = await this.getMonthlyCost();
      const totalCost = monthlyCost.totalCost;

      // Find the highest threshold we've crossed
      const crossedThreshold = this.alertThresholds
        .filter(t => totalCost >= t)
        .sort((a, b) => b - a)[0];

      // If we've crossed a new threshold, send alert
      if (crossedThreshold && crossedThreshold > this.lastAlertedThreshold) {
        await this.sendCostAlert(totalCost, monthlyCost);
        this.lastAlertedThreshold = crossedThreshold;

        logger.info(`Cost alert sent: $${totalCost.toFixed(2)}`);
      }

    } catch (error) {
      logger.error('Failed to check cost alert', { error });
    }
  }

  /**
   * Send WhatsApp alert about costs
   */
  private async sendCostAlert(totalCost: number, summary: CostSummary): Promise<void> {
    try {
      // Get WhatsApp provider
      const { BaileysProvider } = await import('../../providers/BaileysProvider.js');
      const provider = new BaileysProvider();

      // Format cost breakdown
      const modelBreakdown = Object.entries(summary.byModel)
        .map(([model, cost]) => `  • ${model}: $${cost.toFixed(2)}`)
        .join('\n');

      const operationBreakdown = Object.entries(summary.byOperation)
        .map(([op, cost]) => `  • ${op}: $${cost.toFixed(2)}`)
        .join('\n');

      const message = `💰 *AI Cost Alert*\n\n` +
        `Total monthly cost: *$${totalCost.toFixed(2)}*\n\n` +
        `📊 *Breakdown by Model:*\n${modelBreakdown}\n\n` +
        `📋 *Breakdown by Operation:*\n${operationBreakdown}\n\n` +
        `🤖 Generated by WhatsApp Assistant Bot`;

      // Send message
      await provider.sendMessage(this.adminPhone, message);

      logger.info('Cost alert sent to admin', {
        totalCost,
        adminPhone: this.adminPhone
      });

    } catch (error) {
      logger.error('Failed to send cost alert', { error });
    }
  }

  /**
   * Get cost projection for end of month
   */
  async getMonthlyProjection(): Promise<number> {
    try {
      const monthlyCost = await this.getMonthlyCost();
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const currentDay = now.getDate();

      const dailyAverage = monthlyCost.totalCost / currentDay;
      const projection = dailyAverage * daysInMonth;

      return projection;

    } catch (error) {
      logger.error('Failed to get cost projection', { error });
      return 0;
    }
  }

  /**
   * Reset alert threshold (for testing or new month)
   */
  resetAlertThreshold(): void {
    this.lastAlertedThreshold = 0;
    logger.info('Cost alert threshold reset');
  }
}

/**
 * Singleton instance
 */
export const costTracker = new CostTracker('+972544345287');
