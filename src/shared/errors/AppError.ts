/**
 * Application Error Classes
 * Standardized error handling throughout the application
 */

/**
 * Base application error
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    override message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    const message = id 
      ? `${resource} not found: ${id}` 
      : `${resource} not found`;
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(409, message, 'CONFLICT', details);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Business logic error (422)
 */
export class BusinessLogicError extends AppError {
  constructor(message: string, details?: any) {
    super(422, message, 'BUSINESS_LOGIC_ERROR', details);
    this.name = 'BusinessLogicError';
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: any) {
    super(500, message, 'INTERNAL_SERVER_ERROR', details);
    this.name = 'InternalServerError';
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * Service unavailable error (503)
 */
export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(503, `${service} is currently unavailable`, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}
