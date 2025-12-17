/**
 * Authentication Helper Functions
 * Utilities for getting user from Telegram authentication context
 */

import type { Context } from 'hono';
import type { PrismaClient } from '@prisma/client';
import { HTTPException } from 'hono/http-exception';

/**
 * Get authenticated user from Telegram context
 * Throws 401 if not authenticated, 404 if user not found
 */
export async function getUserFromContext(c: Context, prisma: PrismaClient) {
  const telegramId = c.get('telegramId');
  
  if (!telegramId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }
  
  const user = await prisma.user.findUnique({
    where: { telegramId }
  });
  
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }
  
  return user;
}

/**
 * Get user ID from Telegram context
 * Convenience function that returns just the user ID
 */
export async function getUserIdFromContext(c: Context, prisma: PrismaClient): Promise<number> {
  const user = await getUserFromContext(c, prisma);
  return user.id;
}
