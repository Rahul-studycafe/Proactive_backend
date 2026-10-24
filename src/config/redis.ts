import { ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient: Redis | null = null;

const getRedisConfig = () => {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || 'secret';
  return { host, port, password };
};

/**
 * Returns Redis connection options with automated retry strategy and test resilience.
 */
export const getRedisConnection = (): ConnectionOptions => {
  const { host, port, password } = getRedisConfig();

  return {
    host,
    port,
    password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      // Exponential backoff capped at 2000ms
      return Math.min(times * 100, 2000);
    }
  };
};

/**
 * Returns a shared ioredis client instance for caching and pub/sub.
 */
export const getRedisClient = (): Redis | null => {
  if (!redisClient) {
    try {
      const { host, port, password } = getRedisConfig();
      redisClient = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 1
      });

      redisClient.on('error', () => {
        // Prevent unhandled errors if local Redis instance is unavailable
      });
    } catch {
      redisClient = null;
    }
  }
  return redisClient;
};

/**
 * Cleanly disconnects the shared redis client (useful in afterAll test hooks).
 */
export const closeRedisClient = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
  }
};
