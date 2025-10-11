import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  dueTsUtc: Date;
  rrule: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  eventId: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface CreateReminderInput {
  userId: string;
  title: string;
  dueTsUtc: Date;
  rrule?: string;
  eventId?: string;
  notes?: string;
}

export interface UpdateReminderInput {
  title?: string;
  dueTsUtc?: Date;
  rrule?: string;
  status?: 'pending' | 'completed' | 'cancelled';
  notes?: string;
}

export class ReminderService {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Create a new reminder
   */
  async createReminder(input: CreateReminderInput): Promise<Reminder> {
    try {
      const query = `
        INSERT INTO reminders (user_id, title, due_ts_utc, rrule, status, event_id, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        input.userId,
        input.title,
        input.dueTsUtc,
        input.rrule || null,
        'pending',
        input.eventId || null,
        input.notes || null,
      ];

      const result = await this.dbPool.query(query, values);
      const reminder = this.mapRowToReminder(result.rows[0]);

      logger.info('Reminder created', { reminderId: reminder.id, userId: input.userId });

      // TODO: Schedule reminder with BullMQ
      // await reminderQueue.add('send-reminder', {
      //   reminderId: reminder.id,
      //   userId: reminder.userId,
      // }, { delay: reminder.dueTsUtc.getTime() - Date.now() });

      return reminder;
    } catch (error) {
      logger.error('Failed to create reminder', { input, error });
      throw error;
    }
  }

  /**
   * Get reminder by ID
   */
  async getReminderById(reminderId: string, userId: string): Promise<Reminder | null> {
    try {
      const query = `
        SELECT * FROM reminders
        WHERE id = $1 AND user_id = $2
      `;

      const result = await this.dbPool.query(query, [reminderId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToReminder(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get reminder', { reminderId, userId, error });
      throw error;
    }
  }

  /**
   * Get active reminders for user
   */
  async getActiveReminders(userId: string, limit: number = 20): Promise<Reminder[]> {
    try {
      const query = `
        SELECT * FROM reminders
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY due_ts_utc ASC
        LIMIT $2
      `;

      const result = await this.dbPool.query(query, [userId, limit]);
      return result.rows.map(row => this.mapRowToReminder(row));
    } catch (error) {
      logger.error('Failed to get active reminders', { userId, error });
      throw error;
    }
  }

  /**
   * Get overdue reminders for user
   */
  async getOverdueReminders(userId: string): Promise<Reminder[]> {
    try {
      const now = new Date();

      const query = `
        SELECT * FROM reminders
        WHERE user_id = $1
          AND status = 'pending'
          AND due_ts_utc < $2
        ORDER BY due_ts_utc ASC
      `;

      const result = await this.dbPool.query(query, [userId, now]);
      return result.rows.map(row => this.mapRowToReminder(row));
    } catch (error) {
      logger.error('Failed to get overdue reminders', { userId, error });
      throw error;
    }
  }

  /**
   * Get reminders for today
   */
  async getRemindersForToday(userId: string): Promise<Reminder[]> {
    try {
      const dt = DateTime.now().setZone('Asia/Jerusalem');
      const startOfDay = dt.startOf('day').toUTC().toJSDate();
      const endOfDay = dt.endOf('day').toUTC().toJSDate();

      const query = `
        SELECT * FROM reminders
        WHERE user_id = $1
          AND status = 'pending'
          AND due_ts_utc >= $2
          AND due_ts_utc < $3
        ORDER BY due_ts_utc ASC
      `;

      const result = await this.dbPool.query(query, [userId, startOfDay, endOfDay]);
      return result.rows.map(row => this.mapRowToReminder(row));
    } catch (error) {
      logger.error('Failed to get reminders for today', { userId, error });
      throw error;
    }
  }

  /**
   * Update a reminder
   */
  async updateReminder(
    reminderId: string,
    userId: string,
    update: UpdateReminderInput
  ): Promise<Reminder | null> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (update.title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        values.push(update.title);
      }
      if (update.dueTsUtc !== undefined) {
        updateFields.push(`due_ts_utc = $${paramIndex++}`);
        values.push(update.dueTsUtc);
      }
      if (update.rrule !== undefined) {
        updateFields.push(`rrule = $${paramIndex++}`);
        values.push(update.rrule);
      }
      if (update.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        values.push(update.status);
      }
      if (update.notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        values.push(update.notes);
      }

      if (updateFields.length === 0) {
        return await this.getReminderById(reminderId, userId);
      }

      values.push(reminderId, userId);

      const query = `
        UPDATE reminders
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.dbPool.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      logger.info('Reminder updated', { reminderId, userId });
      return this.mapRowToReminder(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update reminder', { reminderId, userId, update, error });
      throw error;
    }
  }

  /**
   * Mark reminder as completed
   */
  async completeReminder(reminderId: string, userId: string): Promise<Reminder | null> {
    return await this.updateReminder(reminderId, userId, { status: 'completed' });
  }

  /**
   * Cancel a reminder
   */
  async cancelReminder(reminderId: string, userId: string): Promise<Reminder | null> {
    return await this.updateReminder(reminderId, userId, { status: 'cancelled' });
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(reminderId: string, userId: string): Promise<boolean> {
    try {
      const query = `
        DELETE FROM reminders
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await this.dbPool.query(query, [reminderId, userId]);

      if (result.rows.length === 0) {
        return false;
      }

      logger.info('Reminder deleted', { reminderId, userId });
      return true;
    } catch (error) {
      logger.error('Failed to delete reminder', { reminderId, userId, error });
      throw error;
    }
  }

  /**
   * Get all reminders for user (with pagination)
   */
  async getAllReminders(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Reminder[]> {
    try {
      const query = `
        SELECT * FROM reminders
        WHERE user_id = $1
        ORDER BY due_ts_utc DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.dbPool.query(query, [userId, limit, offset]);
      return result.rows.map(row => this.mapRowToReminder(row));
    } catch (error) {
      logger.error('Failed to get all reminders', { userId, error });
      throw error;
    }
  }

  /**
   * Map database row to Reminder object
   */
  private mapRowToReminder(row: any): Reminder {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      dueTsUtc: row.due_ts_utc,
      rrule: row.rrule,
      status: row.status,
      eventId: row.event_id,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }
}

// Export singleton instance
export const reminderService = new ReminderService();
export default reminderService;
