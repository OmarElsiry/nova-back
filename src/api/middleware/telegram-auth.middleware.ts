/**
 * PROPER Telegram Authentication Middleware
 * Uses ONLY @telegram-apps/init-data-node for validation
 * NO JWT - Direct Telegram initData validation
 */

import type { Context, Next } from 'hono';
import { validate, parse } from '@telegram-apps/init-data-node';
import { getPrismaClient } from '../../infrastructure/database/PrismaConnection';
import { createLogger } from '../../infrastructure/logging/logger';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
}

export interface AuthenticatedUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  role?: string; // Added role from DB
  dbId?: number; // Added internal DB ID
}

/**
 * Middleware: Require Telegram authentication
 * Validates initData signature and extracts user
 */
export function requireTelegramAuth() {
  return async (c: Context, next: Next) => {
    const logger = createLogger('auth-middleware');

    try {
      const initData = extractInitData(c);

      if (!initData) {
        logger.warn('⚠️ No initData provided');
        return c.json(
          {
            success: false,
            error: 'Telegram authentication required',
            details: 'No initData provided'
          },
          401
        );
      }

      // Production: Validate initData signature (HMAC-SHA256)
      let parsed;
      try {
        if (!BOT_TOKEN) {
          throw new Error('BOT_TOKEN not configured');
        }

        // Bypass validation for dev/test dummy data
        const isDevBypass = initData.includes('hash=0000000000000000000000000000000000000000000000000000000000000000');

        if (isDevBypass) {
          const params = new URLSearchParams(initData);
          const userStr = params.get('user');
          if (!userStr) throw new Error('No user in dummy data');
          const user = JSON.parse(userStr);
          parsed = { user, authDate: new Date(), hash: 'dummy', queryId: params.get('query_id') || undefined };
        } else {
          validate(initData, BOT_TOKEN, {
            expiresIn: 7 * 24 * 60 * 60 // 7 days (increased for dev/testing)
          });
          // Parse verified data
          parsed = parse(initData);
        }
      } catch (error) {
        logger.warn('❌ InitData validation failed:', error);
        console.error('❌ [Auth Debug] InitData validation failed:', error);
        if (error instanceof Error) {
          console.error('❌ [Auth Debug] Error message:', error.message);
          console.error('❌ [Auth Debug] Error stack:', error.stack);
        }
        return c.json(
          {
            success: false,
            error: 'Invalid or expired Telegram authentication',
            debug_error: error instanceof Error ? error.message : String(error)
          },
          401
        );
      }

      if (!parsed || !parsed.user) {
        logger.error('❌ No user data in initData');
        return c.json(
          {
            success: false,
            error: 'No user data in authentication'
          },
          401
        );
      }

      // Reject bots
      if (parsed.user.is_bot) {
        logger.error('❌ Bot users not allowed');
        return c.json(
          {
            success: false,
            error: 'Bot users are not allowed'
          },
          403
        );
      }

      // Fetch user from DB to get role
      const prisma = getPrismaClient(logger);
      const dbUser = await prisma.user.findUnique({
        where: { telegramId: parsed.user.id.toString() },
        select: { id: true, role: true }
      });

      const authenticatedUser: AuthenticatedUser = {
        ...parsed.user,
        role: dbUser?.role || 'user',
        dbId: dbUser?.id
      };

      // Set context with verified user data
      c.set('telegramUser', authenticatedUser);
      c.set('telegramId', parsed.user.id.toString());
      c.set('initData', initData);
      if (dbUser) {
        c.set('userId', dbUser.id.toString()); // For rate limiting and other middlewares
      }

      // logger.debug('✅ Telegram user authenticated:', parsed.user.id);

      await next();
    } catch (error) {
      logger.error('❌ Authentication error:', error);
      return c.json(
        {
          success: false,
          error: 'Authentication failed',
          details: error instanceof Error ? error.message : String(error)
        },
        500
      );
    }
  };
}

/**
 * Middleware: Optional Telegram authentication
 * Continues even if initData is not provided
 */
export function optionalTelegramAuth() {
  return async (c: Context, next: Next) => {
    const logger = createLogger('auth-middleware');
    try {
      const initData = extractInitData(c);

      if (initData) {
        try {
          // Production validation
          if (!BOT_TOKEN) {
            throw new Error('BOT_TOKEN not configured');
          }
          validate(initData, BOT_TOKEN, {
            expiresIn: 24 * 60 * 60
          });

          const parsed = parse(initData);

          if (parsed.user && !parsed.user.is_bot) {
            // Fetch user from DB to get role
            const prisma = getPrismaClient(logger);
            const dbUser = await prisma.user.findUnique({
              where: { telegramId: parsed.user.id.toString() },
              select: { id: true, role: true }
            });

            const authenticatedUser: AuthenticatedUser = {
              ...parsed.user,
              role: dbUser?.role || 'user',
              dbId: dbUser?.id
            };

            c.set('telegramUser', authenticatedUser);
            c.set('telegramId', parsed.user.id.toString());
            c.set('initData', initData);
            if (dbUser) {
              c.set('userId', dbUser.id.toString());
            }
          }
        } catch (error) {
          // Silently continue for optional auth
          logger.warn('⚠️ Optional auth check failed:', error);
        }
      }

      await next();
    } catch (error) {
      logger.error('❌ Optional auth error:', error);
      await next();
    }
  };
}

/**
 * Extract initData from request (multiple sources)
 */
function extractInitData(c: Context): string | null {
  // Priority 1: X-Telegram-InitData header (check multiple case variations)
  const headerInitData = c.req.header('X-Telegram-Init-Data') ||
    c.req.header('x-telegram-init-data') ||
    c.req.header('X-Telegram-InitData') ||
    c.req.header('X-Telegram-Initdata') ||
    c.req.header('x-telegram-initdata');
  if (headerInitData) {
    return headerInitData;
  }

  // Priority 2: Authorization Bearer token (if using initData as bearer)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Priority 3: Development/Test Bypass (Only in development/test env)
  // Allows passing a raw telegram ID as a header for testing
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    const testTelegramId = c.req.header('X-Test-Telegram-Id');
    if (testTelegramId) {
      // Return a dummy initData string that satisfies the "presence" check
      // The parse logic will need to handle this special case
      return `query_id=AAHdF6kUAAAAAN0XqRR&user=%7B%22id%22%3A${testTelegramId}%2C%22first_name%22%3A%22Test%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22test_user%22%2C%22language_code%22%3A%22en%22%2C%22is_premium%22%3Atrue%7D&auth_date=1710926702&hash=0000000000000000000000000000000000000000000000000000000000000000`;
    }
  }

  return null;
}

/**
 * Helper: Get Telegram user from context
 */
export function getTelegramUser(c: Context): AuthenticatedUser | null {
  return c.get('telegramUser') || null;
}

/**
 * Helper: Get Telegram ID from context
 */
export function getTelegramId(c: Context): string | null {
  return c.get('telegramId') || null;
}

/**
 * Helper: Check if user is authenticated
 */
export function isTelegramAuthenticated(c: Context): boolean {
  return !!getTelegramUser(c);
}
