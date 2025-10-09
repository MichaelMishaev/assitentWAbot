import { pool } from '../config/database.js';
import { DateTime } from 'luxon';

async function checkMessages() {
  try {
    console.log('🔍 Checking message database...\n');

    // Get date range of messages
    const rangeQuery = `
      SELECT
        MIN(created_at AT TIME ZONE 'Asia/Jerusalem') as earliest,
        MAX(created_at AT TIME ZONE 'Asia/Jerusalem') as latest,
        COUNT(*) as total
      FROM message_logs
    `;
    const rangeResult = await pool.query(rangeQuery);
    console.log('📅 Date Range:');
    console.log(`   Earliest: ${rangeResult.rows[0].earliest}`);
    console.log(`   Latest:   ${rangeResult.rows[0].latest}`);
    console.log(`   Total:    ${rangeResult.rows[0].total} messages\n`);

    // Get messages by date (last 7 days)
    const dailyQuery = `
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Jerusalem') as date,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM message_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY date
      ORDER BY date DESC
    `;
    const dailyResult = await pool.query(dailyQuery);
    console.log('📊 Messages by Date (Last 7 days):');
    console.log('   Date          Messages  Users');
    console.log('   ──────────────────────────────');
    dailyResult.rows.forEach(row => {
      console.log(`   ${row.date}    ${row.count.toString().padStart(7)}  ${row.unique_users.toString().padStart(5)}`);
    });
    console.log();

    // Get today's messages (in Jerusalem timezone)
    const today = DateTime.now().setZone('Asia/Jerusalem').startOf('day');
    const tomorrow = today.plus({ days: 1 });

    console.log(`🔍 Checking messages for today (${today.toFormat('yyyy-MM-dd')})...`);
    console.log(`   Time range: ${today.toISO()} to ${tomorrow.toISO()}\n`);

    const todayQuery = `
      SELECT
        created_at AT TIME ZONE 'Asia/Jerusalem' as timestamp,
        user_id,
        phone,
        message_type,
        content,
        intent
      FROM message_logs
      WHERE created_at >= $1 AND created_at < $2
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const todayResult = await pool.query(todayQuery, [today.toJSDate(), tomorrow.toJSDate()]);

    if (todayResult.rows.length === 0) {
      console.log('   ⚠️  No messages found for today!\n');

      // Get the most recent messages instead
      console.log('📬 Most Recent Messages (Last 50):');
      console.log('   ──────────────────────────────────────────────────────────');
      const recentQuery = `
        SELECT
          created_at AT TIME ZONE 'Asia/Jerusalem' as timestamp,
          user_id,
          phone,
          message_type,
          content,
          intent
        FROM message_logs
        ORDER BY created_at DESC
        LIMIT 50
      `;
      const recentResult = await pool.query(recentQuery);

      recentResult.rows.forEach((row, idx) => {
        const type = row.message_type === 'incoming' ? '📩' : '📤';
        const time = DateTime.fromJSDate(row.timestamp).toFormat('yyyy-MM-dd HH:mm:ss');
        const content = row.content.substring(0, 100) + (row.content.length > 100 ? '...' : '');
        console.log(`   ${idx + 1}. ${type} [${time}] ${row.phone}`);
        console.log(`      ${content}`);
        if (row.intent) console.log(`      Intent: ${row.intent}`);
        console.log();
      });
    } else {
      console.log(`   ✅ Found ${todayResult.rows.length} messages for today!\n`);

      todayResult.rows.forEach((row, idx) => {
        const type = row.message_type === 'incoming' ? '📩' : '📤';
        const time = DateTime.fromJSDate(row.timestamp).toFormat('HH:mm:ss');
        const content = row.content.substring(0, 100) + (row.content.length > 100 ? '...' : '');
        console.log(`   ${idx + 1}. ${type} [${time}] ${row.phone}`);
        console.log(`      ${content}`);
        if (row.intent) console.log(`      Intent: ${row.intent}`);
        console.log();
      });
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkMessages();
