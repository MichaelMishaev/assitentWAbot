/**
 * BugTestExtractor
 * Parses bugs.md and extracts test cases
 */

import fs from 'fs/promises';
import { BugTestCase, BugCategory, BugStatus, TestType, Assertion } from './types.js';

export class BugTestExtractor {
  /**
   * Extract all test cases from bugs.md
   */
  async extractTestCases(bugsFilePath: string): Promise<BugTestCase[]> {
    const content = await fs.readFile(bugsFilePath, 'utf-8');

    // Match bug sections: ## Bug #X - Title
    const bugPattern = /## Bug #(\[TBD\]|\d+) - (.+?)\n([\s\S]+?)(?=\n## Bug #|\n---\n*$|$)/g;

    const testCases: BugTestCase[] = [];
    let match;

    while ((match = bugPattern.exec(content)) !== null) {
      const bugNumber = match[1];
      const title = match[2].trim();
      const bugSection = match[3];

      try {
        const testCase = this.parseBugSection(bugNumber, title, bugSection);
        if (testCase && testCase.userMessage) {
          testCases.push(testCase);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to parse Bug #${bugNumber}:`, error);
      }
    }

    return testCases;
  }

  /**
   * Parse a single bug section
   */
  private parseBugSection(bugNumber: string, title: string, section: string): BugTestCase | null {
    // Extract metadata
    const status = this.extractStatus(section);
    const category = this.extractCategory(section);
    const reportedDate = this.extractField(section, 'Date Reported:');
    const reportedBy = this.extractField(section, 'Reported By:');

    // Extract behavior descriptions
    const userMessage = this.extractUserMessage(section, title);
    const expectedBehavior = this.extractField(section, 'Expected Behavior:');
    const actualBehavior = this.extractField(section, 'Actual Behavior:');
    const rootCause = this.extractField(section, 'Root Cause:');

    // Extract fix metadata
    const fixCommit = this.extractField(section, 'Commit:');
    const fixDate = this.extractField(section, 'Fixed:');

    if (!userMessage) {
      return null; // Skip if no user message found
    }

    // Determine test type and generate assertions
    const testType = this.determineTestType(category);
    const assertions = this.generateAssertions(expectedBehavior, actualBehavior, category, title);

    return {
      bugNumber,
      title,
      category,
      status,
      reportedDate,
      reportedBy,
      userMessage,
      expectedBehavior: expectedBehavior || '',
      actualBehavior: actualBehavior || '',
      rootCause,
      testType,
      assertions,
      fixCommit,
      fixDate,
    };
  }

  /**
   * Extract user message from bug section or title
   */
  private extractUserMessage(section: string, title?: string): string {
    // Try to extract from title if it contains quoted text
    if (title) {
      const titleQuoteMatch = title.match(/[""](.+?)[""]|"(.+?)"/);
      if (titleQuoteMatch) {
        return (titleQuoteMatch[1] || titleQuoteMatch[2]).trim();
      }
    }

    // Look for: **User Message:**
    // ```
    // message text
    // ```
    const messageMatch = section.match(/\*\*User Message:\*\*[\s\S]*?```[\s\S]*?\n(.+?)\n```/);
    if (messageMatch) {
      const msg = messageMatch[1].trim();
      // Skip if it's a # comment
      if (!msg.startsWith('#')) {
        return msg;
      }
    }

    // Alternative: User: "message"
    const altMatch = section.match(/User:\s*["""'](.+?)["""']/);
    if (altMatch) {
      return altMatch[1].trim();
    }

    // Try to extract from examples
    const exampleMatch = section.match(/User:\s*(.+?)(?:\n|$)/m);
    if (exampleMatch) {
      const msg = exampleMatch[1].trim().replace(/^[""]|[""]$/g, '');
      if (!msg.startsWith('#')) {
        return msg;
      }
    }

    // Extract from Bug Description if it mentions user input
    const descMatch = section.match(/User (?:tried|said|asks?|requested?).*?["""'](.+?)["""']/i);
    if (descMatch) {
      return descMatch[1].trim();
    }

    return '';
  }

  /**
   * Extract field value from section
   */
  private extractField(section: string, fieldName: string): string {
    const pattern = new RegExp(`\\*\\*${fieldName}\\*\\*[:\\s]+(.+?)(?=\\n\\*\\*|\\n\\n|$)`, 's');
    const match = section.match(pattern);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract bug status
   */
  private extractStatus(section: string): BugStatus {
    const statusLine = this.extractField(section, 'Status:');
    if (statusLine.includes('✅') || statusLine.toLowerCase().includes('fixed')) {
      return 'fixed';
    }
    if (statusLine.toLowerCase().includes('invalid')) {
      return 'invalid';
    }
    return 'pending';
  }

  /**
   * Extract and normalize category
   */
  private extractCategory(section: string): BugCategory {
    const categoryLine = this.extractField(section, 'Category:');
    const lower = categoryLine.toLowerCase();

    if (lower.includes('date') || lower.includes('time') || lower.includes('parsing')) return 'date-parsing';
    if (lower.includes('nlp') || lower.includes('intent') || lower.includes('classification')) return 'nlp';
    if (lower.includes('reminder') || lower.includes('תזכורת')) return 'reminder';
    if (lower.includes('event') || lower.includes('אירוע')) return 'event';
    if (lower.includes('search') || lower.includes('list')) return 'search';
    if (lower.includes('delete') || lower.includes('מחק')) return 'delete';
    if (lower.includes('update') || lower.includes('edit')) return 'update';

    return 'other';
  }

  /**
   * Determine test type based on category
   */
  private determineTestType(category: BugCategory): TestType {
    if (category === 'date-parsing') return 'date-parser';
    if (category === 'nlp') return 'nlp';
    return 'end-to-end';
  }

  /**
   * Generate test assertions from expected behavior
   */
  private generateAssertions(
    expectedBehavior: string,
    actualBehavior: string,
    category: BugCategory,
    title: string
  ): Assertion[] {
    const assertions: Assertion[] = [];
    const lower = expectedBehavior.toLowerCase();

    // Date parsing assertions
    if (category === 'date-parsing') {
      // Check for relative dates
      if (lower.includes('yesterday') || expectedBehavior.includes('אתמול') || expectedBehavior.includes('יום לפני')) {
        const hour = this.extractHour(expectedBehavior);
        assertions.push({
          type: 'date',
          expected: { relativeDay: -1, hour: hour || 19 },
          description: 'Should parse to yesterday at specified hour',
        });
      }

      if (lower.includes('tomorrow') || expectedBehavior.includes('מחר')) {
        const hour = this.extractHour(expectedBehavior);
        assertions.push({
          type: 'date',
          expected: { relativeDay: 1, hour: hour || 12 },
          description: 'Should parse to tomorrow at specified hour',
        });
      }

      if (lower.includes('today') || expectedBehavior.includes('היום')) {
        const hour = this.extractHour(expectedBehavior);
        assertions.push({
          type: 'date',
          expected: { relativeDay: 0, hour: hour || 12 },
          description: 'Should parse to today at specified hour',
        });
      }

      // Should not error
      if (!lower.includes('error') && !lower.includes('unrecognized')) {
        assertions.push({
          type: 'no-error',
          expected: true,
          description: 'Should parse successfully without errors',
        });
      }
    }

    // NLP assertions
    if (category === 'nlp' || category === 'reminder' || category === 'event') {
      // Intent detection
      if (lower.includes('create reminder') || title.toLowerCase().includes('reminder')) {
        assertions.push({
          type: 'intent',
          expected: 'create_reminder',
          description: 'Should classify as create_reminder intent',
        });
      }

      if (lower.includes('create event') || title.toLowerCase().includes('event')) {
        assertions.push({
          type: 'intent',
          expected: 'create_event',
          description: 'Should classify as create_event intent',
        });
      }

      // Confidence
      if (lower.includes('confidence') || lower.includes('without confirmation')) {
        assertions.push({
          type: 'confidence',
          expected: { min: 0.7 },
          description: 'Should have high confidence (>= 0.7)',
        });
      }

      // Should not be unknown
      if (actualBehavior.includes('unknown') || actualBehavior.includes('לא הבנתי')) {
        assertions.push({
          type: 'intent',
          expected: { not: 'unknown' },
          description: 'Should NOT classify as unknown intent',
        });
      }
    }

    // If no specific assertions, add general "no error" assertion
    if (assertions.length === 0) {
      assertions.push({
        type: 'no-error',
        expected: true,
        description: 'Should not produce errors',
      });
    }

    return assertions;
  }

  /**
   * Extract hour from text (e.g., "7 PM" -> 19, "19:00" -> 19)
   */
  private extractHour(text: string): number | null {
    // Try HH:mm format
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      return parseInt(timeMatch[1], 10);
    }

    // Try "7 PM" format
    const pmMatch = text.match(/(\d{1,2})\s*PM/i);
    if (pmMatch) {
      const hour = parseInt(pmMatch[1], 10);
      return hour === 12 ? 12 : hour + 12;
    }

    // Try "7 AM" format
    const amMatch = text.match(/(\d{1,2})\s*AM/i);
    if (amMatch) {
      const hour = parseInt(amMatch[1], 10);
      return hour === 12 ? 0 : hour;
    }

    return null;
  }
}
