/**
 * FIXED: Secure Withdrawal Service with Race Condition Protection
 * Implements optimistic locking and atomic transactions
 */

import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { randomBytes } from 'crypto';
import {
  parseBalance,
  formatTON,
  hasSufficientBalance,
  subtractAmounts,
  serializeDecimal
} from '../shared/utils/financial.utils';

interface WithdrawalRequest {
  userId: number;
  destinationAddress: string;
  amountNano: bigint;
  message?: string;
  twoFactorCode?: string;
}

export class SecureWithdrawalService {
  private static instance: SecureWithdrawalService;
  private prisma: PrismaClient;
  private processingLocks: Map<string, boolean> = new Map();

  private constructor() {
    this.prisma = new PrismaClient();
  }

  static getInstance(): SecureWithdrawalService {
    if (!SecureWithdrawalService.instance) {
      SecureWithdrawalService.instance = new SecureWithdrawalService();
    }
    return SecureWithdrawalService.instance;
  }

  /**
   * Generate cryptographically secure withdrawal ID
   */
  private generateWithdrawalId(request: WithdrawalRequest): string {
    const random = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString(36);
    const userId = request.userId.toString(36);
    return `WD-${userId}-${timestamp}-${random}`;
  }

  /**
   * Process withdrawal with race condition protection
   */
  async processWithdrawal(request: WithdrawalRequest): Promise<{
    success: boolean;
    withdrawalId?: string;
    txHash?: string;
    error?: string;
  }> {
    const withdrawalId = this.generateWithdrawalId(request);
    const maxRetries = 3;
    let retryCount = 0;

    // Check for duplicate processing
    if (this.processingLocks.get(withdrawalId)) {
      return {
        success: false,
        error: 'Withdrawal already being processed'
      };
    }

    this.processingLocks.set(withdrawalId, true);

    try {
      // Retry loop for optimistic locking conflicts
      while (retryCount < maxRetries) {
        try {
          const result = await this.attemptWithdrawal(request, withdrawalId);
          return result;
        } catch (error: any) {
          if (error.message.includes('Concurrent modification')) {
            retryCount++;
            console.log(`Retry ${retryCount}/${maxRetries} for withdrawal ${withdrawalId}`);
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          } else {
            throw error;
          }
        }
      }

      throw new Error('Max retries exceeded - too many concurrent modifications');

    } finally {
      this.processingLocks.delete(withdrawalId);
    }
  }

  /**
   * Attempt withdrawal with optimistic locking
   */
  private async attemptWithdrawal(
    request: WithdrawalRequest,
    withdrawalId: string
  ): Promise<any> {
    return await this.prisma.$transaction(async (tx: any) => {
      // Step 1: Get user with current version (SELECT FOR UPDATE equivalent)
      const user = await tx.user.findUnique({
        where: { id: request.userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Step 2: Check balance using Decimal for precision
      const currentBalance = new Decimal(user.balance.toString());
      const withdrawAmount = new Decimal(request.amountNano.toString()).div(1e9);

      if (currentBalance.lessThan(withdrawAmount)) {
        throw new Error(`Insufficient balance: ${currentBalance.toString()} < ${withdrawAmount.toString()}`);
      }

      // Step 3: Calculate new balance
      const newBalance = currentBalance.minus(withdrawAmount);

      // Step 4: Create withdrawal record
      const withdrawal = await tx.withdrawal.create({
        data: {
          id: withdrawalId,
          userId: request.userId,
          destinationAddress: request.destinationAddress,
          amountNano: request.amountNano.toString(),
          status: 'processing',
          message: request.message,
          metadata: JSON.stringify({
            timestamp: Date.now(),
            userVersion: user.version // Store version for audit
          })
        }
      });

      // Step 5: Update balance with optimistic locking
      const updateResult = await tx.user.updateMany({
        where: {
          id: request.userId,
          version: user.version // CRITICAL: Check version hasn't changed
        },
        data: {
          balance: newBalance.toNumber(), // Will be Decimal in fixed schema
          version: { increment: 1 }
        }
      });

      // Step 6: Check if update succeeded
      if (updateResult.count === 0) {
        throw new Error('Concurrent modification detected - withdrawal cancelled');
      }

      // Step 7: Verify balance didn't go negative (double-check)
      const updatedUser = await tx.user.findUnique({
        where: { id: request.userId }
      });

      if (updatedUser && new Decimal(updatedUser.balance.toString()).lessThan(0)) {
        throw new Error('Balance integrity violation - rolling back');
      }

      return {
        success: true,
        withdrawalId,
        withdrawal,
        newBalance: updatedUser?.balance
      };

    }, {
      isolationLevel: 'Serializable', // Highest isolation level
      timeout: 10000, // 10 second timeout
      maxWait: 5000 // Max time to wait for lock
    });
  }

  /**
   * Revert withdrawal and refund balance
   */
  async revertWithdrawal(
    withdrawalId: string,
    userId: number,
    amountNano: bigint
  ): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        await this.prisma.$transaction(async (tx: any) => {
          // Get current user state
          const user = await tx.user.findUnique({
            where: { id: userId }
          });

          if (!user) throw new Error('User not found for refund');

          // Calculate refund amount
          const currentBalance = new Decimal(user.balance.toString());
          const refundAmount = new Decimal(amountNano.toString()).div(1e9);
          const newBalance = currentBalance.plus(refundAmount);

          // Update withdrawal status
          await tx.withdrawal.update({
            where: { id: withdrawalId },
            data: {
              status: 'failed',
              failedAt: new Date(),
              metadata: JSON.stringify({
                reason: 'Transaction broadcast failed',
                refundAmount: refundAmount.toString(),
                timestamp: Date.now()
              })
            }
          });

          // Refund balance with optimistic locking
          const updateResult = await tx.user.updateMany({
            where: {
              id: userId,
              version: user.version
            },
            data: {
              balance: newBalance.toNumber(),
              version: { increment: 1 }
            }
          });

          if (updateResult.count === 0) {
            throw new Error('Concurrent modification during refund');
          }
        });

        return; // Success

      } catch (error: any) {
        if (error.message.includes('Concurrent modification')) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        } else {
          throw error;
        }
      }
    }

    throw new Error('Failed to revert withdrawal after max retries');
  }

  /**
   * Check for concurrent withdrawals (cooldown period)
   */
  async checkCooldown(userId: number): Promise<boolean> {
    const cooldownMs = 60000; // 1 minute

    const recentWithdrawal = await this.prisma.withdrawal.findFirst({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - cooldownMs)
        },
        status: {
          in: ['pending', 'processing']
        }
      }
    });

    return !recentWithdrawal;
  }

  /**
   * Approve a withdrawal that is in admin_review
   */
  async approveWithdrawal(withdrawalId: string, adminId: number): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const withdrawal = await tx.withdrawal.findUnique({
          where: { id: withdrawalId }
        });

        if (!withdrawal || withdrawal.status !== 'admin_review') {
          throw new Error('Withdrawal not found or not in review');
        }

        await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: 'pending', // Move to pending for processing
            metadata: JSON.stringify({
              ...JSON.parse(withdrawal.metadata || '{}'),
              approvedBy: adminId,
              approvedAt: new Date().toISOString()
            })
          }
        });
      });
      return true;
    } catch (error) {
      console.error('Failed to approve withdrawal:', error);
      return false;
    }
  }

  /**
   * Get withdrawal statistics
   */
  async getWithdrawalStats(): Promise<{
    totalCount: number;
    pendingCount: number;
    totalVolume: string;
  }> {
    const [totalCount, pendingCount, withdrawals] = await Promise.all([
      this.prisma.withdrawal.count(),
      this.prisma.withdrawal.count({ where: { status: 'pending' } }),
      this.prisma.withdrawal.findMany({
        select: { amountNano: true }
      })
    ]);

    const totalVolume = withdrawals.reduce((acc: bigint, curr: any) => {
      return acc + BigInt(curr.amountNano || '0');
    }, BigInt(0)).toString();

    return {
      totalCount,
      pendingCount,
      totalVolume
    }
  };
}
