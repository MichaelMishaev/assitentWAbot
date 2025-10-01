import { readFileSync } from 'fs';
import { join } from 'path';
import { runMigration } from '../src/config/database';
import logger from '../src/utils/logger';

async function runInitialMigration() {
  try {
    logger.info('Running initial database migration...');

    const migrationPath = join(__dirname, '../migrations/1733086800000_initial-schema.sql');
    const sql = readFileSync(migrationPath, 'utf-8');

    await runMigration(sql);

    logger.info('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runInitialMigration();
