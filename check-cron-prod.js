/**
 * Check Production Cron Configuration
 * Verifies the morning summary daily scheduler is properly configured
 */

import Redis from 'ioredis';

const PROD_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function checkCronInProduction() {
  console.log('🔍 Checking Production Cron Configuration...\n');
  console.log(`📡 Redis URL: ${PROD_REDIS_URL}\n`);

  const redis = new Redis(PROD_REDIS_URL);

  try {
    // Test Redis connection
    await redis.ping();
    console.log('✅ Redis connection successful\n');

    // Check for daily-scheduler repeatable jobs
    console.log('📅 Checking Daily Scheduler Repeatable Jobs:');
    console.log('─'.repeat(50));

    const repeatableJobs = await redis.smembers('bull:daily-scheduler:repeat');

    if (repeatableJobs.length === 0) {
      console.log('⚠️  No repeatable jobs found for daily-scheduler');
      console.log('   The scheduler may not be initialized yet.');
      console.log('   Start the bot to initialize the cron job.\n');
    } else {
      console.log(`✅ Found ${repeatableJobs.length} repeatable job(s):\n`);

      for (const jobKey of repeatableJobs) {
        try {
          // Get job details
          const jobData = await redis.hgetall(`bull:daily-scheduler:repeat:${jobKey}`);

          console.log(`Job Key: ${jobKey}`);
          console.log(`  Pattern: ${jobData.pattern || 'N/A'}`);
          console.log(`  Cron: ${jobData.cron || 'N/A'}`);
          console.log(`  Next Run: ${jobData.next ? new Date(parseInt(jobData.next)).toISOString() : 'N/A'}`);
          console.log(`  Timezone: ${jobData.tz || 'UTC'}`);
          console.log('');

          // Verify it's the correct pattern
          if (jobData.pattern === '0 9 * * *' || jobData.cron === '0 9 * * *') {
            console.log('  ✅ Correct cron pattern: 9 AM UTC daily\n');
          } else {
            console.log(`  ⚠️  Unexpected cron pattern: ${jobData.pattern || jobData.cron}\n`);
          }
        } catch (error) {
          console.log(`  ❌ Error reading job details: ${error.message}\n`);
        }
      }
    }

    // Check for morning-summaries queue
    console.log('📬 Checking Morning Summary Queue:');
    console.log('─'.repeat(50));

    const waitingJobs = await redis.zcard('bull:morning-summaries:wait');
    const activeJobs = await redis.llen('bull:morning-summaries:active');
    const completedJobs = await redis.zcard('bull:morning-summaries:completed');
    const failedJobs = await redis.zcard('bull:morning-summaries:failed');

    console.log(`  Waiting:   ${waitingJobs} job(s)`);
    console.log(`  Active:    ${activeJobs} job(s)`);
    console.log(`  Completed: ${completedJobs} job(s)`);
    console.log(`  Failed:    ${failedJobs} job(s)`);
    console.log('');

    // Show next scheduled jobs
    if (waitingJobs > 0) {
      console.log('📋 Next Scheduled Morning Summaries:');
      console.log('─'.repeat(50));

      const nextJobs = await redis.zrange('bull:morning-summaries:wait', 0, 4, 'WITHSCORES');

      for (let i = 0; i < nextJobs.length; i += 2) {
        const jobId = nextJobs[i];
        const timestamp = nextJobs[i + 1];
        const scheduledTime = new Date(parseInt(timestamp));

        console.log(`  Job: ${jobId}`);
        console.log(`  Scheduled: ${scheduledTime.toISOString()}`);
        console.log('');
      }
    }

    // Summary
    console.log('📊 Summary:');
    console.log('─'.repeat(50));
    console.log(`✅ Redis: Connected`);
    console.log(`${repeatableJobs.length > 0 ? '✅' : '⚠️ '} Daily Scheduler: ${repeatableJobs.length > 0 ? 'Configured' : 'Not configured'}`);
    console.log(`${waitingJobs > 0 ? '✅' : '📌'} Scheduled Jobs: ${waitingJobs} waiting`);
    console.log('');

    if (repeatableJobs.length === 0) {
      console.log('⚡ Action Required:');
      console.log('   Deploy the updated code and restart the bot to initialize the cron job.');
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Check if Redis is running');
    console.error('  2. Verify REDIS_URL environment variable');
    console.error('  3. Check network connectivity to Redis server');
  } finally {
    await redis.quit();
  }
}

checkCronInProduction().catch(console.error);
