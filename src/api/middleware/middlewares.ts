/**
 * API Middleware Stack
 * Provides common middleware for API routes
 */

import type { Context, Next } from 'hono';
import type { ILogger } from '../../infrastructure/logging/ILogger';
import { AppError } from '../../shared/errors/AppError';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { RATE_LIMITS } from '../../shared/constants';

/**
 * Request logging middleware
 */
export function createRequestLogger(logger: ILogger) {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    logger.info('Incoming request', {
      method,
      path,
      ip: c.req.header('x-forwarded-for') || 'unknown'
    });

    await next();

    const duration = Date.now() - startTime;
    const status = c.res.status;

    logger.info('Request completed', {
      method,
      path,
      status,
      duration: `${duration}ms`
    });
  };
}

/**
 * Error handling middleware
 */
export function createErrorHandler(logger: ILogger) {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error: any) {
      logger.error('Unhandled error', error);

      if (error instanceof AppError) {
        return c.json(error.toJSON(), error.statusCode as any);
      }

      return c.json(
        {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred'
          }
        },
        500 as any
      );
    }
  };
}

/**
 * Request validation middleware
 */
export function createRequestValidator(logger: ILogger) {
  return async (c: Context, next: Next) => {
    const contentType = c.req.header('content-type');

    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (!contentType || !contentType.includes('application/json')) {
        logger.warn('Invalid content type', {
          method: c.req.method,
          path: c.req.path,
          contentType
        });

        return c.json(
          {
            success: false,
            error: {
              code: 'INVALID_CONTENT_TYPE',
              message: 'Content-Type must be application/json'
            }
          },
          400 as any
        );
      }
    }

    await next();
  };
}

/**
 * CORS middleware
 */
export function createCorsMiddleware(allowedOrigins: string[] = ['*']) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin') || '*';

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      c.header('Access-Control-Max-Age', '86400');
    }

    if (c.req.method === 'OPTIONS') {
      return c.text('OK', 200);
    }

    await next();
  };
}

/**
 * Rate limiting middleware
 */
export function createRateLimiter(logger: ILogger) {
  const rateLimiter = new RateLimiterMemory({
    points: RATE_LIMITS.POINTS_PER_MINUTE,
    duration: RATE_LIMITS.DURATION_SECONDS,
    blockDuration: RATE_LIMITS.BLOCK_DURATION_SECONDS,
  });

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

    try {
      await rateLimiter.consume(ip);
      await next();
    } catch (error) {
      logger.warn('Rate limit exceeded', { ip, path: c.req.path });
      
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
          },
        },
        429 as any
      );
    }
  };
}

/**
 * Request timeout middleware
 */
export function createTimeoutMiddleware(timeoutMs: number = 30000) {
  return async (c: Context, next: Next) => {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    );

    try {
      await Promise.race([next(), timeoutPromise]);
    } catch (error: any) {
      if (error.message === 'Request timeout') {
        return c.json(
          {
            success: false,
            error: {
              code: 'REQUEST_TIMEOUT',
              message: 'Request took too long to complete'
            }
          },
          408 as any
        );
      }
      throw error;
    }
  };
}

/**
 * Security headers middleware
 */
export function createSecurityHeaders() {
  return async (c: Context, next: Next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.header('Content-Security-Policy', "default-src 'self'");

    await next();
  };
}

/**
 * Response compression middleware
 */
export function createCompressionMiddleware() {
  return async (c: Context, next: Next) => {
    await next();

    const acceptEncoding = c.req.header('accept-encoding') || '';

    if (acceptEncoding.includes('gzip')) {
      c.header('Content-Encoding', 'gzip');
    }
  };
}
