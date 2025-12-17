import { PrismaClient } from '@prisma/client';

export interface WithdrawalRecord {
  id: string;
  userId: number;
  amountNano: string;
  destinationAddress: string;
  status: string;
  txHash: string | null;
  createdAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  metadata: string | null;
}

export interface WithdrawalSummary {
  totalWithdrawals: number;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  totalAmountWithdrawn: number;
  lastWithdrawal?: WithdrawalRecord;
}

export class WithdrawalHistoryService {
  constructor(private prisma: PrismaClient) {}

  async getUserHistory(
    userId: number,
    limit = 10,
    offset = 0
  ): Promise<WithdrawalRecord[]> {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
  }

  async getUserSummary(userId: number): Promise<WithdrawalSummary> {
    const [
      total,
      pending,
      completed,
      failed,
      withdrawals,
      lastWithdrawal
    ] = await Promise.all([
      this.prisma.withdrawal.count({
        where: { userId }
      }),
      this.prisma.withdrawal.count({
        where: { userId, status: 'pending' }
      }),
      this.prisma.withdrawal.count({
        where: { userId, status: 'completed' }
      }),
      this.prisma.withdrawal.count({
        where: { userId, status: 'failed' }
      }),
      this.prisma.withdrawal.findMany({
        where: { userId, status: 'completed' },
        select: { amountNano: true }
      }),
      this.prisma.withdrawal.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Calculate total amount withdrawn
    const totalAmount = withdrawals.reduce((sum, w) => {
      return sum + (parseFloat(w.amountNano) / 1e9);
    }, 0);

    return {
      totalWithdrawals: total,
      pendingCount: pending,
      completedCount: completed,
      failedCount: failed,
      totalAmountWithdrawn: totalAmount,
      lastWithdrawal: lastWithdrawal || undefined
    };
  }

  async getPendingWithdrawals(limit = 100): Promise<WithdrawalRecord[]> {
    return this.prisma.withdrawal.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit
    });
  }

  async getWithdrawalById(id: string): Promise<WithdrawalRecord | null> {
    return this.prisma.withdrawal.findUnique({
      where: { id }
    });
  }

  async getWithdrawalsByStatus(
    status: string,
    limit = 100
  ): Promise<WithdrawalRecord[]> {
    return this.prisma.withdrawal.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async getWithdrawalsByDateRange(
    startDate: Date,
    endDate: Date,
    userId?: number
  ): Promise<WithdrawalRecord[]> {
    const where: any = {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    };

    if (userId) {
      where.userId = userId;
    }

    return this.prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
  }
}
