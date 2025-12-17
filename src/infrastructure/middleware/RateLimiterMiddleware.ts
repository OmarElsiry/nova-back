import type { Context, Next } from 'hono';
import type { ICacheService } from '../services/ICacheService';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

/**
 * Rate limiting middleware using sliding window algorithm
 * Implements defense against abuse and DDoS
 */
export class RateLimiterMiddleware {
  private readonly defaultOptions: RateLimitOptions = {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    keyPrefix: 'rate_limit:',
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many requests, please try again later',
  };

  constructor(
    private readonly cache: ICacheService,
    private readonly options: Partial<RateLimitOptions> = {}
  ) {
    this.options = { ...this.defaultOptions, ...options };
  }

  middleware() {
    return async (c: Context, next: Next) => {
      const identifier = this.getIdentifier(c);
      const key = `${this.options.keyPrefix}${identifier}`;
      const windowMs = this.options.windowMs || this.defaultOptions.windowMs;
      const maxRequests = this.options.maxRequests || this.defaultOptions.maxRequests;

      // Get current request count
      const currentRequests = await this.getRequestCount(key);

      if (currentRequests >= maxRequests) {
        return c.json(
          {
            error: this.options.message || this.defaultOptions.message,
            retryAfter: Math.ceil(windowMs / 1000),
          },
          429
        );
      }

      // Increment request count
      await this.incrementRequestCount(key, windowMs);

      // Add rate limit headers
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', (maxRequests - currentRequests - 1).toString());
      c.header('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

      await next();

      // Handle skip options based on response status
      const status = c.res.status;
      if (
        (this.options.skipSuccessfulRequests && status < 400) ||
        (this.options.skipFailedRequests && status >= 400)
      ) {
        await this.decrementRequestCount(key);
      }
    };
  }

  private getIdentifier(c: Context): string {
    // Try to get user ID from Telegram auth
    const userId = c.get('userId');
    if (userId) {
      return `user:${userId}`;
    }

    // Fall back to IP address
    const ip = c.req.header('x-forwarded-for') || 
                c.req.header('x-real-ip') || 
                'unknown';
    return `ip:${ip}`;
  }

  private async getRequestCount(key: string): Promise<number> {
    const count = await this.cache.get<number>(key);
    return count || 0;
  }

  private async incrementRequestCount(key: string, windowMs: number): Promise<void> {
    const current = await this.getRequestCount(key);
    await this.cache.set(key, current + 1, Math.ceil(windowMs / 1000));
  }

  private async decrementRequestCount(key: string): Promise<void> {
    const current = await this.getRequestCount(key);
    if (current > 0) {
      const ttl = await this.cache.ttl(key);
      await this.cache.set(key, current - 1, ttl);
    }
  }
}

/**
 * Factory function for creating rate limiter middleware
 */
export function createRateLimiter(
  cache: ICacheService,
  options?: Partial<RateLimitOptions>
) {
  const limiter = new RateLimiterMiddleware(cache, options);
  return limiter.middleware();
}
