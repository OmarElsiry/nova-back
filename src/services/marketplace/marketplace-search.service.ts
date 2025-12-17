import { PrismaClient, Prisma } from '@prisma/client';

export interface SearchParams {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
  sortBy?: 'price' | 'date' | 'popularity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  giftStatus?: string;
}

export interface SearchResult {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class MarketplaceSearchService {
  private readonly DEFAULT_LIMIT = 20;
  private readonly MAX_LIMIT = 100;

  constructor(private prisma: PrismaClient) { }

  async searchChannels(params: SearchParams): Promise<SearchResult> {
    const limit = Math.min(params.limit || this.DEFAULT_LIMIT, this.MAX_LIMIT);
    const offset = params.offset || 0;

    const where = this.buildWhereClause(params);
    const orderBy = this.buildOrderBy(params.sortBy, params.sortOrder);

    const [items, total] = await Promise.all([
      this.prisma.channel.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              walletAddress: true
            }
          }
        }
      }),
      this.prisma.channel.count({ where })
    ]);

    return {
      items,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      hasMore: offset + items.length < total
    };
  }

  // Helper method to sync gifts (moved from search path)
  async syncChannelGifts(channelId: number): Promise<void> {
    try {
      const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel || !channel.username) return;

      console.log(`[MarketplaceSearchService] 🔄 Syncing gifts for ${channel.username}...`);
      const giftsApiUrl = process.env.GIFTS_API_URL || 'https://channelsseller.site';
      const headers = {
        'X-Admin-Password': process.env.GIFTS_API_ADMIN_PASSWORD || 'nova_admin_2024',
        'Accept': 'application/json'
      };

      const response = await fetch(`${giftsApiUrl}/api/user/${channel.username}/nfts`, { headers });
      if (response.ok) {
        const data = await response.json() as any;
        if (data.data) {
          const allGifts: any[] = [];

          // Add NFTs
          if (data.data.nfts && Array.isArray(data.data.nfts)) {
            allGifts.push(...data.data.nfts.map((gift: any) => ({
              id: gift.id,
              name: gift.gift_name,
              model: gift.model,
              backdrop: gift.backdrop,
              rarity: gift.rarity,
              mint: gift.mint,
              image_path: gift.image,
              price_ton: gift.price_ton,
              price_usd: gift.price_usd,
              category: 'upgraded'
            })));
          }

          // Add regular gifts
          if (data.data.regular_gifts && Array.isArray(data.data.regular_gifts)) {
            allGifts.push(...data.data.regular_gifts.map((gift: any) => ({
              id: gift.id,
              name: gift.gift_name || gift.short_name || gift.full_name,
              image_url: gift.image || gift.image_url,
              emoji: gift.emoji,
              category: 'regular'
            })));
          }

          const hasUpgradedGifts = allGifts.some(g => g.category === 'upgraded');
          const hasRegularGifts = allGifts.some(g => g.category === 'regular');

          await this.prisma.channel.update({
            where: { id: channel.id },
            data: {
              giftsJson: JSON.stringify(allGifts),
              giftsCount: allGifts.length,
              featuredGiftImageUrl: allGifts[0]?.image_path || allGifts[0]?.image_url || null,
              hasUpgradedGifts,
              hasRegularGifts
            } as any // cast to any to avoid TS errors if generated client is outdated
          });

          console.log(`[MarketplaceSearchService] ✅ Synced ${channel.username}: ${allGifts.length} gifts.`);
        }
      }
    } catch (err) {
      console.error(`[MarketplaceSearchService] Failed to sync ${channelId}:`, err);
    }
  }

  private buildWhereClause(params: SearchParams): Prisma.ChannelWhereInput {
    const where: Prisma.ChannelWhereInput = {};

    if (params.query) {
      where.OR = [
        { username: { contains: params.query } },
        { giftsJson: { contains: params.query } }
      ];
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.askingPrice = {};
      if (params.minPrice !== undefined) {
        where.askingPrice.gte = params.minPrice;
      }
      if (params.maxPrice !== undefined) {
        where.askingPrice.lte = params.maxPrice;
      }
    }

    if (params.giftStatus) {
      switch (params.giftStatus) {
        case 'upgraded':
          (where as any).hasUpgradedGifts = true;
          break;
        case 'unupgraded':
          // Meaning: Has regular gifts, but NO upgraded gifts? 
          // Or just NO upgraded gifts? 
          // Usually strict interpretation: No upgraded gifts.
          (where as any).hasUpgradedGifts = false;
          break;
        case 'can_upgrade':
          // Assuming this means "Has regular gifts" (which can be upgraded)
          (where as any).hasRegularGifts = true;
          break;
      }
    }

    return where;
  }

  private buildOrderBy(
    sortBy?: string,
    sortOrder?: string
  ): Prisma.ChannelOrderByWithRelationInput {
    const order = sortOrder === 'desc' ? 'desc' : 'asc';

    switch (sortBy) {
      case 'price':
        return { askingPrice: order };
      case 'popularity':
        return { giftsCount: order };
      case 'date':
      default:
        return { createdAt: order };
    }
  }
}
