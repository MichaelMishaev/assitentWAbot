import { Queue, QueueOptions } from 'bullmq';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';

export interface ReminderJob {
  reminderId: string;
  userId: string;
  title: string;
  phone: string;
}

// BullMQ Queue options
const queueOptions: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Create reminder queue
export const reminderQueue = new Queue<ReminderJob>('reminders', queueOptions);

logger.info('Reminder queue initialized');

// Export helper functions
export async function scheduleReminder(
  job: ReminderJob,
  dueDate: Date
): Promise<void> {
  const delay = dueDate.getTime() - Date.now();

  if (delay < 0) {
    logger.warn('Attempted to schedule reminder in the past', { job, dueDate });
    return;
  }

  await reminderQueue.add(
    'send-reminder',
    job,
    {
      delay,
      jobId: `reminder-${job.reminderId}`,
    }
  );

  logger.info('Reminder scheduled', {
    reminderId: job.reminderId,
    userId: job.userId,
    dueDate,
    delayMs: delay,
  });
}

export async function cancelReminder(reminderId: string): Promise<void> {
  const jobId = `reminder-${reminderId}`;
  const job = await reminderQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info('Reminder cancelled', { reminderId });
  }
}
