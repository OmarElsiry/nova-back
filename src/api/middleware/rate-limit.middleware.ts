/**
 * Rate Limit Middleware
 * Simple in-memory rate limiter for Hono
 */

import type { Context, Next } from 'hono';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (c: Context) => string;
}

const counters = new Map<string, { count: number; resetTime: number }>();

// Clean up expired counters every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of counters.entries()) {
    if (now > data.resetTime) {
      counters.delete(key);
    }
  }
}, 60000);

export const rateLimit = (config: RateLimitConfig) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests, please try again later.',
    keyGenerator = (c) => c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  } = config;

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();
    
    let record = counters.get(key);
    
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      counters.set(key, record);
    }
    
    record.count++;
    
    // Set headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, max - record.count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
    
    if (record.count > max) {
      return c.json({
        success: false,
        error: message
      }, 429);
    }
    
    await next();
  };
};
