import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const WithdrawalSchema = z.object({
  userId: z.number(),
  amount: z.number().positive(),
  destinationAddress: z.string(),
});

export class WithdrawalService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async requestWithdrawal(data: z.infer<typeof WithdrawalSchema>) {
    const validated = WithdrawalSchema.parse(data);

    // Check user balance
    const user = await this.prisma.user.findUnique({
      where: { id: validated.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.balance < validated.amount) {
      throw new Error(`Insufficient balance. Available: ${user.balance} TON, Requested: ${validated.amount} TON`);
    }

    // Start a transaction to ensure atomicity
    const [withdrawal, updatedUser] = await this.prisma.$transaction([
      // Create withdrawal transaction
      this.prisma.transaction.create({
        data: {
          userId: validated.userId,
          amount: validated.amount,
          type: 'withdrawal',
          status: 'pending',
          // Store destination address in txHash temporarily
          // In production, you'd have a separate field for this
          txHash: `pending:${validated.destinationAddress}`,
        },
      }),
      // Deduct from balance
      this.prisma.user.update({
        where: { id: validated.userId },
        data: {
          balance: {
            decrement: validated.amount,
          },
        },
      }),
    ]);

    console.log(`💸 Withdrawal requested: ${validated.amount} TON for user ${user.telegramId}`);
    
    return {
      withdrawal,
      newBalance: updatedUser.balance,
    };
  }

  async completeWithdrawal(transactionId: number, txHash: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.type !== 'withdrawal') {
      throw new Error('Transaction is not a withdrawal');
    }

    if (transaction.status === 'completed') {
      throw new Error('Withdrawal already completed');
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'completed',
        txHash,
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Withdrawal completed: Transaction ${transactionId}`);
    return updated;
  }

  async cancelWithdrawal(transactionId: number) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { user: true },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.type !== 'withdrawal') {
      throw new Error('Transaction is not a withdrawal');
    }

    if (transaction.status === 'completed') {
      throw new Error('Cannot cancel completed withdrawal');
    }

    // Start a transaction to ensure atomicity
    const [cancelledTx, updatedUser] = await this.prisma.$transaction([
      // Cancel the withdrawal
      this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'failed',
          updatedAt: new Date(),
        },
      }),
      // Refund the balance
      this.prisma.user.update({
        where: { id: transaction.userId },
        data: {
          balance: {
            increment: transaction.amount,
          },
        },
      }),
    ]);

    console.log(`🔄 Withdrawal cancelled and refunded: ${transaction.amount} TON to user ${transaction.user.telegramId}`);
    
    return {
      transaction: cancelledTx,
      newBalance: updatedUser.balance,
    };
  }

  async getWithdrawalHistory(userId: number, limit: number = 50, offset: number = 0) {
    return await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'withdrawal',
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  async getPendingWithdrawals() {
    return await this.prisma.transaction.findMany({
      where: {
        type: 'withdrawal',
        status: 'pending',
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            walletAddress: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getWithdrawalStats(userId?: number) {
    const where = userId ? { userId, type: 'withdrawal' } : { type: 'withdrawal' };

    const [
      totalWithdrawals,
      pendingWithdrawals,
      completedWithdrawals,
      failedWithdrawals,
      totalAmount,
    ] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.count({ 
        where: { ...where, status: 'pending' } 
      }),
      this.prisma.transaction.count({ 
        where: { ...where, status: 'completed' } 
      }),
      this.prisma.transaction.count({ 
        where: { ...where, status: 'failed' } 
      }),
      this.prisma.transaction.aggregate({
        where: { ...where, status: 'completed' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalWithdrawals,
      pendingWithdrawals,
      completedWithdrawals,
      failedWithdrawals,
      totalAmountWithdrawn: totalAmount._sum.amount || 0,
      userId,
    };
  }

  async getMinimumWithdrawalAmount(): Promise<number> {
    // Minimum withdrawal amount in TON
    return 0.1;
  }

  async getMaximumWithdrawalAmount(): Promise<number> {
    // Maximum withdrawal amount in TON
    return 1000;
  }
}
