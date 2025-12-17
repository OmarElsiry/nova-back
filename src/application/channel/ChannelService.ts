/**
 * Channel Application Service
 * Orchestrates channel business logic
 */

import type { IChannelRepository } from '../../domain/channel/IChannelRepository';
import type { IUserRepository } from '../../domain/user/IUserRepository';
import type { ILogger } from '../../infrastructure/logging/ILogger';

export interface ChannelListingDTO {
  id: number;
  channel_id: number;
  username: string;
  channel_username: string;
  status: string;
  asking_price: number | null;
  askingPrice: number | null;
  price: number | null;
  featuredGiftImageUrl?: string;
  giftsCount: number;
  gifts_count: number;
  giftsJson?: any[];
  gifts: any[];
  createdAt: Date;
  created_at: Date;
  updatedAt: Date;
  is_verified: boolean;
  has_pending_transaction: boolean;
  pending_transaction_id: null;
  channel: {
    id: number;
    channel_id: number;
    channel_username: string;
    is_verified: boolean;
    created_at: Date;
  };
  seller?: {
    id: number;
    telegramId: string;
  };
  rating?: {
    average: number;
    count: number;
  };
}

export class ChannelService {
  constructor(
    private readonly channelRepository: IChannelRepository,
    private readonly userRepository: IUserRepository,
    private readonly logger: ILogger
  ) { }

  /**
   * Get user's channels by telegram ID
   */
  async getUserChannels(telegramId: string): Promise<{
    success: boolean;
    data?: {
      channels: any[];
      total: number;
    };
    error?: string;
  }> {
    try {
      // Find user by telegram ID
      const user = await this.userRepository.findByTelegramId(telegramId);

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Get user's channels
      const channels = await this.channelRepository.findByUserId(Number(user.id));

      // Format for frontend compatibility
      // Format for frontend compatibility
      const formattedChannels = channels.map(channel => {
        let gifts: any[] = [];
        let totalValueTon = 0;
        let totalValueUsd = 0;

        try {
          if (channel.giftsJson) {
            try {
              gifts = JSON.parse(channel.giftsJson);
              if (Array.isArray(gifts)) {
                totalValueTon = gifts.reduce((acc: number, gift: any) => {
                  const price = parseFloat(gift.price_ton || gift.value || 0);
                  return acc + (isNaN(price) ? 0 : price);
                }, 0);

                totalValueUsd = gifts.reduce((acc: number, gift: any) => {
                  const price = parseFloat(gift.price_usd || 0);
                  return acc + (isNaN(price) ? 0 : price);
                }, 0);
              } else {
                gifts = [];
              }
            } catch (e) {
              // Ignore parse error
            }
          }
        } catch (e) {
          // Ignore general error
        }

        return {
          ...channel,
          channel_username: channel.username, // Frontend expects channel_username
          gifts: gifts,
          gifts_count: gifts.length,
          total_value_ton: parseFloat(totalValueTon.toFixed(2)),
          total_value_usd: parseFloat(totalValueUsd.toFixed(2))
        };
      });

      return {
        success: true,
        data: {
          channels: formattedChannels,
          total: formattedChannels.length
        }
      };
    } catch (error) {
      this.logger.error('Failed to get user channels', error);
      return {
        success: false,
        error: 'Failed to fetch channels'
      };
    }
  }

  /**
   * Get channel listings for a specific user
   */
  async getUserListings(telegramId: string): Promise<{
    success: boolean;
    data?: {
      listings: ChannelListingDTO[];
      total: number;
    };
    error?: string;
  }> {
    try {
      this.logger.info('Getting listings for telegram_id:', { telegramId });

      // Find user
      const user = await this.userRepository.findByTelegramId(telegramId);

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Get user's listed channels
      const listings = await this.channelRepository.findListedByUserId(Number(user.id));

      // Transform to DTO format
      const formattedListings: ChannelListingDTO[] = listings.map(listing => {
        const gifts = listing.giftsJson ? JSON.parse(listing.giftsJson) : [];

        return {
          id: listing.id,
          channel_id: listing.id,
          username: listing.username,
          channel_username: listing.username,
          status: listing.status,
          asking_price: listing.askingPrice,
          askingPrice: listing.askingPrice,
          price: listing.askingPrice,
          featuredGiftImageUrl: listing.featuredGiftImageUrl,
          giftsCount: listing.giftsCount,
          gifts_count: listing.giftsCount,
          giftsJson: gifts,
          gifts: gifts,
          createdAt: listing.createdAt,
          created_at: listing.createdAt,
          updatedAt: listing.updatedAt,
          is_verified: listing.status === 'verified',
          has_pending_transaction: false, // Would come from purchase repository
          pending_transaction_id: null,
          channel: {
            id: listing.id,
            channel_id: listing.id,
            channel_username: listing.username,
            is_verified: listing.status === 'verified',
            created_at: listing.createdAt
          },
          seller: {
            id: Number(user.id),
            telegramId: user.telegramId
          },
          rating: {
            average: 0, // Would come from review repository
            count: 0
          }
        };
      });

      this.logger.info(`Found ${formattedListings.length} listings for user ${telegramId}`);

      return {
        success: true,
        data: {
          listings: formattedListings,
          total: formattedListings.length
        }
      };
    } catch (error) {
      this.logger.error('Failed to get user listings', error);
      return {
        success: false,
        error: 'Failed to fetch listings'
      };
    }
  }

  /**
   * Get all available channel listings
   */
  async getAllListings(): Promise<{
    success: boolean;
    data?: {
      channels: any[];
    };
    error?: string;
  }> {
    try {
      const channels = await this.channelRepository.findAllListed();

      return {
        success: true,
        data: {
          channels
        }
      };
    } catch (error) {
      this.logger.error('Failed to get all listings', error);
      return {
        success: false,
        error: 'Failed to fetch channels'
      };
    }
  }
}
