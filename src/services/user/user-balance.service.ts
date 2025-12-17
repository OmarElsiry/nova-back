import { PrismaClient } from '@prisma/client';

export interface BalanceResult {
  success: boolean;
  balance?: number;
  error?: string;
}

export interface TransferResult {
  success: boolean;
  fromBalance?: number;
  toBalance?: number;
  amount?: number;
  error?: string;
}

export class UserBalanceService {
  constructor(private prisma: PrismaClient) {}

  async getBalance(userId: number): Promise<BalanceResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const balance = this.parseBalance(user.balance);

      return {
        success: true,
        balance
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get balance'
      };
    }
  }

  async addBalance(userId: number, amount: number): Promise<BalanceResult> {
    if (amount <= 0) {
      return {
        success: false,
        error: 'Amount must be positive'
      };
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
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
        balance: newBalance
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to add balance'
      };
    }
  }

  async deductBalance(userId: number, amount: number): Promise<BalanceResult> {
    if (amount <= 0) {
      return {
        success: false,
        error: 'Amount must be positive'
      };
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const currentBalance = this.parseBalance(user.balance);
      
      if (currentBalance < amount) {
        return {
          success: false,
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
        balance: newBalance
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to deduct balance'
      };
    }
  }

  async transferBalance(
    fromUserId: number,
    toUserId: number,
    amount: number
  ): Promise<TransferResult> {
    if (amount <= 0) {
      return {
        success: false,
        error: 'Amount must be positive'
      };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Get both users
        const [fromUser, toUser] = await Promise.all([
          tx.user.findUnique({ where: { id: fromUserId } }),
          tx.user.findUnique({ where: { id: toUserId } })
        ]);

        if (!fromUser || !toUser) {
          throw new Error('User not found');
        }

        const fromBalance = this.parseBalance(fromUser.balance);
        const toBalance = this.parseBalance(toUser.balance);

        if (fromBalance < amount) {
          throw new Error('Insufficient balance');
        }

        // Update balances
        const newFromBalance = fromBalance - amount;
        const newToBalance = toBalance + amount;

        await tx.user.update({
          where: { id: fromUserId },
          data: { balance: newFromBalance }
        });

        await tx.user.update({
          where: { id: toUserId },
          data: { balance: newToBalance }
        });

        return {
          fromBalance: newFromBalance,
          toBalance: newToBalance
        };
      });

      return {
        success: true,
        fromBalance: result.fromBalance,
        toBalance: result.toBalance,
        amount
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Transfer failed'
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
