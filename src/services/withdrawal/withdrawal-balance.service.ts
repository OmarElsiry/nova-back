import { PrismaClient } from '@prisma/client';

export interface BalanceCheckResult {
  hasBalance: boolean;
  currentBalance: number;
  requestedAmount: number;
  error?: string;
}

export interface BalanceUpdateResult {
  success: boolean;
  newBalance: number;
  error?: string;
}

export class WithdrawalBalanceService {
  constructor(private prisma: PrismaClient) {}

  async checkBalance(userId: number, amount: number): Promise<BalanceCheckResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          hasBalance: false,
          currentBalance: 0,
          requestedAmount: amount,
          error: 'User not found'
        };
      }

      const balance = this.parseBalance(user.balance);

      return {
        hasBalance: balance >= amount,
        currentBalance: balance,
        requestedAmount: amount
      };
    } catch (error: any) {
      return {
        hasBalance: false,
        currentBalance: 0,
        requestedAmount: amount,
        error: error.message || 'Failed to check balance'
      };
    }
  }

  async deductBalance(userId: number, amount: number): Promise<BalanceUpdateResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          newBalance: 0,
          error: 'User not found'
        };
      }

      const currentBalance = this.parseBalance(user.balance);

      if (currentBalance < amount) {
        return {
          success: false,
          newBalance: currentBalance,
          error: 'Insufficient balance'
        };
      }

      const newBalance = currentBalance - amount;

      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: newBalance }
      });

      return {
        success: true,
        newBalance
      };
    } catch (error: any) {
      return {
        success: false,
        newBalance: 0,
        error: error.message || 'Failed to deduct balance'
      };
    }
  }

  async refundBalance(userId: number, amount: number): Promise<BalanceUpdateResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          newBalance: 0,
          error: 'User not found'
        };
      }

      const currentBalance = this.parseBalance(user.balance);
      const newBalance = currentBalance + amount;

      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: newBalance }
      });

      return {
        success: true,
        newBalance
      };
    } catch (error: any) {
      return {
        success: false,
        newBalance: 0,
        error: error.message || 'Failed to refund balance'
      };
    }
  }

  private parseBalance(balance: any): number {
    if (typeof balance === 'string') {
      return parseFloat(balance);
    }
    if (typeof balance === 'number') {
      return balance;
    }
    return 0;
  }
}
