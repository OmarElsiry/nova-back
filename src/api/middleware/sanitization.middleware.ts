/**
 * Input Sanitization Middleware
 * 
 * Sanitizes all user inputs to prevent XSS and injection attacks
 */

import type { Context, Next } from 'hono';
import type { ILogger } from '../../infrastructure/logging/ILogger';

/**
 * Sanitize string input
 * Removes potentially dangerous characters and patterns
 */
function sanitizeString(input: string): string {
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Remove script tags and content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Recursively sanitize object
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'bigint') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Input sanitization middleware
 * Sanitizes request body to prevent XSS and injection attacks
 */
export function createSanitizationMiddleware(logger: ILogger) {
  return async (c: Context, next: Next) => {
    // Only sanitize for methods with body
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      try {
        const contentType = c.req.header('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          const body = await c.req.json();
          const sanitized = sanitizeObject(body);
          
          // Replace request body with sanitized version
          // Store in context for later retrieval
          c.set('sanitizedBody', sanitized);
          
          logger.debug('Request body sanitized', {
            path: c.req.path,
            method: c.req.method,
          });
        }
      } catch (error) {
        logger.warn('Failed to sanitize request body', {
          error: error instanceof Error ? error.message : String(error),
          path: c.req.path,
        });
      }
    }

    await next();
  };
}

/**
 * Helper to get sanitized body from context
 */
export function getSanitizedBody<T>(c: Context): T {
  return c.get('sanitizedBody') as T;
}
