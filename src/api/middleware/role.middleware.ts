/**
 * Role-based Access Control Middleware
 * Restrict access based on user roles
 */

import type { Context, Next } from 'hono';


import type { AuthenticatedUser } from './telegram-auth.middleware';

export const roleAuth = (allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    try {
      const payload = c.get('telegramUser') as AuthenticatedUser;

      if (!payload || !payload.role) {
        return c.json({
          success: false,
          error: 'Unauthorized: No role found'
        }, 403);
      }

      if (!allowedRoles.includes(payload.role)) {
        return c.json({
          success: false,
          error: 'Forbidden: Insufficient permissions'
        }, 403);
      }

      await next();
    } catch (error) {
      return c.json({
        success: false,
        error: 'Authentication failed'
      }, 401);
    }
  };
};
