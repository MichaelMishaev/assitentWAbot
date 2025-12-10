/**
 * QA Test Runner - Main Entry Point
 * Automated bug validation from bugs.md
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { BugTestExtractor } from './qa/BugTestExtractor.js';
import { TestRunner } from './qa/TestRunner.js';
import { ReportGenerator } from './qa/ReportGenerator.js';
import { TestResult } from './qa/types.js';
import { initializePipeline } from '../domain/orchestrator/PhaseInitializer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🧪 Starting QA Test Suite\n');
  console.log('========================================\n');

  const startTime = Date.now();

  // Initialize pipeline (CRITICAL: Register all phases)
  console.log('🔧 Initializing pipeline...');
  await initializePipeline();
  console.log('✅ Pipeline initialized\n');

  try {
    // Step 1: Extract test cases from bugs.md
    console.log('📖 Step 1/4: Parsing bugs.md...');
    const extractor = new BugTestExtractor();
    const bugsFilePath = path.join(__dirname, '../../docs/development/bugs.md');

    const testCases = await extractor.extractTestCases(bugsFilePath);
    console.log(`✅ Found ${testCases.length} test cases\n`);

    if (testCases.length === 0) {
      console.log('⚠️  No test cases found in bugs.md');
      console.log('Make sure bugs.md contains properly formatted bug sections.');
      process.exit(0);
    }

    // Show test case summary
    console.log('📊 Test Cases Summary:');
    const byStatus = testCases.reduce(
      (acc, tc) => {
        acc[tc.status] = (acc[tc.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const byType = testCases.reduce(
      (acc, tc) => {
        acc[tc.testType] = (acc[tc.testType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log(`  By Status: ${JSON.stringify(byStatus)}`);
    console.log(`  By Type: ${JSON.stringify(byType)}`);
    console.log('');

    // Step 2: Run tests
    console.log('🔬 Step 2/4: Running tests...\n');
    const runner = new TestRunner();
    const results: TestResult[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      process.stdout.write(`  [${i + 1}/${testCases.length}] Testing Bug #${testCase.bugNumber}...`);

      const result = await runner.runTest(testCase);
      results.push(result);

      if (result.passed) {
        console.log(' ✅ PASS');
      } else {
        console.log(' ❌ FAIL');
        if (result.error) {
          console.log(`      Error: ${result.error}`);
        } else {
          console.log(`      Expected: ${result.expected}`);
          console.log(`      Actual: ${result.actual}`);
        }
      }
    }

    console.log('');

    // Step 3: Generate report
    console.log('📄 Step 3/4: Generating report...');
    const reportGenerator = new ReportGenerator();
    const report = reportGenerator.generateReport(results);

    // Save HTML report
    const htmlPath = path.join(__dirname, '../../qa-report.html');
    await reportGenerator.generateHTMLReport(report, htmlPath);

    // Step 4: Print summary
    console.log('\n📊 Step 4/4: Test Summary\n');
    reportGenerator.printConsoleReport(report);

    // Exit with appropriate code
    const totalTime = Date.now() - startTime;
    console.log(`⏱️  Total execution time: ${totalTime}ms\n`);

    if (report.failed > 0) {
      console.log('❌ Some tests failed. See qa-report.html for details.');
      process.exit(1);
    } else {
      console.log('✅ All tests passed!');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n❌ QA Test Suite failed with error:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test suite
main();
