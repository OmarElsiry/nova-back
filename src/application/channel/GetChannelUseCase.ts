/**
 * Get Channel Use Case
 * Handles the business logic for retrieving a single channel
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { NotFoundError } from '../../shared/errors/AppError';

export interface IChannelRepository {
  findById(id: number): Promise<any | null>;
}

export class GetChannelUseCase {
  constructor(
    private channelRepository: IChannelRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the get channel use case
   */
  async execute(channelId: number): Promise<any> {
    this.logger.info('Fetching channel', { channelId });

    const channel = await this.channelRepository.findById(channelId);
    
    if (!channel) {
      this.logger.warn('Channel not found', { channelId });
      throw new NotFoundError('Channel', channelId);
    }

    this.logger.info('Channel retrieved successfully', { channelId });
    return channel;
  }
}
