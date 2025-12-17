import { Hono } from 'hono';
import { getGlobalContainer } from '../../../infrastructure/di/container.setup';
import { ChannelController } from '../../controllers/ChannelController';
import type { ILogger } from '../../../infrastructure/logging/ILogger';

/**
 * Channel Routes
 * 
 * Handles all channel-related API endpoints:
 * - GET /api/v1/channels - Get all channels with pagination
 * - GET /api/v1/channels/:id - Get channel by ID
 * - POST /api/v1/channels - Create new channel
 * - PUT /api/v1/channels/:id - Update channel
 * - DELETE /api/v1/channels/:id - Delete channel
 */

export function createChannelRoutes(): Hono {
  const router = new Hono();
  const container = getGlobalContainer();
  const logger = container.resolve<ILogger>('logger');
  const controller = new ChannelController(logger, container);

  /**
   * GET /api/v1/channels
   * Get all channels with pagination
   * 
   * Query parameters:
   * - page: number (default: 1)
   * - pageSize: number (default: 10, max: 100)
   * 
   * Response: 200 OK with paginated channel list
   * Errors: 400 Bad Request, 500 Internal Server Error
   */
  router.get('/', async (c) => {
    try {
      logger.info('GET /channels - Getting all channels');
      return await controller.getChannels(c);
    } catch (error) {
      logger.error('GET /channels failed', error);
      throw error;
    }
  });

  /**
   * GET /api/v1/channels/:id
   * Get channel by ID
   * 
   * Response: 200 OK with channel data
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id', async (c) => {
    try {
      logger.info(`GET /channels/:id - channelId: ${c.req.param('id')}`);
      return await controller.getChannel(c);
    } catch (error) {
      logger.error(`GET /channels/:id failed`, error);
      throw error;
    }
  });

  /**
   * POST /api/v1/channels
   * Create new channel
   * 
   * Request body:
   * {
   *   telegramChannelId: string,
   *   name: string,
   *   description?: string,
   *   ownerId: number
   * }
   * 
   * Response: 201 Created with channel data
   * Errors: 400 Bad Request, 409 Conflict, 500 Internal Server Error
   */
  router.post('/', async (c) => {
    try {
      logger.info('POST /channels - Creating new channel');
      return await controller.createChannel(c);
    } catch (error) {
      logger.error('POST /channels failed', error);
      throw error;
    }
  });

  /**
   * PUT /api/v1/channels/:id
   * Update channel
   * 
   * Request body:
   * {
   *   name?: string,
   *   description?: string
   * }
   * 
   * Response: 200 OK with updated channel data
   * Errors: 400 Bad Request, 404 Not Found, 500 Internal Server Error
   */
  router.put('/:id', async (c) => {
    try {
      logger.info(`PUT /channels/:id - channelId: ${c.req.param('id')}`);
      return await controller.updateChannel(c);
    } catch (error) {
      logger.error(`PUT /channels/:id failed`, error);
      throw error;
    }
  });

  /**
   * DELETE /api/v1/channels/:id
   * Delete channel
   * 
   * Response: 204 No Content
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.delete('/:id', async (c) => {
    try {
      logger.info(`DELETE /channels/:id - channelId: ${c.req.param('id')}`);
      return await controller.deleteChannel(c);
    } catch (error) {
      logger.error(`DELETE /channels/:id failed`, error);
      throw error;
    }
  });

  return router;
}
