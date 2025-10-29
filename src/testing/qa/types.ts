/**
 * QA Testing Types
 * Types for automated bug testing and validation
 */

export type BugCategory = 'date-parsing' | 'nlp' | 'reminder' | 'event' | 'search' | 'delete' | 'update' | 'other';
export type BugStatus = 'pending' | 'fixed' | 'invalid';
export type TestType = 'nlp' | 'date-parser' | 'end-to-end';
export type AssertionType = 'intent' | 'entity' | 'response' | 'date' | 'confidence' | 'no-error';

export interface BugTestCase {
  bugNumber: string;
  title: string;
  category: BugCategory;
  status: BugStatus;
  reportedDate?: string;
  reportedBy?: string;

  // Extracted from bugs.md
  userMessage: string;
  expectedBehavior: string;
  actualBehavior: string;
  rootCause?: string;

  // Test configuration
  testType: TestType;
  assertions: Assertion[];

  // Optional metadata
  fixCommit?: string;
  fixDate?: string;
}

export interface Assertion {
  type: AssertionType;
  expected: any;
  description: string;
  customValidator?: (result: any) => boolean;
}

export interface TestResult {
  passed: boolean;
  bugNumber: string;
  bugTitle?: string;
  testType?: TestType;
  expected?: string;
  actual?: string;
  assertion?: string;
  error?: string;
  executionTime?: number;
}

export interface QAReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  successRate: number;
  results: TestResult[];
  summary: {
    byCategory: Record<BugCategory, { passed: number; failed: number }>;
    byStatus: Record<BugStatus, { passed: number; failed: number }>;
  };
}
