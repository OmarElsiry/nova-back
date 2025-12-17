import { Hono } from 'hono';
import { getGlobalContainer } from '../../../infrastructure/di/container.setup';
import { DepositController } from '../../controllers/DepositController';
import type { ILogger } from '../../../infrastructure/logging/ILogger';

/**
 * Deposit Routes
 * 
 * Handles all deposit-related API endpoints:
 * - GET /api/v1/deposits - Get all deposits with pagination
 * - GET /api/v1/deposits/:id - Get deposit by ID
 * - POST /api/v1/deposits - Process new deposit
 * - POST /api/v1/deposits/:id/confirm - Confirm deposit
 */

export function createDepositRoutes(): Hono {
  const router = new Hono();
  const container = getGlobalContainer();
  const logger = container.resolve<ILogger>('logger');
  const controller = new DepositController(logger, container);

  /**
   * GET /api/v1/deposits
   * Get all deposits with pagination
   * 
   * Query parameters:
   * - page: number (default: 1)
   * - pageSize: number (default: 10, max: 100)
   * 
   * Response: 200 OK with paginated deposit list
   * Errors: 400 Bad Request, 500 Internal Server Error
   */
  router.get('/', async (c) => {
    try {
      logger.info('GET /deposits - Getting all deposits');
      return await controller.getDeposits(c);
    } catch (error) {
      logger.error('GET /deposits failed', error);
      throw error;
    }
  });

  /**
   * GET /api/v1/deposits/:id
   * Get deposit by ID
   * 
   * Response: 200 OK with deposit data
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id', async (c) => {
    try {
      logger.info(`GET /deposits/:id - depositId: ${c.req.param('id')}`);
      return await controller.getDeposit(c);
    } catch (error) {
      logger.error(`GET /deposits/:id failed`, error);
      throw error;
    }
  });

  /**
   * POST /api/v1/deposits
   * Process new deposit
   * 
   * Request body:
   * {
   *   userId: number,
   *   amount: string (BigInt as string),
   *   transactionHash: string,
   *   fromAddress: string
   * }
   * 
   * Response: 201 Created with deposit data
   * Errors: 400 Bad Request, 422 Unprocessable Entity, 500 Internal Server Error
   */
  router.post('/', async (c) => {
    try {
      logger.info('POST /deposits - Processing new deposit');
      return await controller.processDeposit(c);
    } catch (error) {
      logger.error('POST /deposits failed', error);
      throw error;
    }
  });

  /**
   * POST /api/v1/deposits/:id/confirm
   * Confirm deposit
   * 
   * Request body:
   * {
   *   confirmationDepth: number
   * }
   * 
   * Response: 200 OK with updated deposit data
   * Errors: 400 Bad Request, 404 Not Found, 500 Internal Server Error
   */
  router.post('/:id/confirm', async (c) => {
    try {
      logger.info(`POST /deposits/:id/confirm - depositId: ${c.req.param('id')}`);
      return await controller.confirmDeposit(c);
    } catch (error) {
      logger.error(`POST /deposits/:id/confirm failed`, error);
      throw error;
    }
  });

  return router;
}
