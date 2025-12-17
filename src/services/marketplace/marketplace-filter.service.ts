import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// Validation schemas
export const filterOptionsSchema = z.object({
  tab: z.enum(['channels', 'gifts', 'all']).optional()
});

export const filterSchema = z.object({
  tab: z.enum(['channels', 'gifts', 'all']).optional(),
  category: z.string().optional(),
  giftStatus: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  status: z.enum(['verified', 'listed', 'sold']).optional(),
  sortBy: z.enum(['price', 'date', 'popularity']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  query: z.string().optional()
});

export interface FilterOptions {
  categories: string[];
  priceRange: { min: number; max: number };
  statusCounts: Record<string, number>;
  sortOptions: string[];
  totalCount: number;
}

export interface FilterResult {
  channels: any[];
  totalCount: number;
  hasMore: boolean;
}

export class MarketplaceFilterService {
  constructor(private prisma: PrismaClient) { }

  async getFilterOptions(tab?: string): Promise<FilterOptions> {
    const [categories, priceRange, statusCounts] = await Promise.all([
      this.getCategories(),
      this.getPriceRange(),
      this.getStatusCounts()
    ]);

    return {
      categories,
      priceRange,
      statusCounts,
      sortOptions: ['price', 'date', 'popularity'],
      totalCount: await this.getTotalCount()
    };
  }

  private async getCategories(): Promise<string[]> {
    const result = await this.prisma.channel.findMany({
      distinct: ['status'],
      where: { status: { in: ['verified', 'listed'] } },
      select: { status: true }
    });
    return result.map(r => r.status).filter(Boolean);
  }

  private async getPriceRange(): Promise<{ min: number; max: number }> {
    const result = await this.prisma.channel.aggregate({
      _min: { askingPrice: true },
      _max: { askingPrice: true },
      where: { status: 'listed' }
    });

    return {
      min: result._min.askingPrice || 0,
      max: result._max.askingPrice || 10000
    };
  }

  private async getStatusCounts(): Promise<Record<string, number>> {
    const counts = await this.prisma.channel.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    return counts.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);
  }

  private async getTotalCount(): Promise<number> {
    return this.prisma.channel.count({
      where: { status: { in: ['verified', 'listed'] } }
    });
  }
}
