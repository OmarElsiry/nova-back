/**
 * Error Handling Middleware
 * Global error handler for the API
 */

import type { Context } from 'hono';

export const errorHandler = (err: Error, c: Context) => {
  console.error('API Error:', err);
  
  // Check for specific error types
  if (err.message.includes('Unauthorized')) {
    return c.json({
      success: false,
      error: 'Unauthorized access',
      message: err.message
    }, 401);
  }
  
  if (err.message.includes('Not found')) {
    return c.json({
      success: false,
      error: 'Resource not found',
      message: err.message
    }, 404);
  }
  
  if (err.message.includes('Validation')) {
    return c.json({
      success: false,
      error: 'Validation error',
      message: err.message
    }, 400);
  }
  
  // Default error response
  return c.json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  }, 500);
};
