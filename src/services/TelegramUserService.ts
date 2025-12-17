import { PrismaClient } from '@prisma/client';

interface TelegramUserData {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  walletAddress?: string | null;
}

export class TelegramUserService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async syncTelegramUser(userData: TelegramUserData) {
    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { telegramId: userData.telegramId },
    });

    if (!user) {
      // Create new user - use provided wallet address or null if not connected
      const walletAddress = userData.walletAddress || null;
      
      user = await this.prisma.user.create({
        data: {
          telegramId: userData.telegramId,
          walletAddress,
          walletAddressVariants: JSON.stringify(walletAddress ? [walletAddress] : []),
          balance: 0,
        },
      });

      console.log(`👤 New Telegram user created: ${userData.telegramId}${walletAddress ? ` with wallet: ${walletAddress}` : ' (wallet not connected)'}`);
    } else if (userData.walletAddress && userData.walletAddress !== user.walletAddress) {
      // Update wallet address if provided and different
      const variants = JSON.parse(user.walletAddressVariants || '[]');
      if (!variants.includes(userData.walletAddress)) {
        variants.push(userData.walletAddress);
      }

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          walletAddress: userData.walletAddress,
          walletAddressVariants: JSON.stringify(variants),
          updatedAt: new Date(),
        },
      });

      console.log(`👤 User wallet updated: ${userData.telegramId} -> ${userData.walletAddress}`);
    }

    return user;
  }

  async getUserProfile(telegramId: string) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        channels: {
          include: {
            _count: {
              select: {
                reviews: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Calculate statistics
    const deposits = user.transactions.filter(tx => tx.type === 'deposit');
    const withdrawals = user.transactions.filter(tx => tx.type === 'withdrawal');

    return {
      id: user.id,
      telegramId: user.telegramId,
      walletAddress: user.walletAddress,
      balance: user.balance,
      statistics: {
        totalDeposited: deposits.reduce((sum, tx) => sum + tx.amount, 0),
        totalWithdrawn: withdrawals.reduce((sum, tx) => sum + tx.amount, 0),
        transactionCount: user.transactions.length,
        channelCount: user.channels.length,
        listedChannels: user.channels.filter(c => c.status === 'listed').length,
        verifiedChannels: user.channels.filter(c => c.status === 'verified').length,
      },
      recentTransactions: user.transactions,
      channels: user.channels.map(channel => ({
        id: channel.id,
        username: channel.username,
        status: channel.status,
        askingPrice: channel.askingPrice,
        giftsCount: channel.giftsCount,
        reviewCount: channel._count.reviews,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateUserMetadata(telegramId: string, metadata: any) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // In a real application, you might store metadata in a separate table
    // For now, we just update the updatedAt timestamp
    return await this.prisma.user.update({
      where: { id: user.id },
      data: {
        updatedAt: new Date(),
      },
    });
  }

  async getUserByTelegramId(telegramId: string) {
    return await this.prisma.user.findUnique({
      where: { telegramId },
    });
  }

  async getTelegramUserStats() {
    const [
      totalUsers,
      usersWithBalance,
      usersWithChannels,
      usersWithTransactions,
      totalBalance,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { balance: { gt: 0 } },
      }),
      this.prisma.user.count({
        where: {
          channels: {
            some: {},
          },
        },
      }),
      this.prisma.user.count({
        where: {
          transactions: {
            some: {},
          },
        },
      }),
      this.prisma.user.aggregate({
        _sum: { balance: true },
      }),
    ]);

    return {
      totalUsers,
      usersWithBalance,
      usersWithChannels,
      usersWithTransactions,
      totalBalance: totalBalance._sum.balance || 0,
      averageBalance: totalUsers > 0 ? (totalBalance._sum.balance || 0) / totalUsers : 0,
    };
  }

  async getTopUsers(limit: number = 10) {
    return await this.prisma.user.findMany({
      orderBy: { balance: 'desc' },
      take: limit,
      include: {
        _count: {
          select: {
            transactions: true,
            channels: true,
            reviews: true,
          },
        },
      },
    });
  }

  async searchUsers(query: string) {
    return await this.prisma.user.findMany({
      where: {
        OR: [
          { telegramId: { contains: query } },
          { walletAddress: { contains: query } },
        ],
      },
      take: 20,
    });
  }
}
