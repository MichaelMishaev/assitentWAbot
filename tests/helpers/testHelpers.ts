import { Pool } from 'pg';
import Redis from 'ioredis';
import bcrypt from 'bcrypt';

export class TestDatabase {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '7432'),
      database: process.env.POSTGRES_DB || 'whatsapp_assistant_test',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
    });
  }

  async clean(): Promise<void> {
    await this.pool.query('DELETE FROM reminders');
    await this.pool.query('DELETE FROM events');
    await this.pool.query('DELETE FROM contacts');
    await this.pool.query('DELETE FROM users');
  }

  async createTestUser(data: {
    phone: string;
    name: string;
    password?: string;
    timezone?: string;
    locale?: string;
  }) {
    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : await bcrypt.hash('1234', 10);

    const result = await this.pool.query(
      `INSERT INTO users (phone, name, password_hash, timezone, locale, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [
        data.phone,
        data.name,
        hashedPassword,
        data.timezone || 'Asia/Jerusalem',
        data.locale || 'he',
      ]
    );

    return result.rows[0];
  }

  async createTestEvent(userId: string, data: {
    title: string;
    startTsUtc: Date;
    endTsUtc?: Date;
    location?: string;
    rrule?: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO events (user_id, title, start_ts_utc, end_ts_utc, location, rrule, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'test', NOW(), NOW())
       RETURNING *`,
      [
        userId,
        data.title,
        data.startTsUtc,
        data.endTsUtc || null,
        data.location || null,
        data.rrule || null,
      ]
    );

    return result.rows[0];
  }

  async createTestContact(userId: string, data: {
    name: string;
    relation?: string;
    aliases?: string[];
  }) {
    const result = await this.pool.query(
      `INSERT INTO contacts (user_id, name, relation, aliases, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [
        userId,
        data.name,
        data.relation || null,
        data.aliases || [],
      ]
    );

    return result.rows[0];
  }

  async createTestReminder(userId: string, data: {
    title: string;
    dueTsUtc: Date;
    rrule?: string;
    status?: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO reminders (user_id, title, due_ts_utc, rrule, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [
        userId,
        data.title,
        data.dueTsUtc,
        data.rrule || null,
        data.status || 'active',
      ]
    );

    return result.rows[0];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }
}

export class TestRedis {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '7379'),
      password: process.env.REDIS_PASSWORD,
      db: 1, // Use DB 1 for tests
    });
  }

  async clean(): Promise<void> {
    await this.redis.flushdb();
  }

  async setSession(phone: string, data: any): Promise<void> {
    await this.redis.setex(
      `session:${phone}`,
      1800, // 30 minutes
      JSON.stringify(data)
    );
  }

  async getSession(phone: string): Promise<any> {
    const data = await this.redis.get(`session:${phone}`);
    return data ? JSON.parse(data) : null;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  getClient(): Redis {
    return this.redis;
  }
}

export async function setupTestEnvironment() {
  const db = new TestDatabase();
  const redis = new TestRedis();

  await db.clean();
  await redis.clean();

  return { db, redis };
}

export async function teardownTestEnvironment(env: {
  db: TestDatabase;
  redis: TestRedis;
}) {
  await env.db.close();
  await env.redis.close();
}

// Helper to generate unique phone numbers for tests
let phoneCounter = 1000;
export function generateTestPhone(): string {
  return `+9725501${String(phoneCounter++).padStart(5, '0')}`;
}

// Helper to wait for async operations
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to assert date equality (ignoring milliseconds)
export function assertDateEqual(actual: Date, expected: Date) {
  const actualSeconds = Math.floor(actual.getTime() / 1000);
  const expectedSeconds = Math.floor(expected.getTime() / 1000);
  expect(actualSeconds).toBe(expectedSeconds);
}
