import express, { Request, Response } from 'express';
import { Server } from 'http';
import { testConnection } from '../config/database.js';
import { testRedisConnection } from '../config/redis.js';
import logger from '../utils/logger.js';
import dashboardRouter from './dashboard.js';

const app = express();
const PORT = process.env.PORT || 3000;
let server: Server | null = null;

// Mount dashboard routes
app.use(dashboardRouter);

app.get('/health', async (req: Request, res: Response) => {
  try {
    const dbOk = await testConnection();
    const redisOk = await testRedisConnection();

    const health = {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
      },
    };

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'WhatsApp Assistant Bot',
    version: '0.1.0',
    status: 'running',
  });
});

export function startHealthCheck() {
  server = app.listen(PORT, () => {
    logger.info(`Health check API listening on port ${PORT}`);
    logger.info(`Health endpoint: http://localhost:${PORT}/health`);
  });
}

export async function stopHealthCheck(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('Health check API stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export default app;
