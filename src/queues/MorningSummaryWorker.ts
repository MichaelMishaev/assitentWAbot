import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { MorningSummaryJob, morningSummaryQueue } from './MorningSummaryQueue.js';
import { MorningSummaryService } from '../services/MorningSummaryService.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';

/**
 * MorningSummaryWorker - Processes morning summary jobs
 * Generates and sends daily morning summaries to users
 */
export class MorningSummaryWorker {
  private worker: Worker<MorningSummaryJob>;
  private morningSummaryService: MorningSummaryService;

  constructor(
    private messageProvider: IMessageProvider,
    morningSummaryService?: MorningSummaryService
  ) {
    this.morningSummaryService = morningSummaryService || new MorningSummaryService();

    // Create BullMQ worker
    this.worker = new Worker<MorningSummaryJob>(
      'morning-summaries',
      async (job: Job<MorningSummaryJob>) => {
        return this.processJob(job);
      },
      {
        connection: redis,
        concurrency: 5, // Process 5 summaries simultaneously
        limiter: {
          max: 10, // Maximum 10 jobs
          duration: 1000, // per second (rate limiting to avoid WhatsApp blocks)
        },
      }
    );

    // Event handlers
    this.worker.on('completed', (job) => {
      logger.info('Morning summary job completed', {
        jobId: job.id,
        userId: job.data.userId,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Morning summary job failed', {
        jobId: job?.id,
        userId: job?.data?.userId,
        error: err,
        attempts: job?.attemptsMade,
      });
    });

    this.worker.on('error', (err) => {
      logger.error('Morning summary worker error', { error: err });
    });

    logger.info('Morning summary worker initialized');
  }

  /**
   * Process a morning summary job
   * @param job BullMQ job
   */
  private async processJob(job: Job<MorningSummaryJob>): Promise<void> {
    const { userId, phone, timezone, date } = job.data;

    logger.info('Processing morning summary job', {
      jobId: job.id,
      userId,
      phone,
      timezone,
      date,
    });

    try {
      // Generate the summary message
      const summaryMessage = await this.morningSummaryService.generateSummaryForUser(
        userId,
        new Date(date)
      );

      // Skip if no events/reminders (null returned)
      if (summaryMessage === null) {
        logger.info('Skipping morning summary - user has no events or reminders', {
          jobId: job.id,
          userId,
          phone,
        });
        return; // Successfully complete the job without sending
      }

      // Send the message via WhatsApp
      await this.messageProvider.sendMessage(phone, summaryMessage);

      logger.info('Morning summary sent successfully', {
        jobId: job.id,
        userId,
        phone,
        messageLength: summaryMessage.length,
      });
    } catch (error) {
      logger.error('Failed to process morning summary job', {
        jobId: job.id,
        userId,
        phone,
        error,
      });
      throw error; // Re-throw to trigger BullMQ retry logic
    }
  }

  /**
   * Get worker instance
   */
  getWorker(): Worker<MorningSummaryJob> {
    return this.worker;
  }

  /**
   * Close the worker gracefully
   */
  async close(): Promise<void> {
    logger.info('Closing morning summary worker...');
    await this.worker.close();
    logger.info('Morning summary worker closed');
  }
}

export default MorningSummaryWorker;
