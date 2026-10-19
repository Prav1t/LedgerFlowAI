import { redis } from "@/lib/redis/client";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding-window rate limiter backed by Redis.
 * Keyed per org + route so one noisy tenant can't starve others.
 */
export async function rateLimit(
  key: string,
  limit = 100,
  windowSeconds = 60
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const redisKey = `ratelimit:${key}`;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
  pipeline.zcard(redisKey);
  pipeline.expire(redisKey, windowSeconds);
  const results = await pipeline.exec();

  const count = (results?.[2]?.[1] as number) ?? 0;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowSeconds * 1000,
  };
}
