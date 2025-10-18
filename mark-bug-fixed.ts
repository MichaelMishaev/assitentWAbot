import bugReportHelper from './src/utils/bugReportHelper.js';

async function markFixed() {
  const commitHash = '8457640'; // Latest commit

  // Mark bug #5 as fixed
  const result = await bugReportHelper.markBugAsFixed(
    '#for reminders if time not set , set default 12:00',
    commitHash
  );

  if (result) {
    console.log('✅ Bug #5 marked as fixed');
  } else {
    console.log('❌ Failed to mark bug as fixed');
  }

  // Show remaining bugs
  const output = await bugReportHelper.displayPendingBugs();
  console.log('\n' + output);

  process.exit(0);
}

markFixed().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
