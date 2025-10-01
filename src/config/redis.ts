import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err: Error) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true; // Reconnect
    }
    return false;
  }
};

export const redis = new Redis(redisConfig.url, {
  maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
  retryStrategy: redisConfig.retryStrategy,
  reconnectOnError: redisConfig.reconnectOnError
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

redis.on('reconnecting', () => {
  console.log('🔄 Reconnecting to Redis...');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
  console.log('🔌 Redis connection closed');
  process.exit(0);
});

export async function testRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    console.log('✅ Redis connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Redis connection test failed:', error);
    return false;
  }
}

export default redis;
