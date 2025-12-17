import type { Context } from 'hono';
import { BaseController } from './BaseController';
import { DIContainer } from '../../infrastructure/di/DIContainer';
import { GetChannelsUseCase } from '../../application/channel/GetChannelsUseCase';
import { ChannelService } from '../../application/channel/ChannelService';
import type { ILogger } from '../../infrastructure/logging/ILogger';

/**
 * ChannelController
 * 
 * Handles all channel-related HTTP requests and responses.
 * Extends BaseController for common functionality.
 */
export class ChannelController extends BaseController {
  private getChannelsUseCase: GetChannelsUseCase;
  private channelService: ChannelService;

  constructor(logger: ILogger, container: DIContainer) {
    super(logger);
    this.getChannelsUseCase = container.resolve<GetChannelsUseCase>('getChannelsUseCase');
    this.channelService = container.resolve<ChannelService>('channelService');
  }

  /**
   * Get all channels with pagination
   * 
   * @param c - Hono context
   * @returns List of channels or error response
   */
  async getChannels(c: Context): Promise<Response> {
    try {
      const { page, pageSize } = this.getPaginationParams(c);

      this.logRequest(c, 'Get channels');

      const result = await this.getChannelsUseCase.execute({ page, pageSize });

      this.logResponse(c, 'Get channels', 200);
      return this.paginated(c, result.data, result.total, page, pageSize, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Get channel by ID
   * 
   * @param c - Hono context
   * @returns Channel data or error response
   */
  async getChannel(c: Context): Promise<Response> {
    try {
      const channelId = this.getParam(c, 'id');
      const numChannelId = parseInt(channelId);

      this.logRequest(c, 'Get channel');

      // TODO: Implement channel retrieval from repository
      const channel = null;

      if (!channel) {
        throw new Error('Channel not found');
      }

      this.logResponse(c, 'Get channel', 200);
      return this.success(c, channel, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Create new channel
   * 
   * @param c - Hono context
   * @returns Created channel data or error response
   */
  async createChannel(c: Context): Promise<Response> {
    try {
      const body = await this.getBody<any>(c);

      this.logRequest(c, 'Create channel');

      // TODO: Implement channel creation
      const channel = body;

      this.logResponse(c, 'Create channel', 201);
      return this.success(c, channel, 201);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Update channel
   * 
   * @param c - Hono context
   * @returns Updated channel data or error response
   */
  async updateChannel(c: Context): Promise<Response> {
    try {
      const channelId = this.getParam(c, 'id');
      const numChannelId = parseInt(channelId);
      const body = await this.getBody<any>(c);

      this.logRequest(c, 'Update channel');

      // TODO: Implement channel update
      const channel = body;

      this.logResponse(c, 'Update channel', 200);
      return this.success(c, channel, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Delete channel
   * 
   * @param c - Hono context
   * @returns No content or error response
   */
  async deleteChannel(c: Context): Promise<Response> {
    try {
      const channelId = this.getParam(c, 'id');
      const numChannelId = parseInt(channelId);

      this.logRequest(c, 'Delete channel');

      // TODO: Implement channel deletion

      this.logResponse(c, 'Delete channel', 204);
      return c.json(null, 204 as any);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Get user's channels by telegram ID
   * 
   * @param c - Hono context
   * @returns User's channels or error response
   */
  async getUserChannels(c: Context): Promise<Response> {
    try {
      const telegramId = c.req.query('telegram_id');
      
      if (!telegramId) {
        return c.json({
          success: false,
          error: 'telegram_id is required'
        }, 400);
      }

      this.logRequest(c, 'Get user channels');
      
      const result = await this.channelService.getUserChannels(telegramId);
      
      if (!result.success) {
        this.logResponse(c, 'Get user channels', result.error === 'User not found' ? 404 : 500);
        return c.json(result, result.error === 'User not found' ? 404 : 500);
      }

      this.logResponse(c, 'Get user channels', 200);
      return c.json(result, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Get user's channel listings by telegram ID
   * 
   * @param c - Hono context
   * @returns User's listings or error response
   */
  async getUserListings(c: Context): Promise<Response> {
    try {
      const telegramId = c.req.query('telegram_id');
      
      if (!telegramId) {
        return c.json({
          success: false,
          error: 'telegram_id is required'
        }, 400);
      }

      this.logRequest(c, 'Get user listings');
      
      const result = await this.channelService.getUserListings(telegramId);
      
      if (!result.success) {
        this.logResponse(c, 'Get user listings', result.error === 'User not found' ? 404 : 500);
        return c.json(result, result.error === 'User not found' ? 404 : 500);
      }

      this.logResponse(c, 'Get user listings', 200);
      return c.json(result, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }
}
