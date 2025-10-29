import { Queue, QueueOptions, Worker, Job } from 'bullmq';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';
import { UserService } from './UserService.js';
import { MorningSummaryService } from './MorningSummaryService.js';
import { scheduleMorningSummary } from '../queues/MorningSummaryQueue.js';

interface DailySchedulerJob {
  date: string; // ISO date string
}

/**
 * DailySchedulerService - Orchestrates daily morning summary scheduling
 * Uses BullMQ repeatable jobs to run every day and schedule summaries for all users
 */
export class DailySchedulerService {
  private queue: Queue<DailySchedulerJob>;
  private worker: Worker<DailySchedulerJob>;
  private userService: UserService;
  private morningSummaryService: MorningSummaryService;

  constructor(
    userService?: UserService,
    morningSummaryService?: MorningSummaryService
  ) {
    this.userService = userService || new UserService();
    this.morningSummaryService = morningSummaryService || new MorningSummaryService();

    // Create queue for daily scheduler
    const queueOptions: QueueOptions = {
      connection: redis,
    };

    this.queue = new Queue<DailySchedulerJob>('daily-scheduler', queueOptions);

    // Create worker to process daily schedule
    this.worker = new Worker<DailySchedulerJob>(
      'daily-scheduler',
      async (job: Job<DailySchedulerJob>) => {
        return this.processDailySchedule(job);
      },
      {
        connection: redis,
        concurrency: 1, // Only one daily schedule job at a time
      }
    );

    // Event handlers
    this.worker.on('completed', (job) => {
      logger.info('Daily scheduler job completed', {
        jobId: job.id,
        date: job.data.date,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Daily scheduler job failed', {
        jobId: job?.id,
        date: job?.data?.date,
        error: err,
      });
    });

    logger.info('Daily scheduler service initialized');
  }

  /**
   * Setup the repeatable daily job
   * Runs every day at 9:00 AM UTC (11:00 AM Israel time)
   */
  async setupRepeatingJob(): Promise<void> {
    try {
      // Remove any existing repeatable jobs first
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        await this.queue.removeRepeatableByKey(job.key);
      }

      // Add new repeatable job - runs every day at 9:00 AM UTC
      await this.queue.add(
        'daily-schedule',
        { date: new Date().toISOString() },
        {
          repeat: {
            pattern: '0 9 * * *', // Cron: Every day at 9 AM UTC
          },
          jobId: 'daily-scheduler-repeatable',
        }
      );

      logger.info('Daily scheduler repeatable job configured', {
        pattern: '0 9 * * *',
        description: 'Every day at 9:00 AM UTC',
      });
    } catch (error) {
      logger.error('Failed to setup repeatable job', { error });
      throw error;
    }
  }

  /**
   * Process the daily schedule - schedule morning summaries for all users
   * @param job BullMQ job
   */
  private async processDailySchedule(job: Job<DailySchedulerJob>): Promise<void> {
    logger.info('Processing daily schedule', {
      jobId: job.id,
      date: job.data.date,
    });

    try {
      // Get all users with morning notifications enabled
      const users = await this.userService.getUsersWithMorningNotifications();

      logger.info('Found users with morning notifications', {
        count: users.length,
      });

      let scheduled = 0;
      let skipped = 0;

      // Schedule morning summary for each user
      for (const user of users) {
        try {
          // Check if we should send today based on user's day preferences
          const shouldSend = this.morningSummaryService.shouldSendToday(user);

          if (!shouldSend) {
            logger.debug('Skipping user - not scheduled for today', {
              userId: user.id,
              timezone: user.timezone,
            });
            skipped++;
            continue;
          }

          // Get user's preferred time
          const prefs = user.prefsJsonb?.morningNotification;
          const preferredTime = prefs?.time || '08:00';

          // Calculate when to send in user's timezone
          const userTz = user.timezone || 'Asia/Jerusalem';
          const now = DateTime.now().setZone(userTz);

          // Get today's date at the preferred time
          const [hours, minutes] = preferredTime.split(':').map(Number);
          let sendTime = now.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

          // If time has already passed today, schedule for tomorrow
          if (sendTime < now) {
            sendTime = sendTime.plus({ days: 1 });
          }

          // Convert to milliseconds timestamp
          const sendAtMs = sendTime.toMillis();

          // Schedule the morning summary
          await scheduleMorningSummary(
            {
              userId: user.id,
              phone: user.phone,
              timezone: userTz,
              date: sendTime.toISODate()!,
            },
            sendAtMs
          );

          scheduled++;

          logger.debug('Scheduled morning summary for user', {
            userId: user.id,
            sendAt: sendTime.toISO(),
            timezone: userTz,
            preferredTime,
          });
        } catch (error) {
          logger.error('Failed to schedule morning summary for user', {
            userId: user.id,
            error,
          });
          // Continue with other users even if one fails
        }
      }

      logger.info('Daily schedule processing completed', {
        totalUsers: users.length,
        scheduled,
        skipped,
      });
    } catch (error) {
      logger.error('Failed to process daily schedule', { error });
      throw error;
    }
  }

  /**
   * Manually trigger the daily schedule (useful for testing)
   */
  async triggerNow(): Promise<void> {
    logger.info('Manually triggering daily schedule');
    await this.queue.add('daily-schedule-manual', {
      date: new Date().toISOString(),
    });
  }

  /**
   * Get queue instance
   */
  getQueue(): Queue<DailySchedulerJob> {
    return this.queue;
  }

  /**
   * Get worker instance
   */
  getWorker(): Worker<DailySchedulerJob> {
    return this.worker;
  }

  /**
   * Close the service gracefully
   */
  async close(): Promise<void> {
    logger.info('Closing daily scheduler service...');
    await this.worker.close();
    await this.queue.close();
    logger.info('Daily scheduler service closed');
  }
}

// Export singleton instance (will be initialized in index.ts with messageProvider)
let dailySchedulerService: DailySchedulerService | null = null;

export function initializeDailyScheduler(): DailySchedulerService {
  if (!dailySchedulerService) {
    dailySchedulerService = new DailySchedulerService();
  }
  return dailySchedulerService;
}

export function getDailyScheduler(): DailySchedulerService | null {
  return dailySchedulerService;
}

export default DailySchedulerService;
