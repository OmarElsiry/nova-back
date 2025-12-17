import type { Context, Next } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: any;
    stack?: string;
  };
  correlationId?: string;
  timestamp: string;
}

/**
 * Centralized error handling middleware
 * Implements RFC 7807 Problem Details for HTTP APIs
 */
export class ErrorHandlerMiddleware {
  constructor(
    private readonly isDevelopment: boolean = false,
    private readonly logError?: (error: Error, context: Context) => void
  ) { }

  middleware() {
    return async (c: Context, next: Next) => {
      try {
        await next();
      } catch (error) {
        return this.handleError(error, c);
      }
    };
  }

  private handleError(error: unknown, c: Context) {
    // Log error if logger provided
    if (error instanceof Error && this.logError) {
      this.logError(error, c);
    }

    const correlationId = c.get('correlationId') || this.generateCorrelationId();
    const response = this.buildErrorResponse(error, correlationId);
    const status = this.getHttpStatus(error);

    // Add correlation ID to response headers
    c.header('X-Correlation-ID', correlationId);

    return c.json(response, status as any);
  }

  private buildErrorResponse(error: unknown, correlationId: string): ErrorResponse {
    const response: ErrorResponse = {
      error: {
        message: 'Internal Server Error',
        code: 'INTERNAL_ERROR',
      },
      correlationId,
      timestamp: new Date().toISOString(),
    };

    if (error instanceof ZodError) {
      response.error = {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      };
    } else if (error instanceof BusinessError) {
      response.error = {
        message: error.message,
        code: error.code,
        details: error.details,
      };
    } else if (error instanceof Error) {
      response.error = {
        message: this.isDevelopment ? error.message : 'An error occurred',
        code: (error as any).code || 'UNKNOWN_ERROR',
      };

      if (this.isDevelopment) {
        response.error.stack = error.stack;
      }
    }

    return response;
  }

  private getHttpStatus(error: unknown): number {
    if (error instanceof ZodError) {
      return 400;
    }

    if (error instanceof BusinessError) {
      return error.statusCode;
    }

    if (error instanceof Error) {
      const status = (error as any).status || (error as any).statusCode;
      if (status && typeof status === 'number' && status >= 400 && status < 600) {
        return status;
      }
    }

    return 500;
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Business error class for domain-specific errors
 */
export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

/**
 * Common business errors
 */
export class NotFoundError extends BusinessError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class UnauthorizedError extends BusinessError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends BusinessError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ConflictError extends BusinessError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class ValidationError extends BusinessError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}
