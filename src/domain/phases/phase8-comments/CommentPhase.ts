/**
 * Phase 8: Comment System for Events
 *
 * Detects when user wants to add a comment to an existing event:
 * - "הוסף הערה לפגישה - להביא מסמכים"
 * - "תזכורת לאירוע - לקנות מתנה"
 * - "הערה: לשאול על מחיר"
 *
 * Comments are stored in events.comments_jsonb as an array
 *
 * Priority: #9
 */

import { BasePhase } from '../../orchestrator/IPhase.js';
import { PhaseContext, PhaseResult } from '../../orchestrator/PhaseContext.js';
import logger from '../../../utils/logger.js';
import { pluginManager } from '../../../plugins/PluginManager.js';

interface Comment {
  id: string;
  text: string;
  createdAt: Date;
  updatedAt?: Date;
}

export class CommentPhase extends BasePhase {
  readonly name = 'comment-detector';
  readonly order = 8;
  readonly description = 'Detect and manage event comments';
  readonly isRequired = false;

  async shouldRun(context: PhaseContext): Promise<boolean> {
    // Run if intent is to add comment, or if message contains comment patterns
    return (
      context.intent === 'add_comment' ||
      this.hasCommentPattern(context.processedText)
    );
  }

  async execute(context: PhaseContext): Promise<PhaseResult> {
    try {
      const commentText = this.extractCommentText(context.processedText);

      if (!commentText || commentText.length < 2) {
        context.addWarning('לא הצלחתי למצוא תוכן להערה');
        return this.success({ commentDetected: false });
      }

      // Store comment in context
      if (!context.entities.comments) {
        context.entities.comments = [];
      }
      context.entities.comments.push(commentText);

      logger.info('Comment detected', {
        commentLength: commentText.length,
        text: commentText.substring(0, 50)
      });

      return this.success({
        commentDetected: true,
        comment: commentText
      });

    } catch (error) {
      logger.error('Comment detection failed', { error });
      return this.success({ commentDetected: false }, ['Failed to process comment']);
    }
  }

  /**
   * Check if text contains comment patterns
   */
  private hasCommentPattern(text: string): boolean {
    const patterns = [
      /הוסף הערה/i,
      /תזכורת:/i,
      /הערה:/i,
      /להביא/i,
      /לשאול/i,
      /לזכור/i,
      /חשוב:/i,
      /שים לב/i,
      /add (a )?comment/i,
      /note:/i,
      /reminder:/i
    ];

    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Extract comment text from message
   */
  private extractCommentText(text: string): string | null {
    // Try to extract after markers
    const markers = [
      'הוסף הערה',
      'תזכורת:',
      'הערה:',
      'חשוב:',
      'שים לב',
      'note:',
      'reminder:',
      'comment:'
    ];

    for (const marker of markers) {
      const regex = new RegExp(marker + '[:\\s-]*(.+)', 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // If no marker found, check for action verbs
    const actionMatch = text.match(/(להביא|לשאול|לזכור|לקנות|לבדוק)\s+(.+)/i);
    if (actionMatch && actionMatch[2]) {
      return actionMatch[0].trim();
    }

    // Last resort: return the whole text if it's short enough
    if (text.length < 200) {
      return text.trim();
    }

    return null;
  }

  /**
   * Add comment to existing event
   */
  async addCommentToEvent(eventId: string, commentText: string, userId: string): Promise<boolean> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        throw new Error('Database plugin not available');
      }

      const comment: Comment = {
        id: this.generateCommentId(),
        text: commentText,
        createdAt: new Date()
      };

      // Append to comments array
      const sql = `UPDATE events
         SET comments_jsonb = COALESCE(comments_jsonb, '[]'::jsonb) || $2::jsonb
         WHERE id = $1 AND user_id = $3`;

      await db.execute(sql, {
        userId,
        messageId: '',
        timestamp: new Date(),
        metadata: { eventId, comment: JSON.stringify([comment]), userId },
        logger
      });

      logger.info('Comment added to event', { eventId, commentId: comment.id });
      return true;

    } catch (error) {
      logger.error('Failed to add comment', { error });
      return false;
    }
  }

  /**
   * Get comments for an event
   */
  async getEventComments(eventId: string): Promise<Comment[]> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        return [];
      }

      const result = await db.execute(
        'SELECT comments_jsonb FROM events WHERE id = $1',
        { userId: '', messageId: '', timestamp: new Date(), metadata: { eventId }, logger }
      );

      if (!result || result.length === 0 || !result[0].comments_jsonb) {
        return [];
      }

      return result[0].comments_jsonb as Comment[];

    } catch (error) {
      logger.error('Failed to get comments', { error });
      return [];
    }
  }

  /**
   * Format comments for display
   */
  formatComments(comments: Comment[]): string {
    if (comments.length === 0) {
      return 'אין הערות';
    }

    let formatted = '📝 הערות:\n\n';

    comments.forEach((comment, index) => {
      const dateStr = comment.createdAt.toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });

      formatted += `${index + 1}. ${comment.text}\n`;
      formatted += `   (${dateStr})\n\n`;
    });

    return formatted;
  }

  /**
   * Generate unique comment ID
   */
  private generateCommentId(): string {
    return `comment_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Delete comment from event
   */
  async deleteComment(eventId: string, commentId: string, userId: string): Promise<boolean> {
    try {
      const db = pluginManager.getPlugin('database');
      if (!db) {
        throw new Error('Database plugin not available');
      }

      // Get current comments
      const comments = await this.getEventComments(eventId);
      const filtered = comments.filter(c => c.id !== commentId);

      // Update with filtered array
      const sql = `UPDATE events
         SET comments_jsonb = $2::jsonb
         WHERE id = $1 AND user_id = $3`;

      await db.execute(sql, {
        userId,
        messageId: '',
        timestamp: new Date(),
        metadata: { eventId, comments: JSON.stringify(filtered), userId },
        logger
      });

      logger.info('Comment deleted', { eventId, commentId });
      return true;

    } catch (error) {
      logger.error('Failed to delete comment', { error });
      return false;
    }
  }
}
