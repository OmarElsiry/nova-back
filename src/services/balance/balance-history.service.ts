import { PrismaClient } from '@prisma/client';

export interface BalanceChange {
  userId: number;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'purchase' | 'refund';
  timestamp: Date;
  description?: string;
}

export interface BalanceHistory {
  userId: number;
  changes: BalanceChange[];
  currentBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
}

export class BalanceHistoryService {
  constructor(private prisma: PrismaClient) {}

  async getUserBalanceHistory(
    userId: number,
    limit = 50
  ): Promise<BalanceHistory> {
    // Get user's current balance
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get transactions
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // Convert transactions to balance changes
    const changes: BalanceChange[] = transactions.map(tx => ({
      userId: tx.userId,
      amount: typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount,
      type: tx.type as any,
      timestamp: tx.createdAt,
      description: tx.txHash || undefined
    }));

    // Calculate totals
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    changes.forEach(change => {
      if (change.type === 'deposit') {
        totalDeposits += change.amount;
      } else if (change.type === 'withdrawal') {
        totalWithdrawals += change.amount;
      }
    });

    return {
      userId,
      changes,
      currentBalance: this.parseBalance(user.balance),
      totalDeposits,
      totalWithdrawals
    };
  }

  async getBalanceAtDate(
    userId: number,
    date: Date
  ): Promise<number> {
    // Get all transactions up to the specified date
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        createdAt: { lte: date }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Calculate balance at that point
    let balance = 0;
    transactions.forEach(tx => {
      const amount = typeof tx.amount === 'string' 
        ? parseFloat(tx.amount) 
        : tx.amount;
      
      if (tx.type === 'deposit') {
        balance += amount;
      } else if (tx.type === 'withdrawal') {
        balance -= amount;
      }
    });

    return balance;
  }

  async getBalanceChangeSummary(
    userId: number,
    startDate: Date,
    endDate: Date
  ): Promise<{
    startBalance: number;
    endBalance: number;
    change: number;
    percentageChange: number;
  }> {
    const startBalance = await this.getBalanceAtDate(userId, startDate);
    const endBalance = await this.getBalanceAtDate(userId, endDate);
    const change = endBalance - startBalance;
    const percentageChange = startBalance > 0 
      ? (change / startBalance) * 100 
      : 0;

    return {
      startBalance,
      endBalance,
      change,
      percentageChange
    };
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
