/**
 * Base Controller
 * Provides common controller functionality
 */

import type { Context } from 'hono';
import type { ILogger } from '../../infrastructure/logging/ILogger';
import { AppError } from '../../shared/errors/AppError';
import { PAGINATION, HTTP_STATUS } from '../../shared/constants';

export abstract class BaseController {
  protected logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Send success response
   */
  protected success<T>(c: Context, data: T, statusCode: number = 200): Response {
    return c.json(
      {
        success: true,
        data
      },
      statusCode as any
    );
  }

  /**
   * Send error response
   */
  protected error(c: Context, error: unknown): Response {
    if (error instanceof AppError) {
      this.logger.warn('API error', { code: error.code, message: error.message });
      return c.json(error.toJSON(), error.statusCode as any);
    }

    this.logger.error('Unexpected error', error);
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

  /**
   * Send paginated response
   */
  protected paginated<T>(
    c: Context,
    data: T[],
    total: number,
    page: number,
    pageSize: number,
    statusCode: number = 200
  ): Response {
    return c.json(
      {
        success: true,
        data,
        pagination: {
          total,
          page,
          pageSize,
          pages: Math.ceil(total / pageSize)
        }
      },
      statusCode as any
    );
  }

  /**
   * Get request body
   */
  protected async getBody<T>(c: Context): Promise<T> {
    try {
      return await c.req.json();
    } catch (error) {
      throw new AppError(400, 'Invalid request body', 'INVALID_REQUEST_BODY');
    }
  }

  /**
   * Get path parameter
   */
  protected getParam(c: Context, name: string): string {
    const value = c.req.param(name);
    if (!value) {
      throw new AppError(400, `Missing parameter: ${name}`, 'MISSING_PARAMETER');
    }
    return value;
  }

  /**
   * Get query parameter
   */
  protected getQuery(c: Context, name: string, defaultValue?: string): string | undefined {
    return c.req.query(name) || defaultValue;
  }

  /**
   * Get pagination parameters
   */
  protected getPaginationParams(c: Context): { page: number; pageSize: number } {
    const page = parseInt(this.getQuery(c, 'page', String(PAGINATION.MIN_PAGE)) || String(PAGINATION.MIN_PAGE));
    const pageSize = parseInt(this.getQuery(c, 'pageSize', String(PAGINATION.DEFAULT_PAGE_SIZE)) || String(PAGINATION.DEFAULT_PAGE_SIZE));

    if (page < PAGINATION.MIN_PAGE) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, `Page must be >= ${PAGINATION.MIN_PAGE}`, 'INVALID_PAGE');
    }

    if (pageSize < PAGINATION.MIN_PAGE_SIZE || pageSize > PAGINATION.MAX_PAGE_SIZE) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, `Page size must be between ${PAGINATION.MIN_PAGE_SIZE} and ${PAGINATION.MAX_PAGE_SIZE}`, 'INVALID_PAGE_SIZE');
    }

    return { page, pageSize };
  }

  /**
   * Log request
   */
  protected logRequest(c: Context, action: string): void {
    this.logger.info(`${action}`, {
      method: c.req.method,
      path: c.req.path,
      ip: c.req.header('x-forwarded-for') || 'unknown'
    });
  }

  /**
   * Log response
   */
  protected logResponse(c: Context, action: string, statusCode: number): void {
    this.logger.info(`${action} completed`, {
      method: c.req.method,
      path: c.req.path,
      statusCode
    });
  }
}
