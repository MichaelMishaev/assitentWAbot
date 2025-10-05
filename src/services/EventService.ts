import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';
import { v4 as uuidv4 } from 'uuid';
import { EventComment } from '../types/index.js';

export interface Event {
  id: string;
  userId: string;
  title: string;
  startTsUtc: Date;
  endTsUtc: Date | null;
  rrule: string | null;
  location: string | null;
  notes: EventComment[]; // Changed from string to EventComment array
  source: string;
  confidence: number;
  createdAt: Date;
}

export interface CreateEventInput {
  userId: string;
  title: string;
  startTsUtc: Date;
  endTsUtc?: Date;
  rrule?: string;
  location?: string;
  notes?: EventComment[]; // Changed from string to EventComment array
}

export interface UpdateEventInput {
  title?: string;
  startTsUtc?: Date;
  endTsUtc?: Date;
  rrule?: string;
  location?: string;
  notes?: EventComment[]; // Changed from string to EventComment array
}

export class EventService {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Create a new event
   */
  async createEvent(input: CreateEventInput): Promise<Event> {
    try {
      // Validate required fields
      if (!input.userId || input.userId.trim() === '') {
        throw new Error('User ID is required');
      }
      if (!input.title || input.title.trim() === '') {
        throw new Error('Event title is required');
      }

      // IMPORTANT: Check for overlapping events (warning only, not blocking)
      const overlapping = await this.checkOverlappingEvents(input.userId, input.startTsUtc, input.endTsUtc);
      if (overlapping.length > 0) {
        logger.warn('Creating event with time conflict', {
          newEvent: { title: input.title, startTsUtc: input.startTsUtc },
          overlapping: overlapping.map(e => ({ id: e.id, title: e.title, startTsUtc: e.startTsUtc }))
        });
      }

      const query = `
        INSERT INTO events (user_id, title, start_ts_utc, end_ts_utc, rrule, location, notes, source, confidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        input.userId,
        input.title,
        input.startTsUtc,
        input.endTsUtc || null,
        input.rrule || null,
        input.location || null,
        JSON.stringify(input.notes || []), // Convert EventComment[] to JSONB
        'user_input',
        1.0,
      ];

      const result = await this.dbPool.query(query, values);
      const event = this.mapRowToEvent(result.rows[0]);

      logger.info('Event created', {
        eventId: event.id,
        userId: input.userId,
        hasOverlap: overlapping.length > 0,
        overlapCount: overlapping.length
      });

      // Return event with overlap metadata
      (event as any).hasTimeConflict = overlapping.length > 0;
      (event as any).conflictingEvents = overlapping;

      return event;
    } catch (error) {
      logger.error('Failed to create event', { input, error });
      throw error;
    }
  }

  /**
   * Get event by ID
   */
  async getEventById(eventId: string, userId: string): Promise<Event | null> {
    try {
      const query = `
        SELECT * FROM events
        WHERE id = $1 AND user_id = $2
      `;

      const result = await this.dbPool.query(query, [eventId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEvent(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get event', { eventId, userId, error });
      throw error;
    }
  }

  /**
   * Get upcoming events for user
   */
  async getUpcomingEvents(
    userId: string,
    limit: number = 10,
    startFrom?: Date
  ): Promise<Event[]> {
    try {
      const startDate = startFrom || new Date();

      const query = `
        SELECT * FROM events
        WHERE user_id = $1 AND start_ts_utc >= $2
        ORDER BY start_ts_utc ASC
        LIMIT $3
      `;

      const result = await this.dbPool.query(query, [userId, startDate, limit]);
      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to get upcoming events', { userId, error });
      throw error;
    }
  }

  /**
   * Get events for a specific date
   */
  async getEventsByDate(userId: string, date: Date): Promise<Event[]> {
    try {
      // Get start and end of day in user's timezone
      const dt = DateTime.fromJSDate(date).setZone('Asia/Jerusalem');
      const startOfDay = dt.startOf('day').toUTC().toJSDate();
      const endOfDay = dt.endOf('day').toUTC().toJSDate();

      const query = `
        SELECT * FROM events
        WHERE user_id = $1
          AND start_ts_utc >= $2
          AND start_ts_utc < $3
        ORDER BY start_ts_utc ASC
      `;

      const result = await this.dbPool.query(query, [userId, startOfDay, endOfDay]);
      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to get events by date', { userId, date, error });
      throw error;
    }
  }

  /**
   * Get events for a specific week
   */
  async getEventsForWeek(userId: string, weekStart?: Date): Promise<Event[]> {
    try {
      const startDate = weekStart || new Date();
      const dt = DateTime.fromJSDate(startDate).setZone('Asia/Jerusalem');

      // Get start of week (Sunday) and end of week (Saturday)
      const startOfWeek = dt.startOf('week').toUTC().toJSDate();
      const endOfWeek = dt.endOf('week').toUTC().toJSDate();

      const query = `
        SELECT * FROM events
        WHERE user_id = $1
          AND start_ts_utc >= $2
          AND start_ts_utc < $3
        ORDER BY start_ts_utc ASC
      `;

      const result = await this.dbPool.query(query, [userId, startOfWeek, endOfWeek]);
      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to get events for week', { userId, error });
      throw error;
    }
  }

  /**
   * Update an event
   */
  async updateEvent(
    eventId: string,
    userId: string,
    update: UpdateEventInput
  ): Promise<Event | null> {
    try {
      // Check if event exists and belongs to user
      const existingEvent = await this.getEventById(eventId, userId);
      if (!existingEvent) {
        throw new Error('Event not found or unauthorized');
      }

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (update.title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        values.push(update.title);
      }
      if (update.startTsUtc !== undefined) {
        updateFields.push(`start_ts_utc = $${paramIndex++}`);
        values.push(update.startTsUtc);
      }
      if (update.endTsUtc !== undefined) {
        updateFields.push(`end_ts_utc = $${paramIndex++}`);
        values.push(update.endTsUtc);
      }
      if (update.rrule !== undefined) {
        updateFields.push(`rrule = $${paramIndex++}`);
        values.push(update.rrule);
      }
      if (update.location !== undefined) {
        updateFields.push(`location = $${paramIndex++}`);
        values.push(update.location);
      }
      if (update.notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        values.push(JSON.stringify(update.notes)); // Convert EventComment[] to JSONB
      }

      if (updateFields.length === 0) {
        return existingEvent;
      }

      values.push(eventId, userId);

      const query = `
        UPDATE events
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.dbPool.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Event not found or unauthorized');
      }

      logger.info('Event updated', { eventId, userId });
      return this.mapRowToEvent(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update event', { eventId, userId, update, error });
      throw error;
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string, userId: string): Promise<boolean> {
    try {
      // Check if event exists and belongs to user
      const existingEvent = await this.getEventById(eventId, userId);
      if (!existingEvent) {
        throw new Error('Event not found or unauthorized');
      }

      const query = `
        DELETE FROM events
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await this.dbPool.query(query, [eventId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Event not found or unauthorized');
      }

      logger.info('Event deleted', { eventId, userId });
      return true;
    } catch (error) {
      logger.error('Failed to delete event', { eventId, userId, error });
      throw error;
    }
  }

  /**
   * Get all events for user (with pagination)
   */
  async getAllEvents(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    orderByRecent: boolean = false
  ): Promise<Event[]> {
    try {
      const orderBy = orderByRecent ? 'DESC' : 'ASC';
      const query = `
        SELECT * FROM events
        WHERE user_id = $1
        ORDER BY start_ts_utc ${orderBy}
        LIMIT $2 OFFSET $3
      `;

      const result = await this.dbPool.query(query, [userId, limit, offset]);
      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to get all events', { userId, error });
      throw error;
    }
  }

  /**
   * Search events by title or location
   */
  async searchEvents(userId: string, searchTerm: string): Promise<Event[]> {
    try {
      const query = `
        SELECT * FROM events
        WHERE user_id = $1 AND (title ILIKE $2 OR location ILIKE $2)
        ORDER BY start_ts_utc ASC
        LIMIT 20
      `;

      const result = await this.dbPool.query(query, [userId, `%${searchTerm}%`]);
      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to search events', { userId, searchTerm, error });
      throw error;
    }
  }

  /**
   * Check for overlapping events at the same time
   * Used to warn user about scheduling conflicts
   */
  async checkOverlappingEvents(userId: string, startTime: Date, endTime?: Date | null): Promise<Event[]> {
    try {
      // Use end time if provided, otherwise assume 1-hour duration
      const effectiveEndTime = endTime || new Date(startTime.getTime() + 60 * 60 * 1000);

      const query = `
        SELECT * FROM events
        WHERE user_id = $1
          AND (
            -- New event starts during existing event
            (start_ts_utc <= $2 AND COALESCE(end_ts_utc, start_ts_utc + interval '1 hour') > $2)
            OR
            -- New event ends during existing event
            (start_ts_utc < $3 AND COALESCE(end_ts_utc, start_ts_utc + interval '1 hour') >= $3)
            OR
            -- New event completely contains existing event
            ($2 <= start_ts_utc AND $3 >= COALESCE(end_ts_utc, start_ts_utc + interval '1 hour'))
          )
        ORDER BY start_ts_utc ASC
      `;

      const result = await this.dbPool.query(query, [userId, startTime, effectiveEndTime]);
      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to check overlapping events', { userId, startTime, endTime, error });
      return []; // Return empty array on error, don't block event creation
    }
  }

  /**
   * Map database row to Event object
   */
  private mapRowToEvent(row: any): Event {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      startTsUtc: row.start_ts_utc,
      endTsUtc: row.end_ts_utc,
      rrule: row.rrule,
      location: row.location,
      notes: Array.isArray(row.notes) ? row.notes : [], // Parse JSONB array
      source: row.source,
      confidence: parseFloat(row.confidence),
      createdAt: row.created_at,
    };
  }

  // ============================================================================
  // COMMENT MANAGEMENT METHODS
  // ============================================================================

  /**
   * Add a comment to an event
   */
  async addComment(
    eventId: string,
    userId: string,
    text: string,
    options?: {
      priority?: 'normal' | 'high' | 'urgent';
      tags?: string[];
      reminderId?: string;
    }
  ): Promise<EventComment> {
    try {
      const comment: EventComment = {
        id: uuidv4(),
        text,
        timestamp: new Date().toISOString(),
        priority: options?.priority || 'normal',
        tags: options?.tags || [],
        reminderId: options?.reminderId,
      };

      const query = `
        UPDATE events
        SET notes = COALESCE(notes, '[]'::jsonb) || $1::jsonb
        WHERE id = $2 AND user_id = $3
        RETURNING notes
      `;

      const result = await this.dbPool.query(query, [
        JSON.stringify(comment),
        eventId,
        userId,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Event not found or unauthorized');
      }

      logger.info('Comment added to event', { eventId, userId, commentId: comment.id });
      return comment;
    } catch (error) {
      logger.error('Failed to add comment', { eventId, userId, error });
      throw error;
    }
  }

  /**
   * Get all comments for an event
   */
  async getComments(eventId: string, userId: string): Promise<EventComment[]> {
    try {
      const query = `
        SELECT notes FROM events
        WHERE id = $1 AND user_id = $2
      `;

      const result = await this.dbPool.query(query, [eventId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Event not found');
      }

      const notes = result.rows[0]?.notes;
      return Array.isArray(notes) ? notes : [];
    } catch (error) {
      logger.error('Failed to get comments', { eventId, userId, error });
      throw error;
    }
  }

  /**
   * Delete a comment by ID
   */
  async deleteComment(
    eventId: string,
    userId: string,
    commentId: string
  ): Promise<EventComment | null> {
    try {
      // First get the comment to return it
      const comments = await this.getComments(eventId, userId);
      const deletedComment = comments.find(c => c.id === commentId);

      if (!deletedComment) {
        logger.warn('Comment not found', { eventId, userId, commentId });
        return null;
      }

      const query = `
        UPDATE events
        SET notes = (
          SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
          FROM jsonb_array_elements(notes) elem
          WHERE elem->>'id' != $1
        )
        WHERE id = $2 AND user_id = $3
        RETURNING notes
      `;

      await this.dbPool.query(query, [commentId, eventId, userId]);

      logger.info('Comment deleted', { eventId, userId, commentId });
      return deletedComment;
    } catch (error) {
      logger.error('Failed to delete comment', { eventId, userId, commentId, error });
      throw error;
    }
  }

  /**
   * Delete a comment by index (1-based for user-friendliness)
   */
  async deleteCommentByIndex(
    eventId: string,
    userId: string,
    index: number
  ): Promise<EventComment | null> {
    try {
      const comments = await this.getComments(eventId, userId);
      const arrayIndex = index - 1; // Convert to 0-based

      if (arrayIndex < 0 || arrayIndex >= comments.length) {
        logger.warn('Comment index out of range', { eventId, userId, index, total: comments.length });
        return null;
      }

      const comment = comments[arrayIndex];
      return await this.deleteComment(eventId, userId, comment.id);
    } catch (error) {
      logger.error('Failed to delete comment by index', { eventId, userId, index, error });
      throw error;
    }
  }

  /**
   * Delete the last comment from an event
   */
  async deleteLastComment(
    eventId: string,
    userId: string
  ): Promise<EventComment | null> {
    try {
      const comments = await this.getComments(eventId, userId);

      if (comments.length === 0) {
        logger.warn('No comments to delete', { eventId, userId });
        return null;
      }

      const lastComment = comments[comments.length - 1];
      return await this.deleteComment(eventId, userId, lastComment.id);
    } catch (error) {
      logger.error('Failed to delete last comment', { eventId, userId, error });
      throw error;
    }
  }

  /**
   * Update a comment (e.g., add reminderId after creating reminder)
   */
  async updateComment(
    eventId: string,
    userId: string,
    commentId: string,
    updates: Partial<Omit<EventComment, 'id'>>
  ): Promise<EventComment | null> {
    try {
      const comments = await this.getComments(eventId, userId);
      const commentIndex = comments.findIndex(c => c.id === commentId);

      if (commentIndex === -1) {
        logger.warn('Comment not found for update', { eventId, userId, commentId });
        return null;
      }

      // Merge updates
      const updatedComment = { ...comments[commentIndex], ...updates };

      const query = `
        UPDATE events
        SET notes = (
          SELECT jsonb_agg(
            CASE
              WHEN elem->>'id' = $1
              THEN $2::jsonb
              ELSE elem
            END
          )
          FROM jsonb_array_elements(notes) elem
        )
        WHERE id = $3 AND user_id = $4
        RETURNING notes
      `;

      await this.dbPool.query(query, [
        commentId,
        JSON.stringify(updatedComment),
        eventId,
        userId,
      ]);

      logger.info('Comment updated', { eventId, userId, commentId });
      return updatedComment;
    } catch (error) {
      logger.error('Failed to update comment', { eventId, userId, commentId, error });
      throw error;
    }
  }

  /**
   * Find a comment by text search (partial match)
   */
  async findCommentByText(
    eventId: string,
    userId: string,
    searchText: string
  ): Promise<EventComment | null> {
    try {
      const comments = await this.getComments(eventId, userId);

      // Find first comment that contains the search text
      const found = comments.find(c =>
        c.text.includes(searchText) || searchText.includes(c.text)
      );

      return found || null;
    } catch (error) {
      logger.error('Failed to find comment by text', { eventId, userId, searchText, error });
      throw error;
    }
  }

  /**
   * Get comment count for an event
   */
  async getCommentCount(eventId: string, userId: string): Promise<number> {
    try {
      const comments = await this.getComments(eventId, userId);
      return comments.length;
    } catch (error) {
      logger.error('Failed to get comment count', { eventId, userId, error });
      throw error;
    }
  }
}

// Export singleton instance
export const eventService = new EventService();
export default eventService;
