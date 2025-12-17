/**
 * Deposit Routes
 * Handle deposit operations and monitoring
 */

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { SecureDepositService } from '../../services/secure-deposit.service';
import { DepositService } from '../../services/deposit.service';
import { z } from 'zod';

const app = new Hono();
const prisma = new PrismaClient();
const depositService = new DepositService(prisma);
const secureDepositService = SecureDepositService.getInstance();

// Validation schemas
const generateAddressSchema = z.object({
  userId: z.number(),
  label: z.string().optional()
});

/**
 * GET /api/deposit/address
 * Get user's deposit address
 */
app.get('/address', async (c) => {
  try {
    // Get user from Telegram auth context (set by auth middleware)
    const payload = c.get('telegramUser');
    const userId = payload.id;

    // Get or create deposit address for user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }

    // Return the main deposit wallet address for now
    // In production, you might generate unique addresses per user
    const depositAddress = process.env.DEPOSIT_WALLET_ADDRESS;

    return c.json({
      success: true,
      data: {
        address: depositAddress,
        userId: userId,
        message: `Send TON to this address. Include your user ID ${userId} in the message.`
      }
    });
  } catch (error) {
    console.error('Get deposit address error:', error);
    return c.json({
      success: false,
      error: 'Failed to get deposit address'
    }, 500);
  }
});

/**
 * GET /api/deposit/history
 * Get user's deposit history
 */
app.get('/history', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;

    // Get query parameters
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status');

    // Build query
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    // Get deposits
    const deposits = await prisma.deposit.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' }
    });

    // Get total count
    const total = await prisma.deposit.count({ where });

    return c.json({
      success: true,
      data: {
        deposits: deposits.map(d => ({
          id: d.id,
          txHash: d.txHash,
          amount: d.amountNano,
          status: d.status,
          confirmations: d.confirmationDepth,
          createdAt: d.createdAt,
          confirmedAt: d.confirmedAt
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    });
  } catch (error) {
    console.error('Get deposit history error:', error);
    return c.json({
      success: false,
      error: 'Failed to get deposit history'
    }, 500);
  }
});

/**
 * GET /api/deposit/:id
 * Get specific deposit details
 */
app.get('/:id', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;
    const depositId = c.req.param('id');

    const deposit = await prisma.deposit.findFirst({
      where: {
        id: depositId,
        userId: userId
      }
    });

    if (!deposit) {
      return c.json({
        success: false,
        error: 'Deposit not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: deposit.id,
        txHash: deposit.txHash,
        amount: deposit.amountNano,
        status: deposit.status,
        confirmations: deposit.confirmationDepth,
        reorgSafe: deposit.reorgSafe,
        createdAt: deposit.createdAt,
        confirmedAt: deposit.confirmedAt,
        metadata: deposit.metadata ? JSON.parse(deposit.metadata) : null
      }
    });
  } catch (error) {
    console.error('Get deposit error:', error);
    return c.json({
      success: false,
      error: 'Failed to get deposit'
    }, 500);
  }
});

/**
 * POST /api/deposit/notify
 * Notify system of potential deposit (webhook)
 */
app.post('/notify', async (c) => {
  try {
    const body = await c.req.json();

    // Validate webhook signature if configured
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = c.req.header('X-Webhook-Signature');
      // TODO: Implement signature validation
    }

    // Log notification for processing
    console.log('Deposit notification received:', body);

    // The actual processing happens via the monitoring service
    // This endpoint just acknowledges receipt

    return c.json({
      success: true,
      message: 'Notification received'
    });
  } catch (error) {
    console.error('Deposit notification error:', error);
    return c.json({
      success: false,
      error: 'Failed to process notification'
    }, 500);
  }
});

/**
 * GET /api/deposit/stats
 * Get deposit statistics
 */
app.get('/stats', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;

    const stats = await secureDepositService.getDepositStats();

    // Get user-specific stats manually because amountNano is String
    const userDeposits = await prisma.deposit.findMany({
      where: {
        userId: userId,
        status: 'confirmed'
      },
      select: { amountNano: true }
    });

    const totalAmount = userDeposits.reduce((acc: bigint, curr: any) => {
      return acc + BigInt(curr.amountNano || '0');
    }, BigInt(0)).toString();

    return c.json({
      success: true,
      data: {
        global: stats,
        user: {
          totalDeposits: userDeposits.length,
          totalAmount: totalAmount
        }
      }
    });
  } catch (error) {
    console.error('Get deposit stats error:', error);
    return c.json({
      success: false,
      error: 'Failed to get deposit statistics'
    }, 500);
  }
});

/**
 * POST /api/deposit/check
 * Manually check for deposits
 */
app.post('/check', async (c) => {
  try {
    const payload = c.get('telegramUser');
    const userId = payload.id;

    // This would trigger a manual check for the user's deposits
    // In production, this might be rate-limited

    return c.json({
      success: true,
      message: 'Deposit check initiated',
      note: 'Please allow a few moments for deposits to be detected'
    });
  } catch (error) {
    console.error('Deposit check error:', error);
    return c.json({
      success: false,
      error: 'Failed to initiate deposit check'
    }, 500);
  }
});

export default app;
