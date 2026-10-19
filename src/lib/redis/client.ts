import Redis from "ioredis";
import { env } from "@/config/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Shared Redis connection for caching / rate limiting. */
export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/** BullMQ requires maxRetriesPerRequest: null on its connections. */
export function createQueueConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
