import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { ReminderJob } from './ReminderQueue.js';
import { IMessageProvider } from '../providers/IMessageProvider.js';

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
    const { reminderId, userId, title, phone, leadTimeMinutes } = job.data;

    logger.info('Processing reminder', { reminderId, userId, leadTimeMinutes });

    try {
      // Build message with optional lead time info
      let message = `⏰ תזכורת\n\n${title}`;

      // Add lead time info if applicable
      if (leadTimeMinutes && leadTimeMinutes > 0) {
        if (leadTimeMinutes === 1) {
          message += `\n\n⏳ בעוד דקה אחת`;
        } else if (leadTimeMinutes < 60) {
          message += `\n\n⏳ בעוד ${leadTimeMinutes} דקות`;
        } else if (leadTimeMinutes === 60) {
          message += `\n\n⏳ בעוד שעה`;
        } else {
          const hours = Math.floor(leadTimeMinutes / 60);
          const minutes = leadTimeMinutes % 60;
          if (minutes === 0) {
            message += `\n\n⏳ בעוד ${hours} שעות`;
          } else {
            message += `\n\n⏳ בעוד ${hours} שעות ו-${minutes} דקות`;
          }
        }
      }

      await this.messageProvider.sendMessage(phone, message);

      logger.info('Reminder sent with lead time', {
        reminderId,
        userId,
        phone,
        leadTimeMinutes
      });
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
