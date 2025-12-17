import { z } from 'zod';
import { Result } from '../../../core/shared/Result';
import type { IMarketplaceRepository } from '../../../infrastructure/repositories/MarketplaceRepository';
import type { IEventBus } from '../../../infrastructure/services/IEventBus';

/**
 * Command for creating a marketplace listing
 */
export const CreateListingCommand = z.object({
  userId: z.number().positive(),
  channelId: z.string().min(1),
  channelUsername: z.string().min(1),
  channelTitle: z.string().min(1),
  basePrice: z.number().positive(),
  description: z.string().optional(),
  subscribers: z.number().min(0).default(0),
  avatarUrl: z.string().url().optional(),
  category: z.enum(['crypto', 'gaming', 'education', 'entertainment', 'other']).default('other'),
  tags: z.array(z.string()).default([]),
});

export type CreateListingCommandDTO = z.infer<typeof CreateListingCommand>;

/**
 * Use case for creating a marketplace listing
 * Handles business rules for channel listing creation
 */
export class CreateListingUseCase {
  private readonly MAX_ACTIVE_LISTINGS_PER_USER = 10;
  private readonly MIN_PRICE = 0.1; // TON
  private readonly MAX_PRICE = 10000; // TON

  constructor(
    private readonly marketplaceRepository: IMarketplaceRepository,
    private readonly eventBus?: IEventBus
  ) {}

  async execute(command: CreateListingCommandDTO): Promise<Result<{ listingId: number }>> {
    try {
      // Validate command
      const validated = CreateListingCommand.parse(command);

      // Business rule: Check price limits
      if (validated.basePrice < this.MIN_PRICE) {
        return Result.fail<{ listingId: number }>(
          `Minimum price is ${this.MIN_PRICE} TON`
        );
      }
      
      if (validated.basePrice > this.MAX_PRICE) {
        return Result.fail<{ listingId: number }>(
          `Maximum price is ${this.MAX_PRICE} TON`
        );
      }

      // Business rule: Check duplicate listing
      const existingListing = await this.marketplaceRepository.findByChannelId(
        validated.channelId
      );
      
      if (existingListing && existingListing.status === 'active') {
        return Result.fail<{ listingId: number }>(
          'This channel already has an active listing'
        );
      }

      // Business rule: Check user's active listings count
      const userListings = await this.marketplaceRepository.findByUserId(
        validated.userId
      );
      
      const activeListings = userListings.filter(l => l.status === 'active');
      if (activeListings.length >= this.MAX_ACTIVE_LISTINGS_PER_USER) {
        return Result.fail<{ listingId: number }>(
          `You can only have ${this.MAX_ACTIVE_LISTINGS_PER_USER} active listings`
        );
      }

      // Create the listing
      const listing = await this.marketplaceRepository.save({
        userId: validated.userId,
        channelId: validated.channelId,
        channelUsername: validated.channelUsername,
        channelTitle: validated.channelTitle,
        basePrice: validated.basePrice,
        currentPrice: validated.basePrice, // Initially same as base price
        description: validated.description || '',
        subscribers: validated.subscribers,
        avatarUrl: validated.avatarUrl || null,
        category: validated.category,
        tags: JSON.stringify(validated.tags),
        status: 'active',
        views: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Emit domain event
      await this.eventBus?.publish({
        type: 'ListingCreated',
        payload: {
          listingId: listing.id,
          userId: validated.userId,
          channelId: validated.channelId,
          channelUsername: validated.channelUsername,
          basePrice: validated.basePrice,
          category: validated.category,
        },
        occurredAt: new Date(),
      });

      return Result.ok({ listingId: listing.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Result.fail<{ listingId: number }>(
          `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        );
      }
      return Result.fail<{ listingId: number }>(
        error instanceof Error ? error.message : 'Failed to create listing'
      );
    }
  }
}
