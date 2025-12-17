/**
 * Global Error Boundary and Error Handling System
 */

import type { Context } from 'hono';
import type { ILogger } from '../logging/ILogger';
import { z } from 'zod';

/**
 * Custom Error Classes
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTH_ERROR', true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND', true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT', true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT', true);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: any) {
    super(`External service error: ${service}`, 503, 'SERVICE_UNAVAILABLE', true, originalError);
  }
}

/**
 * Error Response Builder
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
    stack?: string;
  };
}

export function buildErrorResponse(
  error: Error | AppError,
  requestId?: string,
  includeStack: boolean = false
): ErrorResponse {
  const isAppError = error instanceof AppError;

  return {
    success: false,
    error: {
      code: isAppError ? error.code : 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: isAppError ? error.details : undefined,
      timestamp: new Date().toISOString(),
      requestId,
      stack: includeStack && !isAppError ? error.stack : undefined
    }
  };
}

/**
 * Global Error Handler Middleware
 */
export function createErrorHandler(logger: ILogger) {
  return async (error: Error, c: Context) => {
    const requestId = c.req.header('X-Request-ID') || `req_${Date.now()}`;
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Log error details
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error('Server error occurred', {
          requestId,
          code: error.code,
          message: error.message,
          details: error.details,
          stack: error.stack,
          path: c.req.path,
          method: c.req.method
        });
      } else {
        logger.warn('Client error occurred', {
          requestId,
          code: error.code,
          message: error.message,
          details: error.details,
          path: c.req.path,
          method: c.req.method
        });
      }
    } else if (error instanceof z.ZodError) {
      logger.warn('Validation error', {
        requestId,
        errors: error.errors,
        path: c.req.path,
        method: c.req.method
      });

      return c.json(
        buildErrorResponse(
          new ValidationError('Invalid input', error.errors),
          requestId,
          false
        ),
        400
      );
    } else {
      // Unknown error - log full details
      logger.error('Unhandled error occurred', {
        requestId,
        message: error.message,
        stack: error.stack,
        path: c.req.path,
        method: c.req.method,
        body: await c.req.text().catch(() => 'Unable to read body'),
        headers: c.req.header()
      });
    }

    // Determine status code
    const statusCode = error instanceof AppError
      ? error.statusCode
      : 500;

    // Build response
    const response = buildErrorResponse(
      error,
      requestId,
      isDevelopment
    );

    // Set response headers
    c.header('X-Request-ID', requestId);

    // Send response
    return c.json(response, statusCode as any);
  };
}

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw error;
    }
  }) as T;
}

/**
 * Error Recovery Strategies
 */
export class ErrorRecovery {
  private static retryDelays = [1000, 2000, 5000, 10000]; // Exponential backoff

  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    logger?: ILogger
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delay = this.retryDelays[attempt] || 10000;

          logger?.warn(`Operation failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
            error: error instanceof Error ? error.message : String(error)
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  static async withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    logger?: ILogger
  ): Promise<T> {
    try {
      return await primary();
    } catch (primaryError) {
      logger?.warn('Primary operation failed, using fallback', {
        error: primaryError instanceof Error ? primaryError.message : String(primaryError)
      });

      try {
        return await fallback();
      } catch (fallbackError) {
        logger?.error('Fallback also failed', {
          primaryError: primaryError instanceof Error ? primaryError.message : String(primaryError),
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });

        throw primaryError; // Throw original error
      }
    }
  }

  static async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    errorMessage: string = 'Operation timed out'
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      )
    ]);
  }
}

/**
 * Circuit Breaker Pattern
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailTime?: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly logger?: ILogger
  ) { }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (this.lastFailTime && now - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
        this.logger?.info('Circuit breaker entering half-open state');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();

      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        this.logger?.info('Circuit breaker closed');
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
        this.logger?.error('Circuit breaker opened', {
          failures: this.failures,
          threshold: this.threshold
        });
      }

      throw error;
    }
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailTime = undefined;
    this.logger?.info('Circuit breaker reset');
  }

  getState(): string {
    return this.state;
  }
}
