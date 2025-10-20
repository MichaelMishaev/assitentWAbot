#!/usr/bin/env tsx
/**
 * Botium Test Runner - FREE conversational AI testing
 *
 * Tests all bug conversation files in botium-tests/convo/
 * Uses Botium Core (open source, free forever)
 */

import { BotiumClient } from 'botium-core';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

async function runBotiumTests() {
  console.log(chalk.blue.bold('\n🤖 Botium Conversational AI Tests\n'));
  console.log(chalk.gray('Testing WhatsApp bot conversation flows...\n'));

  const convoDir = './botium-tests/convo';
  const convoFiles = readdirSync(convoDir).filter(f => f.endsWith('.convo.txt'));

  console.log(chalk.cyan(`Found ${convoFiles.length} conversation test files:\n`));

  const results: TestResult[] = [];
  let totalDuration = 0;

  for (const file of convoFiles) {
    const startTime = Date.now();
    const testName = file.replace('.convo.txt', '');

    try {
      console.log(chalk.gray(`  Running: ${testName}...`));

      // Initialize Botium with config
      const botium = new BotiumClient('./botium.json');
      await botium.Build();

      // Read conversation file
      const convoPath = join(convoDir, file);
      const convoContent = readFileSync(convoPath, 'utf-8');

      // Parse and run conversation
      // Note: This is a simplified runner - full Botium CLI has more features
      const compiler = botium.getCompiler();
      const convos = await compiler.ReadScript(convoPath, 'SCRIPTING_TYPE_CONVO');

      let testPassed = true;
      let errorMsg = '';

      for (const convo of convos) {
        try {
          await convo.Run(botium.getContainer());
        } catch (err: any) {
          testPassed = false;
          errorMsg = err.message || 'Test failed';
          break;
        }
      }

      const duration = Date.now() - startTime;
      totalDuration += duration;

      results.push({
        name: testName,
        passed: testPassed,
        error: errorMsg,
        duration
      });

      if (testPassed) {
        console.log(chalk.green(`  ✅ PASS: ${testName} (${duration}ms)`));
      } else {
        console.log(chalk.red(`  ❌ FAIL: ${testName}`));
        console.log(chalk.red(`     ${errorMsg}`));
      }

      await botium.Clean();

    } catch (err: any) {
      const duration = Date.now() - startTime;
      totalDuration += duration;

      results.push({
        name: testName,
        passed: false,
        error: err.message || 'Unknown error',
        duration
      });

      console.log(chalk.red(`  ❌ ERROR: ${testName}`));
      console.log(chalk.red(`     ${err.message}`));
    }

    console.log('');
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const passRate = ((passed / results.length) * 100).toFixed(1);

  console.log(chalk.bold('\n📊 Test Summary:\n'));
  console.log(chalk.green(`  ✅ Passed: ${passed}`));
  console.log(chalk.red(`  ❌ Failed: ${failed}`));
  console.log(chalk.cyan(`  📈 Pass Rate: ${passRate}%`));
  console.log(chalk.gray(`  ⏱️  Total Duration: ${totalDuration}ms\n`));

  // Detailed failures
  if (failed > 0) {
    console.log(chalk.red.bold('Failed Tests:\n'));
    results.filter(r => !r.passed).forEach(r => {
      console.log(chalk.red(`  ❌ ${r.name}`));
      console.log(chalk.gray(`     ${r.error}\n`));
    });
  }

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runBotiumTests().catch(err => {
  console.error(chalk.red('\n💥 Fatal Error:\n'));
  console.error(err);
  process.exit(1);
});
