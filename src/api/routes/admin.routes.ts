/**
 * Admin Routes
 * Administrative operations requiring elevated permissions
 */

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { SecureWithdrawalService } from '../../services/withdrawal.service';
import { z } from 'zod';

const app = new Hono();
const prisma = new PrismaClient();
const withdrawalService = SecureWithdrawalService.getInstance();

/**
 * GET /api/admin/dashboard
 * Admin dashboard statistics
 */
app.get('/dashboard', async (c) => {
  try {
    const payload = c.get('telegramUser');

    // Get system statistics
    const [userCount, totalDeposits, totalWithdrawals, pendingWithdrawals] = await Promise.all([
      prisma.user.count(),
      prisma.$queryRaw<any[]>`SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total FROM deposits WHERE status = 'confirmed'`,
      prisma.$queryRaw<any[]>`SELECT COALESCE(SUM(CAST(amountNano AS BIGINT)), 0) as total FROM withdrawals WHERE status = 'completed'`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM withdrawals WHERE status = 'admin_review'`
    ]);

    return c.json({
      success: true,
      data: {
        users: {
          total: userCount
        },
        deposits: {
          total: totalDeposits[0]?.total || 0,
          totalInTON: Number(totalDeposits[0]?.total || 0) / 1000000000
        },
        withdrawals: {
          total: totalWithdrawals[0]?.total || 0,
          totalInTON: Number(totalWithdrawals[0]?.total || 0) / 1000000000,
          pending: pendingWithdrawals[0]?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return c.json({
      success: false,
      error: 'Failed to get dashboard data'
    }, 500);
  }
});

/**
 * GET /api/admin/users
 * List all users
 */
app.get('/users', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const users = await prisma.user.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.user.count();

    return c.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    return c.json({
      success: false,
      error: 'Failed to list users'
    }, 500);
  }
});

/**
 * POST /api/admin/withdrawals/approve/:id
 * Approve pending withdrawal
 */
app.post('/withdrawals/approve/:id', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const withdrawalId = c.req.param('id');
    const adminId = payload.id;

    const success = await withdrawalService.approveWithdrawal(withdrawalId, adminId);

    if (!success) {
      return c.json({
        success: false,
        error: 'Failed to approve withdrawal'
      }, 400);
    }

    return c.json({
      success: true,
      message: 'Withdrawal approved successfully'
    });
  } catch (error) {
    console.error('Admin approve withdrawal error:', error);
    return c.json({
      success: false,
      error: 'Failed to approve withdrawal'
    }, 500);
  }
});

/**
 * POST /api/admin/withdrawals/reject/:id
 * Reject pending withdrawal
 */
app.post('/withdrawals/reject/:id', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const withdrawalId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      reason: z.string().min(5).max(200).optional()
    });

    const result = schema.safeParse(body);
    if (!result.success) {
      return c.json({
        success: false,
        error: 'Invalid reason: Must be between 5 and 200 characters'
      }, 400);
    }

    const reason = result.data.reason || 'Admin rejected';

    // Update withdrawal status
    // Update withdrawal status securely
    await prisma.withdrawal.update({
      where: {
        id: withdrawalId,
        status: 'admin_review' // Ensure we only update if still in review
      },
      data: {
        status: 'rejected',
        failedAt: new Date(),
        metadata: JSON.stringify({
          rejectionReason: reason,
          rejectedBy: payload.id,
          rejectedAt: new Date().toISOString()
        })
      }
    });

    return c.json({
      success: true,
      message: 'Withdrawal rejected successfully'
    });
  } catch (error) {
    console.error('Admin reject withdrawal error:', error);
    return c.json({
      success: false,
      error: 'Failed to reject withdrawal'
    }, 500);
  }
});

export default app;
