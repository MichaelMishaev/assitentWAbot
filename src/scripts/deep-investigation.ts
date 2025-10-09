import { pool } from '../config/database.js';
import { DateTime } from 'luxon';

async function deepInvestigation() {
  try {
    console.log('🔍 DEEP INVESTIGATION - Checking ALL message data\n');

    // First, what is the actual current date/time in the database?
    const dateQuery = `SELECT NOW() as db_time, NOW() AT TIME ZONE 'Asia/Jerusalem' as israel_time`;
    const dateResult = await pool.query(dateQuery);
    console.log('🕐 Current Time:');
    console.log(`   Database UTC: ${dateResult.rows[0].db_time}`);
    console.log(`   Israel Time:  ${dateResult.rows[0].israel_time}`);
    console.log();

    // Get ALL message data - any date, any time
    const allMessagesQuery = `
      SELECT
        DATE(created_at AT TIME ZONE 'Asia/Jerusalem') as date,
        COUNT(*) as count,
        MIN(created_at AT TIME ZONE 'Asia/Jerusalem') as first_message,
        MAX(created_at AT TIME ZONE 'Asia/Jerusalem') as last_message
      FROM message_logs
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `;
    const allMessagesResult = await pool.query(allMessagesQuery);

    console.log('📊 ALL MESSAGES BY DATE (Last 30 days):');
    console.log('   Date          Count   First Message        Last Message');
    console.log('   ────────────────────────────────────────────────────────────────');

    if (allMessagesResult.rows.length === 0) {
      console.log('   ⚠️  NO MESSAGES FOUND AT ALL!\n');
    } else {
      allMessagesResult.rows.forEach(row => {
        const first = DateTime.fromJSDate(row.first_message).toFormat('HH:mm:ss');
        const last = DateTime.fromJSDate(row.last_message).toFormat('HH:mm:ss');
        console.log(`   ${row.date}    ${row.count.toString().padStart(5)}   ${first}            ${last}`);
      });
      console.log();
    }

    // Check yesterday specifically (Oct 8, 2025)
    const yesterday = DateTime.fromISO('2025-10-08', { zone: 'Asia/Jerusalem' });
    const today = yesterday.plus({ days: 1 });

    console.log(`📅 YESTERDAY (${yesterday.toFormat('yyyy-MM-dd')}) Check:`);
    console.log(`   Time range: ${yesterday.toISO()} to ${today.toISO()}\n`);

    const yesterdayQuery = `
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
      LIMIT 100
    `;
    const yesterdayResult = await pool.query(yesterdayQuery, [
      yesterday.toJSDate(),
      today.toJSDate()
    ]);

    if (yesterdayResult.rows.length > 0) {
      console.log(`   ✅ Found ${yesterdayResult.rows.length} messages for yesterday!\n`);

      yesterdayResult.rows.forEach((row, idx) => {
        const type = row.message_type === 'incoming' ? '📩' : '📤';
        const time = DateTime.fromJSDate(row.timestamp).toFormat('HH:mm:ss');
        const content = row.content.substring(0, 100) + (row.content.length > 100 ? '...' : '');
        console.log(`   ${idx + 1}. ${type} [${time}] ${row.phone}`);
        console.log(`      ${content}`);
        if (row.intent) console.log(`      Intent: ${row.intent}`);
        console.log();
      });
    } else {
      console.log('   ❌ No messages found for yesterday either!\n');
    }

    // Get the absolute latest messages regardless of date
    console.log('📬 LATEST MESSAGES (Absolute Last 20, any date):');
    console.log('   ────────────────────────────────────────────────────────────────');
    const latestQuery = `
      SELECT
        created_at AT TIME ZONE 'Asia/Jerusalem' as timestamp,
        user_id,
        phone,
        message_type,
        content
      FROM message_logs
      ORDER BY created_at DESC
      LIMIT 20
    `;
    const latestResult = await pool.query(latestQuery);

    if (latestResult.rows.length > 0) {
      latestResult.rows.forEach((row, idx) => {
        const type = row.message_type === 'incoming' ? '📩' : '📤';
        const timestamp = DateTime.fromJSDate(row.timestamp).toFormat('yyyy-MM-dd HH:mm:ss');
        const content = row.content.substring(0, 80) + (row.content.length > 80 ? '...' : '');
        console.log(`   ${idx + 1}. ${type} ${timestamp} | ${row.phone}`);
        console.log(`      ${content}\n`);
      });
    } else {
      console.log('   ❌ Database is completely empty!\n');
    }

    // Total count
    const countQuery = `SELECT COUNT(*) as total FROM message_logs`;
    const countResult = await pool.query(countQuery);
    console.log(`\n📊 TOTAL MESSAGES IN DATABASE: ${countResult.rows[0].total}\n`);

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

deepInvestigation();
