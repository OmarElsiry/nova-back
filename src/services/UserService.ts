import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const CreateUserSchema = z.object({
  telegramId: z.string(),
  walletAddress: z.string().optional(),
  walletAddressVariants: z.array(z.string()).optional(),
});

const UpdateBalanceSchema = z.object({
  userId: z.number(),
  amount: z.number(),
});

export class UserService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createUser(data: z.infer<typeof CreateUserSchema>) {
    const validated = CreateUserSchema.parse(data);

    // Check if user exists
    const existing = await this.prisma.user.findUnique({
      where: { telegramId: validated.telegramId },
    });

    if (existing) {
      throw new Error('User already exists');
    }

    const variants = validated.walletAddressVariants || (validated.walletAddress ? [validated.walletAddress] : []);

    const createData: any = {
      telegramId: validated.telegramId,
      walletAddressVariants: JSON.stringify(variants),
      balance: 0,
    };

    if (validated.walletAddress) {
      createData.walletAddress = validated.walletAddress;
    }

    return await this.prisma.user.create({
      data: createData,
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        channels: true,
      },
    }) as any;
  }

  async getUserByTelegramId(telegramId: string) {
    return await this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        channels: true,
      },
    });
  }

  async getUserByWallet(walletAddress: string) {
    console.log('🔍 getUserByWallet searching for:', walletAddress);

    // Direct match by wallet address (explicit comparison)
    const user = await this.prisma.user.findFirst({
      where: {
        walletAddress: walletAddress
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        channels: true,
      },
    });

    if (user) {
      console.log('✅ Found user by wallet address:', user.id);
      return user;
    }

    console.log('⚠️ No direct match, checking address variants...');

    // Fallback: check address variants
    const allUsers = await this.prisma.user.findMany({
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        channels: true,
      },
    });

    for (const u of allUsers) {
      try {
        const variants = JSON.parse(u.walletAddressVariants || '[]');
        if (variants.includes(walletAddress)) {
          console.log('✅ Found user by wallet variant:', u.id);
          return u;
        }
      } catch {
        // Skip invalid JSON
      }
    }

    console.log('❌ No user found for wallet:', walletAddress);
    return null;
  }

  async getBalance(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    return {
      balance: user?.balance || 0,
      telegramId: user?.telegramId,
      walletAddress: user?.walletAddress,
    };
  }

  async updateBalance(data: z.infer<typeof UpdateBalanceSchema>) {
    const validated = UpdateBalanceSchema.parse(data);

    return await this.prisma.user.update({
      where: { id: validated.userId },
      data: {
        balance: {
          increment: validated.amount,
        },
      },
    });
  }

  async getTransactionHistory(userId: number, limit: number = 50, offset: number = 0) {
    return await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  async getAllUsers(limit: number = 100, offset: number = 0) {
    const users = await this.prisma.user.findMany({
      skip: offset,
      take: limit,
      include: {
        _count: {
          select: {
            transactions: true,
            channels: true,
          },
        },
      },
    });

    return users.map(user => ({
      ...user,
      transactionCount: user._count.transactions,
      channelCount: user._count.channels,
    }));
  }

  async getUserStats(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        transactions: true,
        channels: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const deposits = user.transactions.filter(tx => tx.type === 'deposit');
    const withdrawals = user.transactions.filter(tx => tx.type === 'withdrawal');

    return {
      userId: user.id,
      telegramId: user.telegramId,
      walletAddress: user.walletAddress,
      balance: user.balance,
      totalDeposited: deposits.reduce((sum, tx) => sum + tx.amount, 0),
      totalWithdrawn: withdrawals.reduce((sum, tx) => sum + tx.amount, 0),
      transactionCount: user.transactions.length,
      channelCount: user.channels.length,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateUserWallet(userId: number, walletAddress: string) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: {
        walletAddress,
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        channels: true,
      },
    });
  }

  async getTopTraders(limit: number = 20) {
    // 1. Get top sellers by volume (sum of purchase prices)
    // Note: status must be 'completed'
    const topSellers = await this.prisma.purchase.groupBy({
      by: ['sellerId'],
      where: {
        status: 'completed',
      },
      _sum: {
        price: true,
      },
      orderBy: {
        _sum: {
          price: 'desc',
        },
      },
      take: limit,
    });

    // 2. Fetch user details for these sellers
    const results = await Promise.all(
      topSellers.map(async (item, index) => {
        const user = await this.prisma.user.findUnique({
          where: { id: item.sellerId },
          select: {
            id: true,
            username: true,
            telegramId: true,
            walletAddress: true,
            photoUrl: true, // Make sure to add this field to schema first
          }
        });

        if (!user) return null;

        return {
          id: user.id,
          rank: index + 1,
          username: user.username || `User ${user.telegramId.slice(0, 4)}`,
          avatar: user.photoUrl,
          tradingVolume: item._sum.price || 0,
          telegramId: user.telegramId,
          walletAddress: user.walletAddress
        };
      })
    );

    return results.filter(Boolean);
  }
}
