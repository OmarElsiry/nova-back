/**
 * Channel Routes - REFACTORED
 * Clean routes that use controller - NO BUSINESS LOGIC HERE
 */

import { Hono } from 'hono';
import type { ChannelController } from '../controllers/ChannelController';

/**
 * Create channel routes with dependency injection
 */
export function createChannelRoutes(controller: ChannelController): Hono {
  const app = new Hono();

  /**
   * GET /api/channels
   * List all available channels for trading
   */
  app.get('/', (c) => controller.getChannels(c));

  /**
   * GET /api/channels/my-channels
   * Get user's channels by telegram ID
   */
  app.get('/my-channels', (c) => controller.getUserChannels(c));

  /**
   * GET /api/channels/listings
   * Get channel listings for a specific user
   */
  app.get('/listings', (c) => controller.getUserListings(c));

  /**
   * GET /api/channels/:id
   * Get channel by ID
   */
  app.get('/:id', (c) => controller.getChannel(c));

  /**
   * POST /api/channels
   * Create a new channel
   */
  app.post('/', (c) => controller.createChannel(c));

  /**
   * PUT /api/channels/:id
   * Update a channel
   */
  app.put('/:id', (c) => controller.updateChannel(c));

  /**
   * DELETE /api/channels/:id
   * Delete a channel
   */
  app.delete('/:id', (c) => controller.deleteChannel(c));

  /**
   * POST /api/channels/buy
   * Purchase a channel (delegates to PurchaseController in real implementation)
   */
  app.post('/buy', async (c) => {
    return c.json({
      success: true,
      message: 'Channel purchase should use PurchaseController'
    });
  });

  /**
   * POST /api/channels/sell
   * List a channel for sale
   */
  app.post('/sell', async (c) => {
    return c.json({
      success: true,
      message: 'Channel listing should use ChannelController.createListing'
    });
  });

  return app;
}
