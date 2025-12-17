/**
 * Get Channels Use Case
 * Handles the business logic for retrieving channels with pagination
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';

export interface IChannelRepository {
  findAll(page: number, pageSize: number): Promise<{ data: any[]; total: number }>;
}

export class GetChannelsUseCase {
  constructor(
    private channelRepository: IChannelRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the get channels use case
   */
  async execute(params: { page: number; pageSize: number }): Promise<{ data: any[]; total: number }> {
    this.logger.info('Fetching channels', params);

    const result = await this.channelRepository.findAll(params.page, params.pageSize);

    this.logger.info('Channels retrieved successfully', {
      count: result.data.length,
      total: result.total,
    });

    return result;
  }
}
