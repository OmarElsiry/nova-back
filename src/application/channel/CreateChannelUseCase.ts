/**
 * Create Channel Use Case
 * Handles the business logic for creating a new channel
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { ConflictError, ValidationError } from '../../shared/errors/AppError';

export interface CreateChannelInput {
  telegramChannelId: string;
  name: string;
  description?: string;
  ownerId: number;
}

export interface IChannelRepository {
  findByTelegramChannelId(telegramChannelId: string): Promise<any | null>;
  create(data: any): Promise<any>;
}

export class CreateChannelUseCase {
  constructor(
    private channelRepository: IChannelRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the create channel use case
   */
  async execute(input: CreateChannelInput): Promise<any> {
    this.logger.info('Creating new channel', { input });

    // Check if channel already exists
    const existingChannel = await this.channelRepository.findByTelegramChannelId(
      input.telegramChannelId
    );
    
    if (existingChannel) {
      this.logger.warn('Channel already exists', { telegramChannelId: input.telegramChannelId });
      throw new ConflictError('Channel already exists', {
        telegramChannelId: input.telegramChannelId,
      });
    }

    // Create channel
    const channel = await this.channelRepository.create({
      telegramChannelId: input.telegramChannelId,
      name: input.name,
      description: input.description || null,
      ownerId: input.ownerId,
      isVerified: false,
    });

    this.logger.info('Channel created successfully', { channelId: channel.id });
    return channel;
  }
}
