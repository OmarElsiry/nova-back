import { PrismaClient } from '@prisma/client';
import { calculateGiftFlags } from '../utils/giftUtils';

export class GiftsService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getChannelGifts(channelId: number) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        username: true,
        giftsJson: true,
        giftsCount: true,
        featuredGiftImageUrl: true,
      },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    try {
      const gifts = JSON.parse(channel.giftsJson || '[]');
      return {
        channelId: channel.id,
        username: channel.username,
        gifts,
        count: channel.giftsCount,
        featuredImage: channel.featuredGiftImageUrl,
      };
    } catch (error) {
      console.error('Error parsing gifts JSON:', error);
      return {
        channelId: channel.id,
        username: channel.username,
        gifts: [],
        count: 0,
        featuredImage: channel.featuredGiftImageUrl,
      };
    }
  }

  async updateChannelGifts(channelId: number, gifts: any[]) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    // Extract featured gift if available
    let featuredGiftImageUrl = null;
    if (gifts.length > 0 && gifts[0].image_url) {
      featuredGiftImageUrl = gifts[0].image_url;
    }

    const flags = calculateGiftFlags(JSON.stringify(gifts));

    return await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        giftsJson: JSON.stringify(gifts),
        giftsCount: gifts.length,
        featuredGiftImageUrl,
        updatedAt: new Date(),
        ...flags // spread hasUpgradedGifts and hasRegularGifts
      } as any, // Cast to any because types might be stale
    });
  }

  async getGiftStats() {
    const channels = await this.prisma.channel.findMany({
      select: {
        id: true,
        username: true,
        giftsJson: true,
        giftsCount: true,
      },
    });

    let totalGifts = 0;
    let channelsWithGifts = 0;
    let giftTypes = new Set<string>();
    let mostCommonGift: { name: string; count: number } = { name: '', count: 0 };
    const giftCounts: Record<string, number> = {};

    for (const channel of channels) {
      try {
        const gifts = JSON.parse(channel.giftsJson || '[]');
        if (gifts.length > 0) {
          channelsWithGifts++;
          totalGifts += gifts.length;

          for (const gift of gifts) {
            if (gift.name) {
              giftTypes.add(gift.name);
              giftCounts[gift.name] = (giftCounts[gift.name] || 0) + 1;

              const currentCount = giftCounts[gift.name];
              if (currentCount && currentCount > mostCommonGift.count) {
                mostCommonGift = {
                  name: gift.name,
                  count: currentCount,
                };
              }
            }
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return {
      totalGifts,
      channelsWithGifts,
      channelsWithoutGifts: channels.length - channelsWithGifts,
      averageGiftsPerChannel: channelsWithGifts > 0 ? totalGifts / channelsWithGifts : 0,
      uniqueGiftTypes: giftTypes.size,
      mostCommonGift: mostCommonGift.count > 0 ? mostCommonGift : null,
      totalChannels: channels.length,
    };
  }

  async getChannelsWithGifts(limit: number = 50, offset: number = 0) {
    return await this.prisma.channel.findMany({
      where: {
        giftsCount: {
          gt: 0,
        },
      },
      select: {
        id: true,
        username: true,
        giftsCount: true,
        featuredGiftImageUrl: true,
        status: true,
        askingPrice: true,
        user: {
          select: {
            id: true,
            telegramId: true,
          },
        },
      },
      orderBy: { giftsCount: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  async searchGifts(giftName: string) {
    const channels = await this.prisma.channel.findMany({
      where: {
        giftsJson: {
          contains: giftName,
        },
      },
      select: {
        id: true,
        username: true,
        giftsJson: true,
        giftsCount: true,
        status: true,
        askingPrice: true,
      },
    });

    const results = [];
    for (const channel of channels) {
      try {
        const gifts = JSON.parse(channel.giftsJson || '[]');
        const matchingGifts = gifts.filter((gift: any) =>
          gift.name && gift.name.toLowerCase().includes(giftName.toLowerCase())
        );

        if (matchingGifts.length > 0) {
          results.push({
            channelId: channel.id,
            username: channel.username,
            matchingGifts,
            totalGifts: channel.giftsCount,
            status: channel.status,
            askingPrice: channel.askingPrice,
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return results;
  }

  async getGiftValue(giftName: string): Promise<number> {
    // This would integrate with an external API to get gift values
    // For now, return a placeholder value
    const knownGifts: Record<string, number> = {
      'Ice Cream': 0.1,
      'Snoop Dogg': 0.5,
      'Diamond': 10,
      'Gold': 5,
      'Silver': 1,
    };

    return knownGifts[giftName] || 0;
  }
}
