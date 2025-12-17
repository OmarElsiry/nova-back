/**
 * Transaction Routes
 * Handle transaction queries and operations
 */

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

const app = new Hono();
const prisma = new PrismaClient();

/**
 * GET /api/transactions/pending/:telegramId
 * Get pending transactions for a user by telegram ID
 */
app.get('/pending/:telegramId', async (c) => {
  try {
    const telegramId = c.req.param('telegramId');
    
    console.log(`[GET /pending/${telegramId}] Fetching pending transactions`);
    
    // Find user by telegram ID
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });
    
    if (!user) {
      console.log(`[GET /pending/${telegramId}] User not found`);
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }
    
    // Fetch pending transactions
    const pendingTransactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        status: 'pending'
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`[GET /pending/${telegramId}] Found ${pendingTransactions.length} pending transactions`);
    
    return c.json({
      success: true,
      data: {
        transactions: pendingTransactions,
        total: pendingTransactions.length
      }
    });
  } catch (error) {
    console.error('[GET /transactions/pending] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch pending transactions'
    }, 500);
  }
});

/**
 * GET /api/transactions/:telegramId
 * Get all transactions for a user by telegram ID
 */
app.get('/:telegramId', async (c) => {
  try {
    const telegramId = c.req.param('telegramId');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    
    console.log(`[GET /${telegramId}] Fetching transactions (limit: ${limit}, offset: ${offset})`);
    
    // Find user by telegram ID
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });
    
    if (!user) {
      console.log(`[GET /${telegramId}] User not found`);
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }
    
    // Fetch transactions with pagination
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.transaction.count({
        where: { userId: user.id }
      })
    ]);
    
    console.log(`[GET /${telegramId}] Found ${transactions.length} of ${total} total transactions`);
    
    return c.json({
      success: true,
      data: {
        transactions,
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total
      }
    });
  } catch (error) {
    console.error('[GET /transactions/:telegramId] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch transactions'
    }, 500);
  }
});

export default app;
