import { PrismaClient } from '@prisma/client';
import { WithdrawalValidationService } from './withdrawal-validation.service';
import { FINANCIAL } from '../../shared/constants/financial.constants';

export interface ProcessingResult {
  success: boolean;
  withdrawalId?: string | number;
  error?: string;
  details?: any;
}

export interface WithdrawalStatus {
  id: number;
  userId: number;
  amount: number;
  status: string;
  walletAddress: string;
  createdAt: Date;
  processedAt?: Date;
}

export class WithdrawalProcessingService {
  private validationService: WithdrawalValidationService;

  constructor(private prisma: PrismaClient) {
    this.validationService = new WithdrawalValidationService();
  }

  async createWithdrawalRequest(
    userId: number,
    amount: number,
    walletAddress: string,
    memo?: string
  ): Promise<ProcessingResult> {
    try {
      // Validate request
      const validation = this.validationService.validateRequest({
        userId,
        amount,
        walletAddress,
        memo
      });

      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors?.join(', ')
        };
      }

      // Check user balance
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const userBalance = typeof user.balance === 'string'
        ? parseFloat(user.balance)
        : user.balance;

      const balanceValidation = this.validationService.validateWithdrawalAmount(
        amount,
        userBalance
      );

      if (!balanceValidation.isValid) {
        return {
          success: false,
          error: balanceValidation.errors?.join(', ')
        };
      }

      // Create withdrawal request
      const withdrawal = await this.prisma.withdrawal.create({
        data: {
          id: `wd_${userId}_${Date.now()}`,
          userId,
          amountNano: (amount * 1e9).toString(), // Convert to nanotons
          destinationAddress: this.validationService.sanitizeWalletAddress(walletAddress),
          status: 'pending',
          metadata: JSON.stringify({
            fee: this.calculateFee(amount),
            memo: memo
          })
        }
      });

      // Deduct from user balance (hold the amount)
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          balance: userBalance - amount
        }
      });

      // Create transaction record
      await this.prisma.transaction.create({
        data: {
          userId,
          amount,
          type: 'withdrawal',
          status: 'pending',
          txHash: `withdrawal_${withdrawal.id}_${Date.now()}`
        }
      });

      return {
        success: true,
        withdrawalId: 0, // Return a numeric ID for compatibility
        details: withdrawal
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create withdrawal request'
      };
    }
  }

  async processWithdrawal(
    withdrawalId: string,
    txHash?: string
  ): Promise<ProcessingResult> {
    try {
      const withdrawal = await this.prisma.withdrawal.findUnique({
        where: { id: withdrawalId }
      });

      if (!withdrawal) {
        return {
          success: false,
          error: 'Withdrawal not found'
        };
      }

      if (withdrawal.status !== 'pending') {
        return {
          success: false,
          error: 'Withdrawal already processed'
        };
      }

      // Update withdrawal status
      await this.prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          txHash: txHash || `processed_${withdrawalId}_${Date.now()}`
        }
      });

      // Update transaction
      const amountInTon = parseFloat(withdrawal.amountNano) / 1e9;
      await this.prisma.transaction.updateMany({
        where: {
          userId: withdrawal.userId,
          amount: amountInTon,
          type: 'withdrawal',
          status: 'pending'
        },
        data: {
          status: 'completed',
          txHash: txHash || `processed_${withdrawalId}_${Date.now()}`
        }
      });

      return {
        success: true,
        withdrawalId,
        details: { status: 'completed', txHash }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to process withdrawal'
      };
    }
  }

  async cancelWithdrawal(withdrawalId: string): Promise<ProcessingResult> {
    try {
      const withdrawal = await this.prisma.withdrawal.findUnique({
        where: { id: withdrawalId }
      });

      if (!withdrawal) {
        return {
          success: false,
          error: 'Withdrawal not found'
        };
      }

      if (withdrawal.status !== 'pending') {
        return {
          success: false,
          error: 'Can only cancel pending withdrawals'
        };
      }

      // Refund the amount to user
      const user = await this.prisma.user.findUnique({
        where: { id: withdrawal.userId }
      });

      if (user) {
        const currentBalance = typeof user.balance === 'string'
          ? parseFloat(user.balance)
          : user.balance;

        const amountInTon = parseFloat(withdrawal.amountNano) / 1e9;
        await this.prisma.user.update({
          where: { id: withdrawal.userId },
          data: {
            balance: currentBalance + amountInTon
          }
        });
      }

      // Update withdrawal status
      await this.prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'cancelled' }
      });

      // Update transaction
      const amountInTon = parseFloat(withdrawal.amountNano) / 1e9;
      await this.prisma.transaction.updateMany({
        where: {
          userId: withdrawal.userId,
          amount: amountInTon,
          type: 'withdrawal',
          status: 'pending'
        },
        data: { status: 'failed' }
      });

      return {
        success: true,
        withdrawalId,
        details: { status: 'cancelled' }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to cancel withdrawal'
      };
    }
  }

  private calculateFee(amount: number): number {
    // Percentage fee with minimum
    const fee = amount * (FINANCIAL.WITHDRAWAL_FEE_PERCENT / 100);
    return Math.max(fee, FINANCIAL.WITHDRAWAL_MIN_FEE_TON);
  }

  async getWithdrawalHistory(userId: number, limit = 10): Promise<any[]> {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async getPendingWithdrawals(): Promise<any[]> {
    return this.prisma.withdrawal.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            walletAddress: true
          }
        }
      }
    });
  }
}
