/**
 * Enhanced Rate Limit Middleware (In-Memory)
 * Production-ready rate limiting with local memory storage
 */

import type { Context, Next } from 'hono';
import { createHash } from 'crypto';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (c: Context) => string;
  skip?: (c: Context) => boolean;
  handler?: (c: Context) => Response | Promise<Response>;
}

interface RateLimitStore {
  count: number;
  resetTime: number;
  blockedUntil?: number;
}

// In-memory store with automatic cleanup
class MemoryStore {
  private store = new Map<string, RateLimitStore>();
  private cleanupInterval: Timer;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, data] of this.store.entries()) {
      if (now > data.resetTime && (!data.blockedUntil || now > data.blockedUntil)) {
        this.store.delete(key);
      }
    }
  }

  get(key: string): RateLimitStore | undefined {
    const data = this.store.get(key);
    if (data && Date.now() > data.resetTime) {
      // Reset the count if window has passed
      data.count = 0;
      data.resetTime = Date.now() + (data.resetTime - Date.now() + 60000); // Preserve window size
    }
    return data;
  }

  set(key: string, value: RateLimitStore): void {
    this.store.set(key, value);
  }

  increment(key: string, windowMs: number): RateLimitStore {
    const now = Date.now();
    let data = this.get(key);

    if (!data || now > data.resetTime) {
      data = {
        count: 1,
        resetTime: now + windowMs
      };
    } else {
      data.count++;
    }

    this.set(key, data);
    return data;
  }

  block(key: string, duration: number): void {
    const data = this.get(key);
    if (data) {
      data.blockedUntil = Date.now() + duration;
      this.set(key, data);
    }
  }

  isBlocked(key: string): boolean {
    const data = this.get(key);
    return !!(data?.blockedUntil && Date.now() < data.blockedUntil);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Global store instance
const globalStore = new MemoryStore();

// IP extraction with multiple fallbacks
function extractIP(c: Context): string {
  // Try various headers in order of preference
  const headers = [
    'cf-connecting-ip',      // Cloudflare
    'x-real-ip',             // Nginx proxy
    'x-forwarded-for',       // Standard proxy
    'x-client-ip',           // Apache
    'true-client-ip',        // Akamai, Cloudflare
    'x-cluster-client-ip',   // Rackspace
  ];

  for (const header of headers) {
    const value = c.req.header(header);
    if (value) {
      // Handle comma-separated list (x-forwarded-for)
      const ip = value.split(',')[0]?.trim();
      if (ip && isValidIP(ip)) {
        return ip;
      }
    }
  }

  // Fallback to connection remote address
  // In Bun/Hono, this might not be directly available
  return 'unknown-' + Math.random().toString(36).substring(7);
}

// Basic IP validation
function isValidIP(ip: string): boolean {
  // Simple check for IPv4 or IPv6
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// Generate fingerprint for advanced rate limiting
function generateFingerprint(c: Context): string {
  const parts = [
    extractIP(c),
    c.req.header('user-agent') || 'unknown',
    c.req.header('accept-language') || 'unknown',
    c.req.header('accept-encoding') || 'unknown',
  ];

  return createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
    .substring(0, 16);
}

export function createEnhancedRateLimit(config: RateLimitConfig) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later.',
    standardHeaders = true,
    legacyHeaders = false,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (c) => generateFingerprint(c),
    skip = () => false,
    handler,
  } = config;

  return async (c: Context, next: Next) => {
    // Check if should skip
    if (skip(c)) {
      return next();
    }

    const key = keyGenerator(c);

    // Check if blocked
    if (globalStore.isBlocked(key)) {
      if (handler) {
        return handler(c);
      }

      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMIT_BLOCKED',
          message: 'You have been temporarily blocked due to too many requests',
        }
      }, 429);
    }

    // Get current state
    const data = globalStore.increment(key, windowMs);
    const remaining = Math.max(0, max - data.count);
    const resetTime = Math.ceil(data.resetTime / 1000);

    // Set rate limit headers
    if (standardHeaders) {
      c.header('X-RateLimit-Limit', max.toString());
      c.header('X-RateLimit-Remaining', remaining.toString());
      c.header('X-RateLimit-Reset', resetTime.toString());
    }

    if (legacyHeaders) {
      c.header('X-Rate-Limit-Limit', max.toString());
      c.header('X-Rate-Limit-Remaining', remaining.toString());
      c.header('X-Rate-Limit-Reset', resetTime.toString());
    }

    // Check if exceeded
    if (data.count > max) {
      // Block for progressive duration based on violations
      const violations = Math.floor(data.count / max);
      const blockDuration = Math.min(violations * 5 * 60 * 1000, 60 * 60 * 1000); // Max 1 hour
      globalStore.block(key, blockDuration);

      if (handler) {
        return handler(c);
      }

      // Add Retry-After header
      c.header('Retry-After', Math.ceil(blockDuration / 1000).toString());

      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: Math.ceil(blockDuration / 1000),
        }
      }, 429);
    }

    // Process request
    await next();

    // Skip counting based on response
    const status = c.res.status;
    if (skipSuccessfulRequests && status < 400) {
      data.count--;
      globalStore.set(key, data);
    } else if (skipFailedRequests && status >= 400) {
      data.count--;
      globalStore.set(key, data);
    }
  };
}

// Specialized rate limiters for different endpoints
export const createApiRateLimit = () => createEnhancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'API rate limit exceeded',
});

export const createAuthRateLimit = () => createEnhancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Strict for auth endpoints
  message: 'Too many authentication attempts',
});

export const createWebhookRateLimit = () => createEnhancedRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Webhook rate limit exceeded',
});

// Cleanup on process exit
process.on('SIGTERM', () => globalStore.destroy());
process.on('SIGINT', () => globalStore.destroy());
