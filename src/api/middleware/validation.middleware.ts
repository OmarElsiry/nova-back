/**
 * Enhanced Validation Middleware
 * Provides comprehensive input validation, sanitization, and SQL injection prevention
 */

import type { Context, Next } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { createLogger } from '../../infrastructure/logging/logger';

const logger = createLogger('validation-middleware');

/**
 * Sanitize string to prevent SQL injection and XSS
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;
  
  // Remove SQL keywords and dangerous patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE|ORDER BY|GROUP BY|HAVING)\b)/gi,
    /(--|#|\/\*|\*\/|;|'|"|`|\\)/g,
    /(<script|<\/script|javascript:|onerror=|onclick=|onload=)/gi
  ];
  
  let sanitized = str;
  for (const pattern of sqlPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // Trim and limit length
  return sanitized.trim().substring(0, 1000);
}

/**
 * Deep sanitize an object
 */
function deepSanitize(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSanitize);
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = deepSanitize(value);
    }
    return sanitized;
  }
  return obj;
}

/**
 * Validate request with schema and sanitization
 */
export const validateRequest = (schema: z.ZodSchema, options?: {
  sanitize?: boolean;
  allowPartial?: boolean;
  source?: 'body' | 'query' | 'params' | 'all';
}) => {
  const opts = {
    sanitize: true,
    allowPartial: false,
    source: 'body' as const,
    ...options
  };

  return async (c: Context, next: Next) => {
    try {
      let data: any = {};

      // Collect data based on source
      switch (opts.source) {
        case 'body':
          data = await c.req.json().catch(() => ({}));
          break;
        case 'query':
          data = c.req.query();
          break;
        case 'params':
          data = c.req.param();
          break;
        case 'all':
          data = {
            body: await c.req.json().catch(() => ({})),
            query: c.req.query(),
            params: c.req.param()
          };
          break;
      }

      // Sanitize input if enabled
      if (opts.sanitize) {
        data = deepSanitize(data);
      }

      // Validate with schema
      let validated: any;
      if (opts.allowPartial && 'partial' in schema && typeof (schema as any).partial === 'function') {
        validated = (schema as any).partial().parse(data);
      } else {
        validated = schema.parse(data);
      }

      // Store validated data
      c.set('validated', validated);
      c.set('validatedData', validated); // Backward compatibility

      // Log validation success in debug mode
      logger.debug('Request validated', {
        path: c.req.path,
        source: opts.source
      });

      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Validation failed', {
          path: c.req.path,
          errors: error.errors,
          ip: c.req.header('x-forwarded-for')
        });

        return c.json({
          success: false,
          error: 'Validation failed',
          message: 'Invalid request data',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }, 400);
      }

      logger.error('Unexpected validation error', { error });
      throw new HTTPException(500, { message: 'Internal validation error' });
    }
  };
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(10),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional()
  }),

  // ID parameters
  idParam: z.object({
    id: z.string().uuid()
  }),

  // Numeric ID
  numericId: z.object({
    id: z.coerce.number().positive()
  }),

  // Search query
  searchQuery: z.object({
    q: z.string().min(1).max(100)
  }),

  // TON wallet address
  walletAddress: z.string().regex(/^[A-Za-z0-9_-]{48}$/, 'Invalid TON wallet address'),

  // Telegram ID
  telegramId: z.union([
    z.string().regex(/^\d+$/),
    z.number()
  ]).transform(val => String(val)),

  // Amount (in TON)
  amount: z.number().positive().max(10000),

  // Channel username
  channelUsername: z.string()
    .min(5)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Invalid channel username')
};

/**
 * Validate Telegram Init Data
 */
export function validateTelegramInitData(initData: string): boolean {
  // This would normally validate the HMAC signature
  // For now, just check it exists and has expected format
  if (!initData || typeof initData !== 'string') {
    return false;
  }

  try {
    const params = new URLSearchParams(initData);
    return params.has('user') && params.has('hash') && params.has('auth_date');
  } catch {
    return false;
  }
}

/**
 * Rate limit by validation errors
 * Blocks users who repeatedly fail validation
 */
const validationFailures = new Map<string, number>();

export function trackValidationFailure(ip: string): boolean {
  const failures = validationFailures.get(ip) || 0;
  validationFailures.set(ip, failures + 1);

  // Clear after 1 hour
  setTimeout(() => validationFailures.delete(ip), 3600000);

  // Block after 10 failures
  return failures > 10;
}
