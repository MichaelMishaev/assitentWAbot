import bugReportHelper from './src/utils/bugReportHelper.js';

async function checkBugs() {
  const output = await bugReportHelper.displayPendingBugs();
  console.log(output);

  const bugs = await bugReportHelper.getPendingBugs();
  console.log('\n📊 Raw bug data:');
  bugs.forEach((bug, i) => {
    console.log(`\n${i + 1}.`, JSON.stringify(bug, null, 2));
  });

  process.exit(0);
}

checkBugs().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
