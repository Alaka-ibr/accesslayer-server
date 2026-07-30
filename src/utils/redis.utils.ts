import Redis from 'ioredis';
import { envConfig } from '../config';
import { logger } from './logger.utils';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(envConfig.REDIS_URL, {
      lazyConnect: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: null,
    });

    redis.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    redis.on('connect', () => {
      logger.info('Connected to Redis');
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const r = getRedis();
  if (r.status === 'wait' || r.status === 'close' || r.status === 'end') {
    await r.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export function isRedisReady(): boolean {
  return redis !== null && redis.status === 'ready';
}
