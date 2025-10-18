#!/usr/bin/env tsx

/**
 * Check for pending bug reports from production
 * Run: npx tsx check-pending-bugs.ts
 */

import { displayPendingBugs, getBugHistory } from './src/utils/bugReportHelper.js';
import { redis } from './src/config/redis.js';

async function main() {
  try {
    console.log('🔍 Checking for pending bug reports...\n');

    // Display pending bugs
    const pendingDisplay = await displayPendingBugs();
    console.log(pendingDisplay);

    // Show bug history summary
    console.log('\n📊 Bug History Summary:');
    const history = await getBugHistory();
    console.log(`   Total bugs: ${history.total}`);
    console.log(`   Pending: ${history.pending.length}`);
    console.log(`   Fixed: ${history.fixed.length}`);

    if (history.fixed.length > 0) {
      console.log('\n✅ Recently Fixed Bugs:');
      history.fixed.slice(0, 5).forEach((bug, i) => {
        console.log(`   ${i + 1}. ${bug.text}`);
        console.log(`      Fixed: ${new Date(bug.fixedAt || '').toLocaleString('he-IL')}`);
        if (bug.commitHash) {
          console.log(`      Commit: ${bug.commitHash}`);
        }
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
