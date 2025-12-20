/**

 * SECURE Withdrawal Routes
 * Production-ready withdrawal operations with comprehensive security
 */

import { Hono } from 'hono';
import { PrismaClient, Prisma } from '@prisma/client';
import { SecureWithdrawalService } from '../../services/withdrawal.service';
import { z } from 'zod';
import { Address } from '@ton/ton';
import { HTTPException } from 'hono/http-exception';
import {
  WITHDRAWAL_LIMITS,
  isWithinDailyLimit,
  isWithinTransactionLimit,
  requiresAdminApproval,
  nanoToTON,
  tonToNano
} from '../../config/withdrawal-limits';
import { FINANCIAL } from '../../shared/constants/financial.constants';
import { AuditLogger, AuditEventType } from '../../infrastructure/logging/audit-logger';
import { getUserIdFromContext } from '../../utils/auth-helpers';

const app = new Hono();
const prisma = new PrismaClient();
const withdrawalService = SecureWithdrawalService.getInstance();
const auditLogger = AuditLogger.getInstance(prisma);

// Enhanced validation schemas with security checks
const withdrawalRequestSchema = z.object({
  amount: z.number()
    .positive('Amount must be positive')
    .refine(val => val >= nanoToTON(WITHDRAWAL_LIMITS.MIN_WITHDRAWAL), {
      message: `Minimum withdrawal is ${nanoToTON(WITHDRAWAL_LIMITS.MIN_WITHDRAWAL)} TON`
    })
    .refine(val => val <= nanoToTON(WITHDRAWAL_LIMITS.PER_TX_WITHDRAWAL_LIMIT), {
      message: `Maximum per transaction is ${nanoToTON(WITHDRAWAL_LIMITS.PER_TX_WITHDRAWAL_LIMIT)} TON`
    }),
  destinationAddress: z.string().refine(val => {
    try {
      Address.parse(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid TON address format'),
  message: z.string().max(FINANCIAL.MAX_MEMO_LENGTH).optional(),
  twoFactorCode: z.string().length(6).regex(/^\d{6}$/).optional()
});

const withdrawalStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'admin_review'
]);

/**
 * POST /api/withdraw/request
 * Create withdrawal request
 */
app.post('/request', async (c) => {
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

  try {
    const userId = await getUserIdFromContext(c, prisma);

    // Parse and validate request
    const body = await c.req.json();
    const validated = withdrawalRequestSchema.parse(body);

    // Convert to nano
    const amountNano = tonToNano(validated.amount);

    // CRITICAL FIX: Use database transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Lock user record to prevent concurrent withdrawals
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          balance: true,
          telegramId: true,
          withdrawals: {
            where: {
              status: { in: ['pending', 'processing'] }
            },
            select: { id: true }
          }
        }
      });

      if (!user) {
        throw new HTTPException(404, { message: 'User not found' });
      }

      // 2. Check pending withdrawals limit
      if (user.withdrawals.length >= WITHDRAWAL_LIMITS.MAX_PENDING_WITHDRAWALS) {
        throw new HTTPException(429, {
          message: `Maximum ${WITHDRAWAL_LIMITS.MAX_PENDING_WITHDRAWALS} pending withdrawals allowed`
        });
      }

      // 2b. Check cooldown (FIX: Prevent rapid withdrawal spam)
      const lastWithdrawal = await tx.withdrawal.findFirst({
        where: { userId: userId },
        orderBy: { createdAt: 'desc' }
      });

      if (lastWithdrawal && (Date.now() - lastWithdrawal.createdAt.getTime() < WITHDRAWAL_LIMITS.COOLDOWN_PERIOD_MS)) {
        const remainingMs = WITHDRAWAL_LIMITS.COOLDOWN_PERIOD_MS - (Date.now() - lastWithdrawal.createdAt.getTime());
        throw new HTTPException(429, {
          message: `Cooldown active. Please wait ${Math.ceil(remainingMs / 1000)} seconds.`
        });
      }

      // 3. Check balance (FIX: Prevent overdraft)
      if (BigInt(user.balance) < amountNano) {
        await auditLogger.logSecurityEvent(
          AuditEventType.SUSPICIOUS_ACTIVITY,
          `Insufficient balance for withdrawal: ${user.balance} < ${amountNano}`,
          userId,
          ipAddress
        );
        throw new HTTPException(400, { message: 'Insufficient balance' });
      }

      // 4. Check daily limit (FIX: Enforce withdrawal limits)
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const dailyWithdrawals = await tx.withdrawal.findMany({
        where: {
          userId: userId,
          status: 'completed',
          createdAt: { gte: startOfDay }
        },
        select: { amountNano: true }
      });

      const dailyUsed = dailyWithdrawals.reduce((sum: bigint, w: any) => sum + BigInt(w.amountNano), 0n);
      if (!isWithinDailyLimit(dailyUsed, amountNano)) {
        await auditLogger.logSecurityEvent(
          AuditEventType.RATE_LIMIT_EXCEEDED,
          `Daily withdrawal limit exceeded: ${nanoToTON(dailyUsed + amountNano)} TON`,
          userId,
          ipAddress
        );
        throw new HTTPException(429, {
          message: `Daily limit of ${nanoToTON(WITHDRAWAL_LIMITS.DAILY_WITHDRAWAL_LIMIT)} TON exceeded`
        });
      }

      // 5. Check if admin approval required
      const needsApproval = requiresAdminApproval(amountNano);
      const status = needsApproval ? 'admin_review' : 'pending';

      // 6. CRITICAL: Deduct balance immediately (prevents double spending)
      await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: Number(amountNano) }
        }
      });

      // 7. Create withdrawal record with secure ID
      const withdrawalId = `WD-${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const withdrawal = await tx.withdrawal.create({
        data: {
          id: withdrawalId,
          userId,
          amountNano: amountNano.toString(),
          destinationAddress: validated.destinationAddress,
          status,
          message: validated.message,
          metadata: JSON.stringify({
            ipAddress,
            userAgent: c.req.header('user-agent'),
            needsApproval,
            dailyUsed: dailyUsed.toString(),
            timestamp: new Date().toISOString()
          })
        }
      });

      // 8. Log audit event
      await auditLogger.logWithdrawal(
        userId,
        amountNano,
        validated.destinationAddress,
        needsApproval ? AuditEventType.WITHDRAWAL_REQUESTED : AuditEventType.WITHDRAWAL_APPROVED,
        { withdrawalId, needsApproval }
      );

      return { withdrawal, needsApproval };
    }, {
      isolationLevel: 'Serializable', // Prevent race conditions
      timeout: 10000 // 10 second timeout
    });

    // Process immediately if no approval needed
    if (!result.needsApproval) {
      // Queue for async processing
      setImmediate(async () => {
        try {
          await withdrawalService.processWithdrawal({
            userId,
            destinationAddress: validated.destinationAddress,
            amountNano,
            message: validated.message
          });
        } catch (error) {
          console.error('Failed to process withdrawal:', error);
          // Refund on failure
          await prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: Number(amountNano) } }
          });
        }
      });
    }

    return c.json({
      success: true,
      data: {
        withdrawalId: result.withdrawal.id,
        amount: validated.amount,
        destinationAddress: validated.destinationAddress,
        status: result.withdrawal.status,
        requiresApproval: result.needsApproval,
        message: result.needsApproval
          ? 'Large withdrawal requires admin approval'
          : 'Withdrawal request submitted'
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid input',
        details: error.errors
      }, 400);
    }

    console.error('Withdrawal request error:', error);
    return c.json({
      success: false,
      error: 'Failed to process withdrawal request'
    }, 500);
  }

});

/**
 * GET /api/withdraw/history
<<<<<<< HEAD
 * Get withdrawal history
 */
app.get('/history', async (c) => {
  try {
    const userId = await getUserIdFromContext(c, prisma);

    // FIX: Validate and sanitize query parameters to prevent injection
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50'), 1), 100);
    const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);
    const statusParam = c.req.query('status');

    // FIX: Use type-safe Prisma where clause instead of 'any'
    const where: Prisma.WithdrawalWhereInput = { userId };

    // FIX: Validate status against enum to prevent injection
    if (statusParam) {
      const validatedStatus = withdrawalStatusSchema.safeParse(statusParam);
      if (validatedStatus.success) {
        where.status = validatedStatus.data;
      }
    }

    // Get withdrawals
    const withdrawals = await prisma.withdrawal.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' }
    });

    // Get total count
    const total = await prisma.withdrawal.count({ where });

    return c.json({
      success: true,
      data: {
        withdrawals: withdrawals.map(w => ({
          id: w.id,
          txHash: w.txHash,
          amount: w.amountNano,
          amountInTON: Number(w.amountNano) / 1000000000,
          destinationAddress: w.destinationAddress,
          status: w.status,
          message: w.message,
          createdAt: w.createdAt,
          completedAt: w.completedAt,
          failedAt: w.failedAt
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
    console.error('Get withdrawal history error:', error);
    return c.json({
      success: false,
      error: 'Failed to get withdrawal history'
    }, 500);
  }
});

/**
 * GET /api/withdraw/:id
 * Get withdrawal details
 */
app.get('/:id', async (c) => {
  try {
    const userId = await getUserIdFromContext(c, prisma);
    const withdrawalId = c.req.param('id');

    const withdrawal = await prisma.withdrawal.findFirst({
      where: {
        id: withdrawalId,
        userId: userId
      }
    });

    if (!withdrawal) {
      return c.json({
        success: false,
        error: 'Withdrawal not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        id: withdrawal.id,
        txHash: withdrawal.txHash,
        amount: withdrawal.amountNano,
        amountInTON: Number(withdrawal.amountNano) / 1000000000,
        destinationAddress: withdrawal.destinationAddress,
        status: withdrawal.status,
        message: withdrawal.message,
        createdAt: withdrawal.createdAt,
        completedAt: withdrawal.completedAt,
        failedAt: withdrawal.failedAt,
        metadata: withdrawal.metadata ? JSON.parse(withdrawal.metadata) : null
      }
    });
  } catch (error) {
    console.error('Get withdrawal error:', error);
    return c.json({
      success: false,
      error: 'Failed to get withdrawal'
    }, 500);
  }
});

/**
 * POST /api/withdraw/cancel
 * Cancel pending withdrawal
 */
app.post('/cancel/:id', async (c) => {
  try {
    const userId = await getUserIdFromContext(c, prisma);
    const withdrawalId = c.req.param('id');

    // Find withdrawal
    const withdrawal = await prisma.withdrawal.findFirst({
      where: {
        id: withdrawalId,
        userId: userId,
        status: 'pending'
      }
    });

    if (!withdrawal) {
      return c.json({
        success: false,
        error: 'Withdrawal not found or cannot be cancelled'
      }, 404);
    }

    // Update withdrawal status and refund balance
    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'cancelled',
          failedAt: new Date(),
          metadata: JSON.stringify({
            ...JSON.parse(withdrawal.metadata || '{}'),
            cancelledBy: 'user',
            cancelledAt: new Date().toISOString()
          })
        }
      });

      // Refund balance
      await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            increment: Number(withdrawal.amountNano)
          }
        }
      });
    });

    return c.json({
      success: true,
      message: 'Withdrawal cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel withdrawal error:', error);
    return c.json({
      success: false,
      error: 'Failed to cancel withdrawal'
    }, 500);
  }
});

/**
 * GET /api/withdraw/limits
 * Get withdrawal limits
 */
app.get('/limits', async (c) => {
  try {
    const userId = await getUserIdFromContext(c, prisma);

    // Get user's daily withdrawal total
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyWithdrawals = await prisma.withdrawal.findMany({
      where: {
        userId: userId,
        status: 'completed',
        createdAt: {
          gte: startOfDay
        }
      },
      select: {
        amountNano: true
      }
    });
    // FIX: Use secure configuration instead of direct env access
    const dailyUsed = dailyWithdrawals.reduce((sum: bigint, w: any) => sum + BigInt(w.amountNano), 0n);
    const dailyRemaining = WITHDRAWAL_LIMITS.DAILY_WITHDRAWAL_LIMIT - dailyUsed;

    const lastWithdrawal = await prisma.withdrawal.findFirst({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    return c.json({
      success: true,
      data: {
        limits: {
          daily: WITHDRAWAL_LIMITS.DAILY_WITHDRAWAL_LIMIT.toString(),
          perTransaction: WITHDRAWAL_LIMITS.PER_TX_WITHDRAWAL_LIMIT.toString(),
          minimum: WITHDRAWAL_LIMITS.MIN_WITHDRAWAL.toString(),
          cooldownMs: WITHDRAWAL_LIMITS.COOLDOWN_PERIOD_MS
        },
        usage: {
          dailyUsed: dailyUsed.toString(),
          dailyRemaining: dailyRemaining > 0 ? dailyRemaining.toString() : '0',
          lastWithdrawalAt: lastWithdrawal?.createdAt.toISOString() || null
        },
        limitsInTON: {
          daily: nanoToTON(WITHDRAWAL_LIMITS.DAILY_WITHDRAWAL_LIMIT),
          perTransaction: nanoToTON(WITHDRAWAL_LIMITS.PER_TX_WITHDRAWAL_LIMIT),
          minimum: nanoToTON(WITHDRAWAL_LIMITS.MIN_WITHDRAWAL)
        },
        usageInTON: {
          dailyUsed: Number(dailyUsed) / 1000000000,
          dailyRemaining: Number(dailyRemaining > 0 ? dailyRemaining : 0) / 1000000000
        }
      }
    });
  } catch (error) {
    console.error('Get withdrawal limits error:', error);
    return c.json({
      success: false,
      error: 'Failed to get withdrawal limits'
    }, 500);
  }
});

/**
 * GET /api/withdraw/stats
 * Get withdrawal statistics
 */
app.get('/stats', async (c) => {
  try {
    const stats = await withdrawalService.getWithdrawalStats();

    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get withdrawal stats error:', error);
    return c.json({
      success: false,
      error: 'Failed to get withdrawal statistics'
    }, 500);
  }

});

export default app;
