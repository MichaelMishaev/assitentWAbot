import { pool } from '../config/database.js';
import { messageLogger } from '../services/MessageLogger.js';
import { DateTime } from 'luxon';
import logger from '../utils/logger.js';

interface DailyReport {
  date: string;
  summary: {
    totalMessages: number;
    incomingMessages: number;
    outgoingMessages: number;
    uniqueUsers: number;
    errorCount: number;
    errorRate: string;
    avgProcessingTime: number;
  };
  analytics: {
    topIntents: Array<{ intent: string; count: number }>;
    topStates: Array<{ state: string; count: number }>;
    hourlyDistribution: Array<{ hour: number; count: number }>;
  };
  userActivity: Array<{
    userId: string;
    phone: string;
    messageCount: number;
    lastMessageAt: string;
  }>;
  errors: Array<{
    userId: string;
    phone: string;
    content: string;
    errorMessage: string;
    timestamp: string;
  }>;
  recentMessages: Array<{
    userId: string;
    phone: string;
    messageType: string;
    content: string;
    intent?: string;
    confidence?: number;
    timestamp: string;
  }>;
}

async function generateDailyReport(): Promise<DailyReport> {
  try {
    // Get today's date range in Asia/Jerusalem timezone
    const today = DateTime.now().setZone('Asia/Jerusalem').startOf('day');
    const tomorrow = today.plus({ days: 1 });

    console.log(`📊 Generating report for ${today.toFormat('yyyy-MM-dd')} (Asia/Jerusalem timezone)`);
    console.log(`⏰ Time range: ${today.toISO()} to ${tomorrow.toISO()}\n`);

    // Get overall analytics for today
    const analytics = await messageLogger.getAnalytics(
      undefined,
      today.toJSDate(),
      tomorrow.toJSDate()
    );

    // Get unique users count for today
    const uniqueUsersQuery = `
      SELECT COUNT(DISTINCT user_id) as count
      FROM message_logs
      WHERE created_at >= $1 AND created_at < $2
    `;
    const uniqueUsersResult = await pool.query(uniqueUsersQuery, [
      today.toJSDate(),
      tomorrow.toJSDate()
    ]);
    const uniqueUsers = parseInt(uniqueUsersResult.rows[0].count);

    // Get user activity breakdown
    const userActivityQuery = `
      SELECT
        user_id,
        phone,
        COUNT(*) as message_count,
        MAX(created_at) as last_message_at
      FROM message_logs
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY user_id, phone
      ORDER BY message_count DESC
      LIMIT 20
    `;
    const userActivityResult = await pool.query(userActivityQuery, [
      today.toJSDate(),
      tomorrow.toJSDate()
    ]);

    // Get errors for today
    const errorsQuery = `
      SELECT
        user_id,
        phone,
        content,
        error_message,
        created_at
      FROM message_logs
      WHERE created_at >= $1 AND created_at < $2
        AND has_error = true
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const errorsResult = await pool.query(errorsQuery, [
      today.toJSDate(),
      tomorrow.toJSDate()
    ]);

    // Get recent messages (sample)
    const recentMessagesQuery = `
      SELECT
        user_id,
        phone,
        message_type,
        content,
        intent,
        confidence,
        created_at
      FROM message_logs
      WHERE created_at >= $1 AND created_at < $2
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const recentMessagesResult = await pool.query(recentMessagesQuery, [
      today.toJSDate(),
      tomorrow.toJSDate()
    ]);

    // Build the report
    const report: DailyReport = {
      date: today.toFormat('yyyy-MM-dd'),
      summary: {
        totalMessages: analytics.totalMessages,
        incomingMessages: analytics.incomingMessages,
        outgoingMessages: analytics.outgoingMessages,
        uniqueUsers: uniqueUsers,
        errorCount: errorsResult.rows.length,
        errorRate: `${analytics.errorRate.toFixed(2)}%`,
        avgProcessingTime: Math.round(analytics.avgProcessingTime)
      },
      analytics: {
        topIntents: analytics.topIntents,
        topStates: analytics.topStates,
        hourlyDistribution: analytics.hourlyDistribution
      },
      userActivity: userActivityResult.rows.map(row => ({
        userId: row.user_id,
        phone: row.phone,
        messageCount: parseInt(row.message_count),
        lastMessageAt: DateTime.fromJSDate(row.last_message_at).setZone('Asia/Jerusalem').toFormat('HH:mm:ss')
      })),
      errors: errorsResult.rows.map(row => ({
        userId: row.user_id,
        phone: row.phone,
        content: row.content.substring(0, 100) + (row.content.length > 100 ? '...' : ''),
        errorMessage: row.error_message,
        timestamp: DateTime.fromJSDate(row.created_at).setZone('Asia/Jerusalem').toFormat('HH:mm:ss')
      })),
      recentMessages: recentMessagesResult.rows.map(row => ({
        userId: row.user_id,
        phone: row.phone,
        messageType: row.message_type,
        content: row.content.substring(0, 150) + (row.content.length > 150 ? '...' : ''),
        intent: row.intent,
        confidence: row.confidence ? parseFloat(row.confidence) : undefined,
        timestamp: DateTime.fromJSDate(row.created_at).setZone('Asia/Jerusalem').toFormat('HH:mm:ss')
      }))
    };

    return report;
  } catch (error) {
    logger.error('Failed to generate daily report', { error });
    throw error;
  }
}

function printReport(report: DailyReport): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`📊 DAILY MESSAGE REPORT - ${report.date}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Summary
  console.log('📈 SUMMARY');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`Total Messages:      ${report.summary.totalMessages}`);
  console.log(`├─ Incoming:         ${report.summary.incomingMessages}`);
  console.log(`└─ Outgoing:         ${report.summary.outgoingMessages}`);
  console.log(`Unique Users:        ${report.summary.uniqueUsers}`);
  console.log(`Errors:              ${report.summary.errorCount} (${report.summary.errorRate})`);
  console.log(`Avg Processing Time: ${report.summary.avgProcessingTime}ms\n`);

  // Top Intents
  if (report.analytics.topIntents.length > 0) {
    console.log('🎯 TOP INTENTS');
    console.log('─────────────────────────────────────────────────────────────');
    report.analytics.topIntents.forEach((intent, idx) => {
      const bar = '█'.repeat(Math.min(50, Math.ceil(intent.count / 2)));
      console.log(`${idx + 1}. ${intent.intent.padEnd(30)} ${intent.count.toString().padStart(5)} ${bar}`);
    });
    console.log();
  }

  // Top States
  if (report.analytics.topStates.length > 0) {
    console.log('💬 TOP CONVERSATION STATES');
    console.log('─────────────────────────────────────────────────────────────');
    report.analytics.topStates.forEach((state, idx) => {
      const bar = '█'.repeat(Math.min(50, Math.ceil(state.count / 2)));
      console.log(`${idx + 1}. ${state.state.padEnd(30)} ${state.count.toString().padStart(5)} ${bar}`);
    });
    console.log();
  }

  // Hourly Distribution
  if (report.analytics.hourlyDistribution.length > 0) {
    console.log('⏰ HOURLY DISTRIBUTION');
    console.log('─────────────────────────────────────────────────────────────');
    const maxCount = Math.max(...report.analytics.hourlyDistribution.map(h => h.count));
    report.analytics.hourlyDistribution
      .sort((a, b) => a.hour - b.hour)
      .forEach(hour => {
        const barLength = Math.ceil((hour.count / maxCount) * 40);
        const bar = '█'.repeat(barLength);
        const hourStr = `${hour.hour.toString().padStart(2, '0')}:00`;
        console.log(`${hourStr}  ${hour.count.toString().padStart(5)} ${bar}`);
      });
    console.log();
  }

  // User Activity
  if (report.userActivity.length > 0) {
    console.log('👥 TOP ACTIVE USERS (Top 20)');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('User ID              Phone           Messages  Last Activity');
    console.log('─────────────────────────────────────────────────────────────');
    report.userActivity.slice(0, 20).forEach(user => {
      const userId = user.userId.substring(0, 20).padEnd(20);
      const phone = user.phone.substring(0, 15).padEnd(15);
      const count = user.messageCount.toString().padStart(8);
      console.log(`${userId} ${phone} ${count}  ${user.lastMessageAt}`);
    });
    console.log();
  }

  // Errors
  if (report.errors.length > 0) {
    console.log('⚠️  ERRORS');
    console.log('─────────────────────────────────────────────────────────────');
    report.errors.forEach((error, idx) => {
      console.log(`${idx + 1}. [${error.timestamp}] ${error.phone}`);
      console.log(`   Content: ${error.content}`);
      console.log(`   Error:   ${error.errorMessage}\n`);
    });
  } else {
    console.log('✅ NO ERRORS TODAY!\n');
  }

  // Recent Messages Sample
  if (report.recentMessages.length > 0) {
    console.log('💬 RECENT MESSAGES (Last 100)');
    console.log('─────────────────────────────────────────────────────────────');
    report.recentMessages.slice(0, 20).forEach((msg, idx) => {
      const type = msg.messageType === 'incoming' ? '📩' : '📤';
      const intent = msg.intent ? ` [${msg.intent}]` : '';
      const confidence = msg.confidence ? ` (${(msg.confidence * 100).toFixed(0)}%)` : '';
      console.log(`${idx + 1}. ${type} [${msg.timestamp}] ${msg.phone}${intent}${confidence}`);
      console.log(`   ${msg.content}\n`);
    });
    if (report.recentMessages.length > 20) {
      console.log(`... and ${report.recentMessages.length - 20} more messages\n`);
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('END OF REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting daily message report generation...\n');

    const report = await generateDailyReport();
    printReport(report);

    // Optionally save to file
    const fs = await import('fs/promises');
    const reportPath = `./reports/daily-report-${report.date}.json`;
    await fs.mkdir('./reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`💾 Report saved to: ${reportPath}\n`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to generate report:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateDailyReport, printReport, DailyReport };
