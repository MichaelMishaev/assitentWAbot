import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../utils/logger';
import { ReminderJob } from './ReminderQueue';
import { IMessageProvider } from '../providers/IMessageProvider';

export class ReminderWorker {
  private worker: Worker<ReminderJob>;

  constructor(private messageProvider: IMessageProvider) {
    this.worker = new Worker<ReminderJob>(
      'reminders',
      this.processReminder.bind(this),
      {
        connection: redis,
        concurrency: 5,
      }
    );

    this.worker.on('completed', (job) => {
      logger.info('Reminder sent successfully', {
        reminderId: job.data.reminderId,
        userId: job.data.userId,
      });
    });

    this.worker.on('failed', (job, error) => {
      logger.error('Reminder failed', {
        reminderId: job?.data.reminderId,
        userId: job?.data.userId,
        error,
      });
    });

    logger.info('Reminder worker started');
  }

  private async processReminder(job: Job<ReminderJob>): Promise<void> {
    const { reminderId, userId, title, phone } = job.data;

    logger.info('Processing reminder', { reminderId, userId });

    try {
      // Send WhatsApp message
      const message = `⏰ תזכורת\n\n${title}`;
      await this.messageProvider.sendMessage(phone, message);

      logger.info('Reminder sent', { reminderId, userId, phone });
    } catch (error) {
      logger.error('Failed to send reminder', { reminderId, userId, error });
      throw error; // Will trigger retry
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    logger.info('Reminder worker stopped');
  }
}
