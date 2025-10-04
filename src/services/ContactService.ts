import { Pool } from 'pg';
import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

export interface Contact {
  id: string;
  userId: string;
  name: string;
  relation: string | null;
  aliases: string[];
  createdAt: Date;
}

export interface CreateContactInput {
  userId: string;
  name: string;
  relation?: string;
  aliases?: string[];
}

export interface UpdateContactInput {
  name?: string;
  relation?: string;
  aliases?: string[];
}

export class ContactService {
  constructor(private dbPool: Pool = pool) {}

  /**
   * Create a new contact
   */
  async createContact(input: CreateContactInput): Promise<Contact> {
    try {
      const query = `
        INSERT INTO contacts (user_id, name, relation, aliases)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const values = [
        input.userId,
        input.name,
        input.relation || null,
        JSON.stringify(input.aliases || []),
      ];

      const result = await this.dbPool.query(query, values);
      const contact = this.mapRowToContact(result.rows[0]);

      logger.info('Contact created', { contactId: contact.id, userId: input.userId });
      return contact;
    } catch (error) {
      logger.error('Failed to create contact', { input, error });
      throw error;
    }
  }

  /**
   * Get contact by ID
   */
  async getContactById(contactId: string, userId: string): Promise<Contact | null> {
    try {
      const query = `
        SELECT * FROM contacts
        WHERE id = $1 AND user_id = $2
      `;

      const result = await this.dbPool.query(query, [contactId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToContact(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get contact', { contactId, userId, error });
      throw error;
    }
  }

  /**
   * Get all contacts for user
   */
  async getAllContacts(userId: string): Promise<Contact[]> {
    try {
      const query = `
        SELECT * FROM contacts
        WHERE user_id = $1
        ORDER BY name ASC
      `;

      const result = await this.dbPool.query(query, [userId]);
      return result.rows.map(row => this.mapRowToContact(row));
    } catch (error) {
      logger.error('Failed to get all contacts', { userId, error });
      throw error;
    }
  }

  /**
   * Search contacts by name or alias
   */
  async searchContacts(userId: string, searchTerm: string): Promise<Contact[]> {
    try {
      const query = `
        SELECT * FROM contacts
        WHERE user_id = $1
          AND (
            name ILIKE $2
            OR aliases::text ILIKE $2
          )
        ORDER BY name ASC
        LIMIT 10
      `;

      const result = await this.dbPool.query(query, [userId, `%${searchTerm}%`]);
      return result.rows.map(row => this.mapRowToContact(row));
    } catch (error) {
      logger.error('Failed to search contacts', { userId, searchTerm, error });
      throw error;
    }
  }

  /**
   * Update a contact
   */
  async updateContact(
    contactId: string,
    userId: string,
    update: UpdateContactInput
  ): Promise<Contact | null> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (update.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(update.name);
      }
      if (update.relation !== undefined) {
        updateFields.push(`relation = $${paramIndex++}`);
        values.push(update.relation);
      }
      if (update.aliases !== undefined) {
        updateFields.push(`aliases = $${paramIndex++}`);
        values.push(JSON.stringify(update.aliases));
      }

      if (updateFields.length === 0) {
        return await this.getContactById(contactId, userId);
      }

      values.push(contactId, userId);

      const query = `
        UPDATE contacts
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.dbPool.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      logger.info('Contact updated', { contactId, userId });
      return this.mapRowToContact(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update contact', { contactId, userId, update, error });
      throw error;
    }
  }

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string, userId: string): Promise<boolean> {
    try {
      const query = `
        DELETE FROM contacts
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await this.dbPool.query(query, [contactId, userId]);

      if (result.rows.length === 0) {
        return false;
      }

      logger.info('Contact deleted', { contactId, userId });
      return true;
    } catch (error) {
      logger.error('Failed to delete contact', { contactId, userId, error });
      throw error;
    }
  }

  /**
   * Map database row to Contact object
   */
  private mapRowToContact(row: any): Contact {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      relation: row.relation,
      aliases: typeof row.aliases === 'string' ? JSON.parse(row.aliases) : row.aliases || [],
      createdAt: row.created_at,
    };
  }
}

// Export singleton instance
export const contactService = new ContactService();
export default contactService;
