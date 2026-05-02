import { Redis } from 'ioredis';
import { log } from '../utils/logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('connect', () => log.redis('Conectado'));
redisConnection.on('error', (err) => log.error('Redis erro', err));
