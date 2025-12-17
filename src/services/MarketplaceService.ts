import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const CreateChannelSchema = z.object({
  userId: z.number(),
  username: z.string(),
  askingPrice: z.number().optional(),
  giftsJson: z.string().optional(),
  featuredGiftImageUrl: z.string().optional(),
});

const UpdateChannelSchema = z.object({
  askingPrice: z.number().optional(),
  status: z.string().optional(),
  giftsJson: z.string().optional(),
  featuredGiftImageUrl: z.string().optional(),
});

export class MarketplaceService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createListing(data: z.infer<typeof CreateChannelSchema>) {
    const validated = CreateChannelSchema.parse(data);

    // Check if channel already exists
    const existing = await this.prisma.channel.findUnique({
      where: { username: validated.username },
    });

    if (existing) {
      throw new Error('Channel already listed');
    }

    return await this.prisma.channel.create({
      data: {
        userId: validated.userId,
        username: validated.username,
        status: 'listed',
        askingPrice: validated.askingPrice,
        featuredGiftImageUrl: validated.featuredGiftImageUrl,
        giftsJson: validated.giftsJson || '[]',
        giftsCount: validated.giftsJson ? JSON.parse(validated.giftsJson).length : 0,
      },
      include: {
        user: true,
      },
    });
  }

  async getListings(filters?: {
    status?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.minPrice !== undefined || filters?.maxPrice !== undefined) {
      where.askingPrice = {};
      if (filters.minPrice !== undefined) where.askingPrice.gte = filters.minPrice;
      if (filters.maxPrice !== undefined) where.askingPrice.lte = filters.maxPrice;
    }

    const listings = await this.prisma.channel.findMany({
      where,
      skip: filters?.offset || 0,
      take: filters?.limit || 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            walletAddress: true,
          },
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    });

    // Auto-heal missing gifts for listed channels (Self-Correction)
    const healPromises = listings.map(async (channel: any) => {
      if (channel.status === 'listed' && (!channel.giftsCount || channel.giftsCount === 0)) {
        try {
          console.log(`[MarketplaceService] 🚑 Auto-healing gifts for ${channel.username}...`);
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
                  name: gift.short_name || gift.full_name,
                  image_url: gift.image_url,
                  category: 'regular'
                })));
              }

              if (allGifts.length > 0) {
                // Update DB
                await this.prisma.channel.update({
                  where: { id: channel.id },
                  data: {
                    giftsJson: JSON.stringify(allGifts),
                    giftsCount: allGifts.length,
                    featuredGiftImageUrl: allGifts[0].image_path || allGifts[0].image_url
                  }
                });

                // Update in-memory object so user sees it locally
                channel.giftsJson = JSON.stringify(allGifts);
                channel.giftsCount = allGifts.length;
                channel.featuredGiftImageUrl = allGifts[0].image_path || allGifts[0].image_url;
                console.log(`[MarketplaceService] ✅ Healed ${channel.username} with ${allGifts.length} gifts.`);
              }
            }
          }
        } catch (err) {
          console.error(`[MarketplaceService] Failed to heal ${channel.username}:`, err);
        }
      }
      return channel;
    });

    return await Promise.all(healPromises);
  }

  async getChannelById(channelId: number) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        user: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                telegramId: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    return channel;
  }

  async getChannelByUsername(username: string) {
    return await this.prisma.channel.findUnique({
      where: { username },
      include: {
        user: true,
        reviews: true,
      },
    });
  }

  async updateListing(channelId: number, data: z.infer<typeof UpdateChannelSchema>) {
    const validated = UpdateChannelSchema.parse(data);

    const updateData: any = {};
    if (validated.askingPrice !== undefined) updateData.askingPrice = validated.askingPrice;
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.featuredGiftImageUrl !== undefined) updateData.featuredGiftImageUrl = validated.featuredGiftImageUrl;
    if (validated.giftsJson !== undefined) {
      updateData.giftsJson = validated.giftsJson;
      updateData.giftsCount = JSON.parse(validated.giftsJson).length;
    }

    return await this.prisma.channel.update({
      where: { id: channelId },
      data: updateData,
      include: {
        user: true,
      },
    });
  }

  async deleteListing(channelId: number) {
    return await this.prisma.channel.delete({
      where: { id: channelId },
    });
  }

  async getMarketplaceStats() {
    const [
      totalListings,
      listedChannels,
      soldChannels,
      verifiedChannels,
      avgPrice,
      totalUsers
    ] = await Promise.all([
      this.prisma.channel.count(),
      this.prisma.channel.count({ where: { status: 'listed' } }),
      this.prisma.channel.count({ where: { status: 'sold' } }),
      this.prisma.channel.count({ where: { status: 'verified' } }),
      this.prisma.channel.aggregate({
        _avg: { askingPrice: true },
        where: { askingPrice: { not: null } },
      }),
      this.prisma.user.count(),
    ]);

    return {
      totalListings,
      listedChannels,
      soldChannels,
      verifiedChannels,
      averagePrice: avgPrice._avg.askingPrice || 0,
      totalUsers,
      timestamp: new Date().toISOString(),
    };
  }

  async getUserChannels(userId: number) {
    return await this.prisma.channel.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    });
  }

  async searchChannels(query: string) {
    return await this.prisma.channel.findMany({
      where: {
        OR: [
          { username: { contains: query } },
          { giftsJson: { contains: query } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
          },
        },
      },
      take: 20,
    });
  }

  async upsertVerifiedChannel(params: {
    userId: number;
    username: string;
    gifts?: any[];
    featuredGiftImageUrl?: string | null;
    status?: 'verified' | 'pending' | 'listed' | 'unlisted' | 'sold' | string;
    askingPrice?: number | null;
  }) {
    const cleanedUsername = params.username.replace(/^@/, '');
    const gifts = Array.isArray(params.gifts) ? params.gifts : [];
    const giftsJson = JSON.stringify(gifts);

    const channel = await this.prisma.channel.upsert({
      where: { username: cleanedUsername },
      update: {
        userId: params.userId,
        status: params.status || 'verified',
        askingPrice: params.askingPrice ?? null,
        giftsJson,
        giftsCount: gifts.length,
        featuredGiftImageUrl: params.featuredGiftImageUrl ?? null,
        updatedAt: new Date(),
      },
      create: {
        userId: params.userId,
        username: cleanedUsername,
        status: params.status || 'verified',
        askingPrice: params.askingPrice ?? null,
        giftsJson,
        giftsCount: gifts.length,
        featuredGiftImageUrl: params.featuredGiftImageUrl ?? null,
      },
      include: {
        user: true,
      },
    });

    return channel;
  }
}
