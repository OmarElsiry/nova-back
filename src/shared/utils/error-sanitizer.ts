/**
 * Error Sanitization Utility
 * 
 * Sanitizes error messages for production to prevent information disclosure
 */

import { AppError } from '../errors/AppError';
import { ERROR_CODES } from '../constants';

/**
 * Sanitize error for client response
 * In production, returns generic messages
 * In development, returns detailed messages
 */
export function sanitizeError(error: unknown): {
  code: string;
  message: string;
  details?: any;
} {
  const isProduction = process.env.NODE_ENV === 'production';

  // Handle AppError instances
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: isProduction ? getGenericMessage(error.code) : error.message,
      details: isProduction ? undefined : error.details,
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: isProduction ? 'An unexpected error occurred' : error.message,
      details: isProduction ? undefined : { stack: error.stack },
    };
  }

  // Handle unknown errors
  return {
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    message: 'An unexpected error occurred',
  };
}

/**
 * Get generic error message for production
 */
function getGenericMessage(code: string): string {
  const genericMessages: Record<string, string> = {
    [ERROR_CODES.VALIDATION_ERROR]: 'Invalid input provided',
    [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
    [ERROR_CODES.FORBIDDEN]: 'Access denied',
    [ERROR_CODES.NOT_FOUND]: 'Resource not found',
    [ERROR_CODES.CONFLICT]: 'Resource already exists',
    [ERROR_CODES.BUSINESS_LOGIC_ERROR]: 'Operation not allowed',
    [ERROR_CODES.INTERNAL_SERVER_ERROR]: 'An unexpected error occurred',
    [ERROR_CODES.INVALID_TOKEN]: 'Invalid authentication token',
    [ERROR_CODES.TOKEN_EXPIRED]: 'Authentication token expired',
    [ERROR_CODES.INSUFFICIENT_BALANCE]: 'Insufficient balance',
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests',
  };

  return genericMessages[code] || 'An error occurred';
}

/**
 * Sanitize error details for logging
 * Removes sensitive information from logs
 */
export function sanitizeErrorForLogging(error: unknown): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}

/**
 * Check if error should be logged
 * Some errors (like validation errors) might not need error-level logging
 */
export function shouldLogAsError(error: unknown): boolean {
  if (error instanceof AppError) {
    // Don't log validation errors and not found errors as errors
    const nonErrorCodes = [
      ERROR_CODES.VALIDATION_ERROR,
      ERROR_CODES.NOT_FOUND,
    ];
    return !nonErrorCodes.includes(error.code as any);
  }

  return true;
}
