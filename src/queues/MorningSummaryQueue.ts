import { Queue, QueueOptions } from 'bullmq';
import { redis } from '../config/redis.js';
import logger from '../utils/logger.js';

export interface MorningSummaryJob {
  userId: string;
  phone: string;
  timezone: string;
  date: string; // ISO date string
}

// BullMQ Queue options
const queueOptions: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5s delay
    },
    removeOnComplete: {
      age: 48 * 3600, // Keep completed jobs for 48 hours
      count: 5000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Create morning summary queue
export const morningSummaryQueue = new Queue<MorningSummaryJob>(
  'morning-summaries',
  queueOptions
);

logger.info('Morning summary queue initialized');

/**
 * Schedule a morning summary for a specific user at a specific time
 * @param job Job data
 * @param sendAtMs Timestamp (milliseconds) when to send the summary
 */
export async function scheduleMorningSummary(
  job: MorningSummaryJob,
  sendAtMs: number
): Promise<void> {
  const now = Date.now();
  const delay = sendAtMs - now;

  // Safety check - don't schedule if in the past
  if (delay < 0) {
    logger.warn('Morning summary time is in the past, skipping', {
      userId: job.userId,
      sendAtMs: new Date(sendAtMs).toISOString(),
      now: new Date(now).toISOString(),
    });
    return;
  }

  // Schedule the job
  await morningSummaryQueue.add(
    'send-morning-summary',
    job,
    {
      delay,
      jobId: `morning-summary-${job.userId}-${job.date}`,
    }
  );

  logger.info('Morning summary scheduled', {
    userId: job.userId,
    sendAt: new Date(sendAtMs).toISOString(),
    delayMs: delay,
    delayMinutes: Math.floor(delay / (60 * 1000)),
  });
}

/**
 * Cancel a scheduled morning summary
 * @param userId User ID
 * @param date ISO date string
 */
export async function cancelMorningSummary(
  userId: string,
  date: string
): Promise<void> {
  const jobId = `morning-summary-${userId}-${date}`;
  const job = await morningSummaryQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info('Morning summary cancelled', { userId, date });
  }
}
