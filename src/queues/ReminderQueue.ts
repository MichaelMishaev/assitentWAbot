import { Queue, QueueOptions } from 'bullmq';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';

export interface ReminderJob {
  reminderId: string;
  userId: string;
  title: string;
  phone: string;
  leadTimeMinutes?: number; // Minutes before due time to send reminder (0 = at exact time)
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
  dueDate: Date,
  leadTimeMinutes?: number
): Promise<void> {
  // CRITICAL: Calculate delay with lead time
  const now = Date.now();
  const dueDateMs = dueDate.getTime();

  // Validate lead time (defensive programming)
  let validatedLeadTime = 0;
  if (leadTimeMinutes !== undefined && leadTimeMinutes !== null) {
    if (typeof leadTimeMinutes === 'number' && !isNaN(leadTimeMinutes)) {
      // Clamp to valid range [0, 10080] (max 1 week = 7 days * 24 hours * 60 minutes)
      // BUG FIX: Increased from 120 to 10080 to support "תזכיר לי יום לפני" (1440 min = 1 day)
      validatedLeadTime = Math.max(0, Math.min(10080, Math.floor(leadTimeMinutes)));
    } else {
      logger.warn('Invalid lead time provided, using 0', {
        reminderId: job.reminderId,
        providedLeadTime: leadTimeMinutes
      });
    }
  }

  // Convert lead time to milliseconds
  const leadTimeMs = validatedLeadTime * 60 * 1000;

  // Calculate actual delay: (due time - lead time) - now
  const targetSendTime = dueDateMs - leadTimeMs;
  const delay = targetSendTime - now;

  // SAFETY CHECK #1: Reminder would be in the past
  // BUG FIX: Only treat as "in the past" if it's more than 60 seconds behind
  // (to account for computation delays). Otherwise, schedule normally with delay=0
  if (delay < -60000) {
    const minutesInPast = Math.abs(Math.floor(delay / (60 * 1000)));

    // More than 5 minutes in past - skip it
    logger.warn('Reminder target time is too far in past, skipping', {
      reminderId: job.reminderId,
      dueDate,
      leadTimeMinutes: validatedLeadTime,
      minutesInPast,
      targetSendTime: new Date(targetSendTime),
    });
    return;
  }

  // SAFETY CHECK #2: Lead time is greater than time until due date
  const timeUntilDue = dueDateMs - now;
  if (leadTimeMs > timeUntilDue) {
    logger.warn('Lead time exceeds time until due date, adjusting', {
      reminderId: job.reminderId,
      leadTimeMinutes: validatedLeadTime,
      timeUntilDueMinutes: Math.floor(timeUntilDue / (60 * 1000)),
      willSendImmediately: delay <= 0,
    });
  }

  // Schedule the reminder
  await reminderQueue.add(
    'send-reminder',
    { ...job, leadTimeMinutes: validatedLeadTime },
    {
      delay: Math.max(0, delay), // Ensure non-negative
      jobId: `reminder-${job.reminderId}`,
    }
  );

  logger.info('Reminder scheduled with lead time', {
    reminderId: job.reminderId,
    userId: job.userId,
    dueDate,
    leadTimeMinutes: validatedLeadTime,
    targetSendTime: new Date(targetSendTime),
    delayMs: delay,
    delayMinutes: Math.floor(delay / (60 * 1000)),
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
