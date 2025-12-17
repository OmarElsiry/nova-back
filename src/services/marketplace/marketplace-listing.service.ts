import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { calculateGiftFlags } from '../../utils/giftUtils';

export const listingSchema = z.object({
  channelId: z.number(),
  userId: z.number(),
  askingPrice: z.number().min(0),
  description: z.string().optional()
});

export interface ListingData {
  channelId: number;
  userId: number;
  askingPrice: number;
  description?: string;
  giftsJson?: string;
  giftsCount?: number;
  featuredGiftImageUrl?: string;
}

export interface ListingResult {
  success: boolean;
  channelId?: number;
  error?: string;
  details?: any;
}

export class MarketplaceListingService {
  constructor(private prisma: PrismaClient) { }

  async createListing(data: ListingData): Promise<ListingResult> {
    try {
      // Verify channel exists and belongs to user
      const channel = await this.prisma.channel.findUnique({
        where: { id: data.channelId }
      });

      if (!channel) {
        return {
          success: false,
          error: 'Channel not found'
        };
      }

      if (channel.userId !== data.userId) {
        return {
          success: false,
          error: 'You do not own this channel'
        };
      }

      // If already listed, allow update instead of failing
      // usage difference between add-channel and update-listing flows

      // Update fields
      const updateData: any = {
        status: 'listed',
        askingPrice: data.askingPrice
      };

      if (data.giftsJson) {
        updateData.giftsJson = data.giftsJson;
        const flags = calculateGiftFlags(data.giftsJson);
        Object.assign(updateData, flags);
      }
      if (data.giftsCount !== undefined) updateData.giftsCount = data.giftsCount;
      if (data.featuredGiftImageUrl) updateData.featuredGiftImageUrl = data.featuredGiftImageUrl;

      // Create listing
      const updatedChannel = await this.prisma.channel.update({
        where: { id: data.channelId },
        data: updateData
      });

      return {
        success: true,
        channelId: updatedChannel.id,
        details: updatedChannel
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create listing'
      };
    }
  }

  async updateListing(
    channelId: number,
    userId: number,
    askingPrice: number
  ): Promise<ListingResult> {
    try {
      // Verify ownership
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId }
      });

      if (!channel || channel.userId !== userId) {
        return {
          success: false,
          error: 'Channel not found or unauthorized'
        };
      }

      // Update price
      const updatedChannel = await this.prisma.channel.update({
        where: { id: channelId },
        data: { askingPrice }
      });

      return {
        success: true,
        channelId: updatedChannel.id,
        details: updatedChannel
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update listing'
      };
    }
  }

  async removeListing(channelId: number, userId: number): Promise<ListingResult> {
    try {
      // Verify ownership
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId }
      });

      if (!channel || channel.userId !== userId) {
        return {
          success: false,
          error: 'Channel not found or unauthorized'
        };
      }

      // Remove from marketplace
      const updatedChannel = await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          status: 'verified',
          askingPrice: null
        }
      });

      return {
        success: true,
        channelId: updatedChannel.id,
        details: updatedChannel
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to remove listing'
      };
    }
  }

  async getUserListings(userId: number): Promise<any[]> {
    return this.prisma.channel.findMany({
      where: {
        userId,
        status: 'listed'
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
