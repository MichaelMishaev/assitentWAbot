import { pool } from '../config/database.js';

async function checkSchema() {
  try {
    console.log('🔍 Checking database schema...\n');

    // Check if message_logs table exists
    const tableQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const tableResult = await pool.query(tableQuery);

    console.log(`📋 Tables in database (${tableResult.rows.length} total):`);
    tableResult.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.table_name}`);
    });
    console.log();

    // Check if message_logs table exists specifically
    const hasMessageLogs = tableResult.rows.some(row => row.table_name === 'message_logs');

    if (hasMessageLogs) {
      console.log('✅ message_logs table exists!\n');

      // Get column information
      const columnQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'message_logs'
        ORDER BY ordinal_position
      `;
      const columnResult = await pool.query(columnQuery);

      console.log('📊 message_logs columns:');
      console.log('   Column Name              Type                   Nullable');
      console.log('   ───────────────────────────────────────────────────────────');
      columnResult.rows.forEach(row => {
        const name = row.column_name.padEnd(24);
        const type = row.data_type.padEnd(22);
        console.log(`   ${name} ${type} ${row.is_nullable}`);
      });
      console.log();

      // Check row count
      const countQuery = `SELECT COUNT(*) as count FROM message_logs`;
      const countResult = await pool.query(countQuery);
      console.log(`📊 Total rows in message_logs: ${countResult.rows[0].count}\n`);
    } else {
      console.log('❌ message_logs table does NOT exist!\n');
      console.log('   💡 You may need to run database migrations:\n');
      console.log('      npm run migrate:up\n');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkSchema();
