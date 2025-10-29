/**
 * ReportGenerator
 * Generates HTML and console reports for QA test results
 */

import fs from 'fs/promises';
import path from 'path';
import { QAReport, TestResult, BugCategory, BugStatus } from './types.js';

export class ReportGenerator {
  /**
   * Generate comprehensive QA report
   */
  generateReport(results: TestResult[]): QAReport {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    // Calculate summary by category and status
    const byCategory: Record<BugCategory, { passed: number; failed: number }> = {
      'date-parsing': { passed: 0, failed: 0 },
      'nlp': { passed: 0, failed: 0 },
      'reminder': { passed: 0, failed: 0 },
      'event': { passed: 0, failed: 0 },
      'search': { passed: 0, failed: 0 },
      'delete': { passed: 0, failed: 0 },
      'update': { passed: 0, failed: 0 },
      'other': { passed: 0, failed: 0 },
    };

    const byStatus: Record<BugStatus, { passed: number; failed: number }> = {
      'pending': { passed: 0, failed: 0 },
      'fixed': { passed: 0, failed: 0 },
      'invalid': { passed: 0, failed: 0 },
    };

    // This would need testCase metadata - for now simplified
    results.forEach((r) => {
      // Default to 'other' category for now
      if (r.passed) {
        byCategory['other'].passed++;
        byStatus['pending'].passed++;
      } else {
        byCategory['other'].failed++;
        byStatus['pending'].failed++;
      }
    });

    return {
      timestamp: new Date().toISOString(),
      totalTests: total,
      passed,
      failed,
      skipped: 0,
      successRate: total > 0 ? (passed / total) * 100 : 0,
      results,
      summary: {
        byCategory,
        byStatus,
      },
    };
  }

  /**
   * Print console report
   */
  printConsoleReport(report: QAReport): void {
    console.log('\n========================================');
    console.log('📊 QA Test Results');
    console.log('========================================');
    console.log(`⏰ Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
    console.log(`📈 Total Tests: ${report.totalTests}`);
    console.log(`✅ Passed: ${report.passed}`);
    console.log(`❌ Failed: ${report.failed}`);
    console.log(`📊 Success Rate: ${report.successRate.toFixed(1)}%`);
    console.log('========================================\n');

    // Print failed tests
    if (report.failed > 0) {
      console.log('❌ Failed Tests:\n');

      report.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`Bug #${r.bugNumber}: ${r.bugTitle || 'Unknown'}`);
          console.log(`  Type: ${r.testType}`);
          if (r.assertion) console.log(`  Assertion: ${r.assertion}`);
          if (r.expected) console.log(`  Expected: ${r.expected}`);
          if (r.actual) console.log(`  Actual: ${r.actual}`);
          if (r.error) console.log(`  Error: ${r.error}`);
          console.log('');
        });
    }
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(report: QAReport, outputPath: string): Promise<void> {
    const html = this.buildHTML(report);
    await fs.writeFile(outputPath, html, 'utf-8');
    console.log(`📄 HTML Report saved to: ${outputPath}`);
  }

  /**
   * Build HTML content
   */
  private buildHTML(report: QAReport): string {
    const passedTests = report.results.filter((r) => r.passed);
    const failedTests = report.results.filter((r) => !r.passed);

    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Test Report - ${new Date(report.timestamp).toLocaleDateString()}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }

    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 32px;
    }

    .timestamp {
      color: #666;
      font-size: 14px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      text-align: center;
    }

    .stat-value {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 10px;
    }

    .stat-label {
      font-size: 14px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .stat-total { color: #667eea; }
    .stat-passed { color: #48bb78; }
    .stat-failed { color: #f56565; }
    .stat-rate { color: #4299e1; }

    .test-section {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }

    .section-title {
      font-size: 24px;
      color: #333;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
    }

    .test-item {
      padding: 15px;
      margin: 10px 0;
      border-radius: 8px;
      border-right: 5px solid;
      background: #f7fafc;
    }

    .test-passed {
      border-color: #48bb78;
      background: #f0fff4;
    }

    .test-failed {
      border-color: #f56565;
      background: #fff5f5;
    }

    .test-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .test-title {
      font-size: 16px;
      font-weight: bold;
      color: #333;
    }

    .test-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      color: white;
    }

    .badge-passed { background: #48bb78; }
    .badge-failed { background: #f56565; }

    .test-details {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
    }

    .test-meta {
      margin-top: 10px;
      font-size: 12px;
      color: #999;
    }

    .error-details {
      background: #fff;
      padding: 10px;
      border-radius: 6px;
      margin-top: 10px;
      border-right: 3px solid #f56565;
    }

    .error-label {
      font-weight: bold;
      color: #f56565;
      margin-bottom: 5px;
    }

    .progress-bar {
      height: 30px;
      background: #e2e8f0;
      border-radius: 15px;
      overflow: hidden;
      margin: 20px 0;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #48bb78, #38a169);
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }

    .no-tests {
      text-align: center;
      padding: 40px;
      color: #999;
      font-size: 18px;
    }

    .execution-time {
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>🧪 QA Test Report</h1>
      <div class="timestamp">Generated: ${new Date(report.timestamp).toLocaleString('he-IL')}</div>
    </div>

    <!-- Statistics -->
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value stat-total">${report.totalTests}</div>
        <div class="stat-label">סה"כ בדיקות</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-passed">${report.passed}</div>
        <div class="stat-label">עברו בהצלחה</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-failed">${report.failed}</div>
        <div class="stat-label">נכשלו</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-rate">${report.successRate.toFixed(1)}%</div>
        <div class="stat-label">אחוז הצלחה</div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="test-section">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${report.successRate}%">
          ${report.successRate.toFixed(1)}%
        </div>
      </div>
    </div>

    <!-- Failed Tests -->
    ${
      failedTests.length > 0
        ? `
    <div class="test-section">
      <h2 class="section-title">❌ בדיקות שנכשלו (${failedTests.length})</h2>
      ${failedTests
        .map(
          (test) => `
        <div class="test-item test-failed">
          <div class="test-header">
            <div class="test-title">Bug #${test.bugNumber}: ${test.bugTitle || 'Unknown'}</div>
            <span class="test-badge badge-failed">FAIL</span>
          </div>
          <div class="test-details">
            ${test.assertion ? `<div>📌 <strong>Assertion:</strong> ${test.assertion}</div>` : ''}
            ${test.testType ? `<div>🔧 <strong>Test Type:</strong> ${test.testType}</div>` : ''}
          </div>
          ${
            test.expected || test.actual || test.error
              ? `
          <div class="error-details">
            ${test.expected ? `<div><span class="error-label">Expected:</span> ${test.expected}</div>` : ''}
            ${test.actual ? `<div><span class="error-label">Actual:</span> ${test.actual}</div>` : ''}
            ${test.error ? `<div><span class="error-label">Error:</span> ${test.error}</div>` : ''}
          </div>
          `
              : ''
          }
          <div class="test-meta">
            ${test.executionTime ? `<span class="execution-time">⏱️ ${test.executionTime}ms</span>` : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
    `
        : ''
    }

    <!-- Passed Tests -->
    ${
      passedTests.length > 0
        ? `
    <div class="test-section">
      <h2 class="section-title">✅ בדיקות שעברו בהצלחה (${passedTests.length})</h2>
      ${passedTests
        .map(
          (test) => `
        <div class="test-item test-passed">
          <div class="test-header">
            <div class="test-title">Bug #${test.bugNumber}: ${test.bugTitle || 'Unknown'}</div>
            <span class="test-badge badge-passed">PASS</span>
          </div>
          <div class="test-meta">
            ${test.testType ? `🔧 ${test.testType}` : ''}
            ${test.executionTime ? `<span class="execution-time">⏱️ ${test.executionTime}ms</span>` : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
    `
        : ''
    }

    ${
      report.totalTests === 0
        ? `
    <div class="test-section">
      <div class="no-tests">
        ⚠️ No tests found in bugs.md
      </div>
    </div>
    `
        : ''
    }
  </div>
</body>
</html>
    `.trim();
  }
}
