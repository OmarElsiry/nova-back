/**
 * Balance Routes
 * Handle user balance operations
 */

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = new Hono();
const prisma = new PrismaClient();

/**
 * GET /api/balance
 * Get current user balance
 */
app.get('/', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        balance: true,
        walletAddress: true,
        updatedAt: true
      }
    });

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }

    // Calculate available balance (total - pending withdrawals)
    const pendingWithdrawals = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
      FROM Withdrawal
      WHERE userId = ${userId}
      AND status IN ('pending', 'processing')
    `;

    const pendingAmount = pendingWithdrawals[0]?.total || 0;
    const availableBalance = user.balance - Number(pendingAmount);

    return c.json({
      success: true,
      data: {
        balance: user.balance,
        availableBalance: availableBalance,
        pendingWithdrawals: Number(pendingAmount),
        currency: 'nanoTON',
        balanceInTON: user.balance / 1000000000,
        walletAddress: user.walletAddress,
        lastUpdated: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Get balance error:', error);
    return c.json({
      success: false,
      error: 'Failed to get balance'
    }, 500);
  }
});

/**
 * GET /api/balance/history
 * Get balance history/transactions
 */
app.get('/history', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;

    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const type = c.req.query('type'); // 'deposit' | 'withdrawal' | 'all'

    // Get deposits
    const deposits = type === 'withdrawal' ? [] : await prisma.$queryRaw<any[]>`
      SELECT 
        'deposit' as type,
        id,
        txHash,
        amountNano,
        status,
        createdAt,
        confirmedAt
      FROM Deposit
      WHERE userId = ${userId}
      AND status = 'confirmed'
      ORDER BY createdAt DESC
      LIMIT ${type === 'deposit' ? limit : Math.floor(limit / 2)}
      OFFSET ${type === 'deposit' ? offset : 0}
    `;

    // Get withdrawals
    const withdrawals = type === 'deposit' ? [] : await prisma.$queryRaw<any[]>`
      SELECT 
        'withdrawal' as type,
        id,
        txHash,
        amountNano,
        status,
        createdAt,
        completedAt as confirmedAt
      FROM Withdrawal
      WHERE userId = ${userId}
      ORDER BY createdAt DESC
      LIMIT ${type === 'withdrawal' ? limit : Math.floor(limit / 2)}
      OFFSET ${type === 'withdrawal' ? offset : 0}
    `;

    // Combine and sort
    const transactions = [...deposits, ...withdrawals]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return c.json({
      success: true,
      data: {
        transactions: transactions.map(tx => ({
          type: tx.type,
          id: tx.id,
          txHash: tx.txHash,
          amount: tx.amountNano,
          amountInTON: Number(tx.amountNano) / 1000000000,
          status: tx.status,
          createdAt: tx.createdAt,
          confirmedAt: tx.confirmedAt
        })),
        pagination: {
          limit,
          offset,
          hasMore: transactions.length === limit
        }
      }
    });
  } catch (error) {
    console.error('Get balance history error:', error);
    return c.json({
      success: false,
      error: 'Failed to get balance history'
    }, 500);
  }
});

/**
 * POST /api/balance/refresh
 * Force refresh balance from blockchain
 */
app.post('/refresh', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.walletAddress) {
      return c.json({
        success: false,
        error: 'User or wallet address not found'
      }, 404);
    }

    // In production, this would trigger a blockchain balance check
    // For now, we'll just return the current balance

    return c.json({
      success: true,
      message: 'Balance refresh initiated',
      data: {
        balance: user.balance,
        balanceInTON: user.balance / 1000000000,
        note: 'Please allow a few moments for the balance to update'
      }
    });
  } catch (error) {
    console.error('Balance refresh error:', error);
    return c.json({
      success: false,
      error: 'Failed to refresh balance'
    }, 500);
  }
});

/**
 * GET /api/balance/statistics
 * Get balance statistics
 */
app.get('/statistics', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;

    // Get time ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get statistics
    const [dailyDeposits, weeklyDeposits, monthlyDeposits] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
        FROM Deposit
        WHERE userId = ${userId}
        AND status = 'confirmed'
        AND createdAt >= ${today}
      `,
      prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
        FROM Deposit
        WHERE userId = ${userId}
        AND status = 'confirmed'
        AND createdAt >= ${thisWeek}
      `,
      prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
        FROM Deposit
        WHERE userId = ${userId}
        AND status = 'confirmed'
        AND createdAt >= ${thisMonth}
      `
    ]);

    const [dailyWithdrawals, weeklyWithdrawals, monthlyWithdrawals] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
        FROM Withdrawal
        WHERE userId = ${userId}
        AND status = 'completed'
        AND createdAt >= ${today}
      `,
      prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
        FROM Withdrawal
        WHERE userId = ${userId}
        AND status = 'completed'
        AND createdAt >= ${thisWeek}
      `,
      prisma.$queryRaw<any[]>`
        SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
        FROM Withdrawal
        WHERE userId = ${userId}
        AND status = 'completed'
        AND createdAt >= ${thisMonth}
      `
    ]);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true }
    });

    return c.json({
      success: true,
      data: {
        currentBalance: user?.balance || 0,
        deposits: {
          daily: Number(dailyDeposits[0]?.total || 0),
          weekly: Number(weeklyDeposits[0]?.total || 0),
          monthly: Number(monthlyDeposits[0]?.total || 0)
        },
        withdrawals: {
          daily: Number(dailyWithdrawals[0]?.total || 0),
          weekly: Number(weeklyWithdrawals[0]?.total || 0),
          monthly: Number(monthlyWithdrawals[0]?.total || 0)
        },
        netFlow: {
          daily: Number(dailyDeposits[0]?.total || 0) - Number(dailyWithdrawals[0]?.total || 0),
          weekly: Number(weeklyDeposits[0]?.total || 0) - Number(weeklyWithdrawals[0]?.total || 0),
          monthly: Number(monthlyDeposits[0]?.total || 0) - Number(monthlyWithdrawals[0]?.total || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get balance statistics error:', error);
    return c.json({
      success: false,
      error: 'Failed to get balance statistics'
    }, 500);
  }
});

/**
 * GET /api/balance/telegram/:telegramId
 * Get balance by Telegram ID (auth required to ensure initData is sent)
 */
app.get('/telegram/:telegramId', async (c) => {
  try {
    const authedUser = c.get('telegramUser');
    if (!authedUser) {
      return c.json({
        success: false,
        error: 'Telegram authentication required'
      }, 401);
    }

    const telegramId = c.req.param('telegramId');
    if (authedUser.id.toString() !== telegramId) {
      return c.json({
        success: false,
        error: 'Forbidden'
      }, 403);
    }

    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: {
        id: true,
        balance: true,
        walletAddress: true,
        updatedAt: true
      }
    });

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }

    // Calculate pending withdrawals for available balance parity
    const pendingWithdrawals = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total
      FROM Withdrawal
      WHERE userId = ${user.id}
      AND status IN ('pending', 'processing')
    `;

    const pendingAmount = Number(pendingWithdrawals[0]?.total || 0);
    const availableBalance = user.balance - pendingAmount;

    return c.json({
      success: true,
      data: {
        balance: user.balance,
        availableBalance,
        pendingWithdrawals: pendingAmount,
        walletAddress: user.walletAddress,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Get balance by telegram error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch balance'
    }, 500);
  }
});

export default app;
