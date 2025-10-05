import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';
import { v4 as uuidv4 } from 'uuid';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueTsUtc: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  userId: string;
  title: string;
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueTsUtc?: Date;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueTsUtc?: Date;
}

export class TaskService {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    try {
      // Validate required fields
      if (!input.userId || input.userId.trim() === '') {
        throw new Error('User ID is required');
      }
      if (!input.title || input.title.trim() === '') {
        throw new Error('Task title is required');
      }

      const query = `
        INSERT INTO tasks (user_id, title, description, status, priority, due_ts_utc)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        input.userId,
        input.title,
        input.description || null,
        'pending',
        input.priority || 'normal',
        input.dueTsUtc || null,
      ];

      const result = await this.dbPool.query(query, values);
      const task = this.mapRowToTask(result.rows[0]);

      logger.info('Task created', { taskId: task.id, userId: input.userId });

      return task;
    } catch (error) {
      logger.error('Failed to create task', { input, error });
      throw error;
    }
  }

  /**
   * Get task by ID
   */
  async getTaskById(taskId: string, userId: string): Promise<Task | null> {
    try {
      const query = `
        SELECT * FROM tasks
        WHERE id = $1 AND user_id = $2
      `;

      const result = await this.dbPool.query(query, [taskId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToTask(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get task', { taskId, userId, error });
      throw error;
    }
  }

  /**
   * Get all tasks for user
   */
  async getAllTasks(userId: string, includeCompleted: boolean = false): Promise<Task[]> {
    try {
      let query = `
        SELECT * FROM tasks
        WHERE user_id = $1
      `;

      if (!includeCompleted) {
        query += ` AND status != 'completed' AND status != 'cancelled'`;
      }

      query += ` ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        CASE WHEN due_ts_utc IS NULL THEN 1 ELSE 0 END,
        due_ts_utc ASC,
        created_at DESC
      `;

      const result = await this.dbPool.query(query, [userId]);

      return result.rows.map(row => this.mapRowToTask(row));
    } catch (error) {
      logger.error('Failed to get all tasks', { userId, error });
      throw error;
    }
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(
    userId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<Task[]> {
    try {
      const query = `
        SELECT * FROM tasks
        WHERE user_id = $1 AND status = $2
        ORDER BY
          CASE priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          CASE WHEN due_ts_utc IS NULL THEN 1 ELSE 0 END,
          due_ts_utc ASC,
          created_at DESC
      `;

      const result = await this.dbPool.query(query, [userId, status]);

      return result.rows.map(row => this.mapRowToTask(row));
    } catch (error) {
      logger.error('Failed to get tasks by status', { userId, status, error });
      throw error;
    }
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(userId: string): Promise<Task[]> {
    try {
      const query = `
        SELECT * FROM tasks
        WHERE user_id = $1
        AND status IN ('pending', 'in_progress')
        AND due_ts_utc < NOW()
        ORDER BY due_ts_utc ASC
      `;

      const result = await this.dbPool.query(query, [userId]);

      return result.rows.map(row => this.mapRowToTask(row));
    } catch (error) {
      logger.error('Failed to get overdue tasks', { userId, error });
      throw error;
    }
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, userId: string, updates: UpdateTaskInput): Promise<Task> {
    try {
      const task = await this.getTaskById(taskId, userId);
      if (!task) {
        throw new Error('Task not found');
      }

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.title !== undefined) {
        setClauses.push(`title = $${paramCount++}`);
        values.push(updates.title);
      }

      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramCount++}`);
        values.push(updates.description);
      }

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramCount++}`);
        values.push(updates.status);

        // If marking as completed, set completed_at
        if (updates.status === 'completed') {
          setClauses.push(`completed_at = $${paramCount++}`);
          values.push(new Date());
        }
      }

      if (updates.priority !== undefined) {
        setClauses.push(`priority = $${paramCount++}`);
        values.push(updates.priority);
      }

      if (updates.dueTsUtc !== undefined) {
        setClauses.push(`due_ts_utc = $${paramCount++}`);
        values.push(updates.dueTsUtc);
      }

      if (setClauses.length === 0) {
        return task; // No updates
      }

      values.push(taskId);
      values.push(userId);

      const query = `
        UPDATE tasks
        SET ${setClauses.join(', ')}
        WHERE id = $${paramCount++} AND user_id = $${paramCount++}
        RETURNING *
      `;

      const result = await this.dbPool.query(query, values);
      const updatedTask = this.mapRowToTask(result.rows[0]);

      logger.info('Task updated', { taskId, userId, updates });

      return updatedTask;
    } catch (error) {
      logger.error('Failed to update task', { taskId, userId, updates, error });
      throw error;
    }
  }

  /**
   * Mark task as completed
   */
  async markTaskAsCompleted(taskId: string, userId: string): Promise<Task> {
    return this.updateTask(taskId, userId, { status: 'completed' });
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string, userId: string): Promise<boolean> {
    try {
      const query = `
        DELETE FROM tasks
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await this.dbPool.query(query, [taskId, userId]);

      if (result.rows.length === 0) {
        return false;
      }

      logger.info('Task deleted', { taskId, userId });

      return true;
    } catch (error) {
      logger.error('Failed to delete task', { taskId, userId, error });
      throw error;
    }
  }

  /**
   * Search tasks by title or description
   */
  async searchTasks(userId: string, searchQuery: string): Promise<Task[]> {
    try {
      const query = `
        SELECT * FROM tasks
        WHERE user_id = $1
        AND (
          title ILIKE $2
          OR description ILIKE $2
        )
        AND status != 'completed'
        AND status != 'cancelled'
        ORDER BY
          CASE priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          created_at DESC
      `;

      const result = await this.dbPool.query(query, [userId, `%${searchQuery}%`]);

      return result.rows.map(row => this.mapRowToTask(row));
    } catch (error) {
      logger.error('Failed to search tasks', { userId, searchQuery, error });
      throw error;
    }
  }

  /**
   * Get task statistics
   */
  async getTaskStats(userId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  }> {
    try {
      const query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE
            WHEN status IN ('pending', 'in_progress')
            AND due_ts_utc < NOW()
            THEN 1 ELSE 0
          END) as overdue
        FROM tasks
        WHERE user_id = $1
      `;

      const result = await this.dbPool.query(query, [userId]);
      const row = result.rows[0];

      return {
        total: parseInt(row.total) || 0,
        pending: parseInt(row.pending) || 0,
        inProgress: parseInt(row.in_progress) || 0,
        completed: parseInt(row.completed) || 0,
        overdue: parseInt(row.overdue) || 0,
      };
    } catch (error) {
      logger.error('Failed to get task stats', { userId, error });
      throw error;
    }
  }

  /**
   * Map database row to Task object
   */
  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueTsUtc: row.due_ts_utc ? new Date(row.due_ts_utc) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
