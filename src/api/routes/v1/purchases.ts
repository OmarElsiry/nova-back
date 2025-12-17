import { Hono } from 'hono';
import { getGlobalContainer } from '../../../infrastructure/di/container.setup';
import { PurchaseController } from '../../controllers/PurchaseController';
import type { ILogger } from '../../../infrastructure/logging/ILogger';

/**
 * Purchase Routes
 * 
 * Handles all purchase-related API endpoints:
 * - GET /api/v1/purchases - Get all purchases with pagination
 * - GET /api/v1/purchases/:id - Get purchase by ID
 * - POST /api/v1/purchases - Create new purchase
 * - POST /api/v1/purchases/:id/confirm - Confirm purchase
 * - POST /api/v1/purchases/:id/refund - Refund purchase
 */

export function createPurchaseRoutes(): Hono {
  const router = new Hono();
  const container = getGlobalContainer();
  const logger = container.resolve<ILogger>('logger');
  const controller = new PurchaseController(logger, container);

  /**
   * GET /api/v1/purchases
   * Get all purchases with pagination
   * 
   * Query parameters:
   * - page: number (default: 1)
   * - pageSize: number (default: 10, max: 100)
   * 
   * Response: 200 OK with paginated purchase list
   * Errors: 400 Bad Request, 500 Internal Server Error
   */
  router.get('/', async (c) => {
    try {
      logger.info('GET /purchases - Getting all purchases');
      return await controller.getPurchases(c);
    } catch (error) {
      logger.error('GET /purchases failed', error);
      throw error;
    }
  });

  /**
   * GET /api/v1/purchases/:id
   * Get purchase by ID
   * 
   * Response: 200 OK with purchase data
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id', async (c) => {
    try {
      logger.info(`GET /purchases/:id - purchaseId: ${c.req.param('id')}`);
      return await controller.getPurchase(c);
    } catch (error) {
      logger.error(`GET /purchases/:id failed`, error);
      throw error;
    }
  });

  /**
   * POST /api/v1/purchases
   * Create new purchase
   * 
   * Request body:
   * {
   *   buyerId: number,
   *   sellerId: number,
   *   channelId: number,
   *   price: string (BigInt as string),
   *   token: string
   * }
   * 
   * Response: 201 Created with purchase data
   * Errors: 400 Bad Request, 409 Conflict, 500 Internal Server Error
   */
  router.post('/', async (c) => {
    try {
      logger.info('POST /purchases - Creating new purchase');
      return await controller.createPurchase(c);
    } catch (error) {
      logger.error('POST /purchases failed', error);
      throw error;
    }
  });

  /**
   * POST /api/v1/purchases/:id/confirm
   * Confirm purchase
   * 
   * Request body:
   * {
   *   verificationToken: string
   * }
   * 
   * Response: 200 OK with updated purchase data
   * Errors: 400 Bad Request, 404 Not Found, 500 Internal Server Error
   */
  router.post('/:id/confirm', async (c) => {
    try {
      logger.info(`POST /purchases/:id/confirm - purchaseId: ${c.req.param('id')}`);
      return await controller.confirmPurchase(c);
    } catch (error) {
      logger.error(`POST /purchases/:id/confirm failed`, error);
      throw error;
    }
  });

  /**
   * POST /api/v1/purchases/:id/refund
   * Refund purchase
   * 
   * Request body: {} (empty)
   * 
   * Response: 200 OK with updated purchase data
   * Errors: 400 Bad Request, 404 Not Found, 500 Internal Server Error
   */
  router.post('/:id/refund', async (c) => {
    try {
      logger.info(`POST /purchases/:id/refund - purchaseId: ${c.req.param('id')}`);
      return await controller.refundPurchase(c);
    } catch (error) {
      logger.error(`POST /purchases/:id/refund failed`, error);
      throw error;
    }
  });

  return router;
}
