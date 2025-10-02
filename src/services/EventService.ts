import { Pool } from 'pg';
import { pool } from '../config/database';
import logger from '../utils/logger';
import { DateTime } from 'luxon';

export interface Event {
  id: string;
  userId: string;
  title: string;
  startTsUtc: Date;
  endTsUtc: Date | null;
  rrule: string | null;
  location: string | null;
  notes: string | null;
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
  notes?: string;
}

export interface UpdateEventInput {
  title?: string;
  startTsUtc?: Date;
  endTsUtc?: Date;
  rrule?: string;
  location?: string;
  notes?: string;
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
        input.notes || null,
        'user_input',
        1.0,
      ];

      const result = await this.dbPool.query(query, values);
      const event = this.mapRowToEvent(result.rows[0]);

      logger.info('Event created', { eventId: event.id, userId: input.userId });
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
        values.push(update.notes);
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
    offset: number = 0
  ): Promise<Event[]> {
    try {
      const query = `
        SELECT * FROM events
        WHERE user_id = $1
        ORDER BY start_ts_utc ASC
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
      notes: row.notes,
      source: row.source,
      confidence: parseFloat(row.confidence),
      createdAt: row.created_at,
    };
  }
}

// Export singleton instance
export const eventService = new EventService();
export default eventService;
