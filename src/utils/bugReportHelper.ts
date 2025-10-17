import { redisMessageLogger } from '../services/RedisMessageLogger.js';
import logger from './logger.js';

/**
 * Bug Report Helper - Utilities for Claude Code to find and fix user-reported bugs
 *
 * Users report bugs by sending messages starting with # in WhatsApp
 * Claude Code uses these utilities to find pending bugs and mark them as fixed
 */

/**
 * Get all pending bug reports (status = 'pending')
 * Claude Code calls this to find bugs to fix
 */
export async function getPendingBugs() {
  try {
    const bugs = await redisMessageLogger.getPendingBugs();

    logger.info('Retrieved pending bugs for Claude Code', { count: bugs.length });

    return bugs.map(bug => ({
      timestamp: bug.timestamp,
      text: bug.messageText,
      userId: bug.userId,
      phone: bug.phone,
      messageId: bug.messageId
    }));
  } catch (error) {
    logger.error('Failed to get pending bugs', { error });
    return [];
  }
}

/**
 * Mark a bug as fixed after Claude Code resolves it
 *
 * @param bugText - The exact text of the bug report (starting with #)
 * @param commitHash - Optional git commit hash where the fix was implemented
 */
export async function markBugAsFixed(bugText: string, commitHash?: string): Promise<boolean> {
  try {
    const success = await redisMessageLogger.markBugFixed(bugText, {
      commitHash,
      fixedBy: 'claude-code'
    });

    if (success) {
      logger.info('Bug marked as fixed by Claude Code', {
        bugText: bugText.substring(0, 50),
        commitHash
      });
    } else {
      logger.warn('Failed to mark bug as fixed - bug not found', { bugText: bugText.substring(0, 50) });
    }

    return success;
  } catch (error) {
    logger.error('Error marking bug as fixed', { bugText: bugText.substring(0, 50), error });
    return false;
  }
}

/**
 * Get bug history (all bugs - pending and fixed)
 * Useful for analytics and tracking
 */
export async function getBugHistory() {
  try {
    const history = await redisMessageLogger.getBugHistory();

    const pending = history.filter(b => b.status === 'pending');
    const fixed = history.filter(b => b.status === 'fixed');

    logger.info('Retrieved bug history', {
      total: history.length,
      pending: pending.length,
      fixed: fixed.length
    });

    return {
      total: history.length,
      pending: pending.map(b => ({
        timestamp: b.timestamp,
        text: b.messageText,
        userId: b.userId
      })),
      fixed: fixed.map(b => ({
        timestamp: b.timestamp,
        text: b.messageText,
        userId: b.userId,
        fixedAt: b.fixedAt,
        commitHash: b.commitHash
      }))
    };
  } catch (error) {
    logger.error('Failed to get bug history', { error });
    return { total: 0, pending: [], fixed: [] };
  }
}

/**
 * Display pending bugs in a formatted way for Claude Code
 */
export async function displayPendingBugs(): Promise<string> {
  const bugs = await getPendingBugs();

  if (bugs.length === 0) {
    return '✅ No pending bugs found! All bug reports have been addressed.';
  }

  let output = `🐛 Found ${bugs.length} pending bug${bugs.length > 1 ? 's' : ''}:\n\n`;

  bugs.forEach((bug, index) => {
    const date = new Date(bug.timestamp).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short'
    });
    output += `${index + 1}. [${date}] ${bug.text}\n`;
    output += `   User: ${bug.phone}\n\n`;
  });

  return output;
}

/**
 * Claude Code workflow helper
 * Call this after fixing bugs to update their status
 */
export async function fixBugsWorkflow(bugTexts: string[], commitHash?: string): Promise<{
  success: number;
  failed: number;
  details: Array<{ bugText: string; success: boolean }>
}> {
  const results = {
    success: 0,
    failed: 0,
    details: [] as Array<{ bugText: string; success: boolean }>
  };

  for (const bugText of bugTexts) {
    const success = await markBugAsFixed(bugText, commitHash);

    if (success) {
      results.success++;
    } else {
      results.failed++;
    }

    results.details.push({ bugText, success });
  }

  logger.info('Fix bugs workflow completed', {
    total: bugTexts.length,
    success: results.success,
    failed: results.failed,
    commitHash
  });

  return results;
}

// Export default object for easier imports
export default {
  getPendingBugs,
  markBugAsFixed,
  getBugHistory,
  displayPendingBugs,
  fixBugsWorkflow
};
