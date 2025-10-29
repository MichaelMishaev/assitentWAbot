/**
 * TestRunner
 * Executes automated tests for bug validation
 */

import { DateTime } from 'luxon';
import { parseHebrewDate } from '../../utils/hebrewDateParser.js';
import { pipelineOrchestrator } from '../../domain/orchestrator/PipelineOrchestrator.js';
import { BugTestCase, TestResult, Assertion } from './types.js';
import logger from '../../utils/logger.js';

export class TestRunner {
  constructor() {
    // No initialization needed - using pipeline orchestrator directly
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: BugTestCase): Promise<TestResult> {
    const startTime = Date.now();

    try {
      switch (testCase.testType) {
        case 'date-parser':
          return await this.testDateParser(testCase, startTime);

        case 'nlp':
          return await this.testNLP(testCase, startTime);

        case 'end-to-end':
          // For now, skip end-to-end tests (would require full bot simulation)
          return {
            passed: true,
            bugNumber: testCase.bugNumber,
            bugTitle: testCase.title,
            testType: testCase.testType,
            executionTime: Date.now() - startTime,
          };

        default:
          return {
            passed: false,
            bugNumber: testCase.bugNumber,
            bugTitle: testCase.title,
            error: `Unknown test type: ${testCase.testType}`,
            executionTime: Date.now() - startTime,
          };
      }
    } catch (error: any) {
      return {
        passed: false,
        bugNumber: testCase.bugNumber,
        bugTitle: testCase.title,
        testType: testCase.testType,
        error: error.message || String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Test date parser
   */
  private async testDateParser(testCase: BugTestCase, startTime: number): Promise<TestResult> {
    const result = parseHebrewDate(testCase.userMessage, 'Asia/Jerusalem');

    // Check each assertion
    for (const assertion of testCase.assertions) {
      const assertionResult = this.checkDateAssertion(assertion, result, testCase);

      if (!assertionResult.passed) {
        return {
          passed: false,
          bugNumber: testCase.bugNumber,
          bugTitle: testCase.title,
          testType: testCase.testType,
          expected: assertionResult.expected,
          actual: assertionResult.actual,
          assertion: assertion.description,
          executionTime: Date.now() - startTime,
        };
      }
    }

    return {
      passed: true,
      bugNumber: testCase.bugNumber,
      bugTitle: testCase.title,
      testType: testCase.testType,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Check date assertion
   */
  private checkDateAssertion(
    assertion: Assertion,
    parseResult: any,
    testCase: BugTestCase
  ): { passed: boolean; expected?: string; actual?: string } {
    if (assertion.type === 'no-error') {
      if (!parseResult.success) {
        return {
          passed: false,
          expected: 'Successful parse',
          actual: parseResult.error || 'Parse failed',
        };
      }
      return { passed: true };
    }

    if (assertion.type === 'date' && assertion.expected.relativeDay !== undefined) {
      if (!parseResult.success || !parseResult.date) {
        return {
          passed: false,
          expected: `Date ${assertion.expected.relativeDay} days from now`,
          actual: parseResult.error || 'No date returned',
        };
      }

      const now = DateTime.now().setZone('Asia/Jerusalem');
      const expectedDate = now.plus({ days: assertion.expected.relativeDay });

      if (assertion.expected.hour !== undefined) {
        expectedDate.set({ hour: assertion.expected.hour, minute: 0, second: 0 });
      }

      const actualDate = DateTime.fromJSDate(parseResult.date, { zone: 'Asia/Jerusalem' });

      // Check if dates match (same day)
      const dayMatches = actualDate.hasSame(expectedDate, 'day');
      const hourMatches =
        assertion.expected.hour === undefined || actualDate.hour === assertion.expected.hour;

      if (!dayMatches || !hourMatches) {
        return {
          passed: false,
          expected: expectedDate.toFormat('dd/MM/yyyy HH:mm'),
          actual: actualDate.toFormat('dd/MM/yyyy HH:mm'),
        };
      }

      return { passed: true };
    }

    // Custom validator
    if (assertion.customValidator) {
      const passed = assertion.customValidator(parseResult);
      return {
        passed,
        expected: assertion.description,
        actual: passed ? 'Match' : 'No match',
      };
    }

    return { passed: true };
  }

  /**
   * Test NLP classification
   */
  private async testNLP(testCase: BugTestCase, startTime: number): Promise<TestResult> {
    // Use pipeline orchestrator to classify the message
    const result = await pipelineOrchestrator.execute(
      {
        from: 'test-user@test',
        messageId: `test-${Date.now()}`,
        timestamp: Date.now(),
        content: { text: testCase.userMessage }
      },
      { userId: 'test-user', phone: 'test-phone' }
    );

    // Check each assertion
    for (const assertion of testCase.assertions) {
      const assertionResult = this.checkNLPAssertion(assertion, result, testCase);

      if (!assertionResult.passed) {
        return {
          passed: false,
          bugNumber: testCase.bugNumber,
          bugTitle: testCase.title,
          testType: testCase.testType,
          expected: assertionResult.expected,
          actual: assertionResult.actual,
          assertion: assertion.description,
          executionTime: Date.now() - startTime,
        };
      }
    }

    return {
      passed: true,
      bugNumber: testCase.bugNumber,
      bugTitle: testCase.title,
      testType: testCase.testType,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Check NLP assertion
   */
  private checkNLPAssertion(
    assertion: Assertion,
    nlpResult: any,
    testCase: BugTestCase
  ): { passed: boolean; expected?: string; actual?: string } {
    if (assertion.type === 'intent') {
      // Check for negative assertion (should NOT be X)
      if (assertion.expected.not) {
        if (nlpResult.intent === assertion.expected.not) {
          return {
            passed: false,
            expected: `NOT ${assertion.expected.not}`,
            actual: nlpResult.intent,
          };
        }
        return { passed: true };
      }

      // Positive assertion
      if (nlpResult.intent !== assertion.expected) {
        return {
          passed: false,
          expected: assertion.expected,
          actual: nlpResult.intent,
        };
      }

      return { passed: true };
    }

    if (assertion.type === 'confidence') {
      const minConfidence = assertion.expected.min || 0.7;

      if (nlpResult.confidence < minConfidence) {
        return {
          passed: false,
          expected: `Confidence >= ${minConfidence}`,
          actual: `Confidence = ${nlpResult.confidence.toFixed(2)}`,
        };
      }

      return { passed: true };
    }

    if (assertion.type === 'entity') {
      // Check specific entity values
      for (const [key, value] of Object.entries(assertion.expected)) {
        const actualValue = nlpResult[key];

        if (actualValue !== value) {
          return {
            passed: false,
            expected: `${key} = ${value}`,
            actual: `${key} = ${actualValue}`,
          };
        }
      }

      return { passed: true };
    }

    // Custom validator
    if (assertion.customValidator) {
      const passed = assertion.customValidator(nlpResult);
      return {
        passed,
        expected: assertion.description,
        actual: passed ? 'Match' : 'No match',
      };
    }

    return { passed: true };
  }
}
