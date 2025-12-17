import { PrismaClient } from '@prisma/client';

export interface MarketplaceStats {
  totalChannels: number;
  totalListedChannels: number;
  totalSoldChannels: number;
  averagePrice: number;
  totalGifts: number;
  priceRange: {
    min: number;
    max: number;
  };
  recentSales: any[];
}

export class MarketplaceStatsService {
  constructor(private prisma: PrismaClient) {}

  async getOverallStats(): Promise<MarketplaceStats> {
    const [
      totalChannels,
      listedChannels,
      soldChannels,
      priceStats,
      giftStats,
      recentSales
    ] = await Promise.all([
      this.getTotalChannels(),
      this.getListedChannels(),
      this.getSoldChannels(),
      this.getPriceStatistics(),
      this.getGiftStatistics(),
      this.getRecentSales(5)
    ]);

    return {
      totalChannels,
      totalListedChannels: listedChannels,
      totalSoldChannels: soldChannels,
      averagePrice: priceStats.avg,
      totalGifts: giftStats,
      priceRange: {
        min: priceStats.min,
        max: priceStats.max
      },
      recentSales
    };
  }

  private async getTotalChannels(): Promise<number> {
    return this.prisma.channel.count();
  }

  private async getListedChannels(): Promise<number> {
    return this.prisma.channel.count({
      where: { status: 'listed' }
    });
  }

  private async getSoldChannels(): Promise<number> {
    return this.prisma.channel.count({
      where: { status: 'sold' }
    });
  }

  private async getPriceStatistics(): Promise<{ avg: number; min: number; max: number }> {
    const result = await this.prisma.channel.aggregate({
      _avg: { askingPrice: true },
      _min: { askingPrice: true },
      _max: { askingPrice: true },
      where: { 
        status: 'listed',
        askingPrice: { not: null }
      }
    });

    return {
      avg: result._avg.askingPrice || 0,
      min: result._min.askingPrice || 0,
      max: result._max.askingPrice || 10000
    };
  }

  private async getGiftStatistics(): Promise<number> {
    const result = await this.prisma.channel.aggregate({
      _sum: { giftsCount: true }
    });
    return result._sum.giftsCount || 0;
  }

  private async getRecentSales(limit: number): Promise<any[]> {
    return this.prisma.purchase.findMany({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        channel: true,
        buyer: {
          select: {
            id: true,
            telegramId: true
          }
        }
      }
    });
  }

  async getUserStats(userId: number): Promise<any> {
    const [listings, purchases, sales] = await Promise.all([
      this.prisma.channel.count({
        where: { userId, status: 'listed' }
      }),
      this.prisma.purchase.count({
        where: { buyerId: userId, status: 'completed' }
      }),
      this.prisma.purchase.count({
        where: { sellerId: userId, status: 'completed' }
      })
    ]);

    return {
      activeListings: listings,
      totalPurchases: purchases,
      totalSales: sales
    };
  }
}
