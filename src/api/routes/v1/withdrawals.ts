import { Hono } from 'hono';
import { getGlobalContainer } from '../../../infrastructure/di/container.setup';
import { WithdrawalController } from '../../controllers/WithdrawalController';
import type { ILogger } from '../../../infrastructure/logging/ILogger';

/**
 * Withdrawal Routes
 * 
 * Handles all withdrawal-related API endpoints:
 * - GET /api/v1/withdrawals - Get all withdrawals with pagination
 * - GET /api/v1/withdrawals/:id - Get withdrawal by ID
 * - POST /api/v1/withdrawals - Request new withdrawal
 * - GET /api/v1/withdrawals/:id/status - Get withdrawal status
 */

export function createWithdrawalRoutes(): Hono {
  const router = new Hono();
  const container = getGlobalContainer();
  const logger = container.resolve<ILogger>('logger');
  const controller = new WithdrawalController(logger, container);

  /**
   * GET /api/v1/withdrawals
   * Get all withdrawals with pagination
   * 
   * Query parameters:
   * - page: number (default: 1)
   * - pageSize: number (default: 10, max: 100)
   * 
   * Response: 200 OK with paginated withdrawal list
   * Errors: 400 Bad Request, 500 Internal Server Error
   */
  router.get('/', async (c) => {
    try {
      logger.info('GET /withdrawals - Getting all withdrawals');
      return await controller.getWithdrawals(c);
    } catch (error) {
      logger.error('GET /withdrawals failed', error);
      throw error;
    }
  });

  /**
   * GET /api/v1/withdrawals/:id
   * Get withdrawal by ID
   * 
   * Response: 200 OK with withdrawal data
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id', async (c) => {
    try {
      logger.info(`GET /withdrawals/:id - withdrawalId: ${c.req.param('id')}`);
      return await controller.getWithdrawal(c);
    } catch (error) {
      logger.error(`GET /withdrawals/:id failed`, error);
      throw error;
    }
  });

  /**
   * POST /api/v1/withdrawals
   * Request new withdrawal
   * 
   * Request body:
   * {
   *   userId: number,
   *   amount: string (BigInt as string),
   *   walletAddress: string
   * }
   * 
   * Response: 201 Created with withdrawal data
   * Errors: 400 Bad Request, 422 Unprocessable Entity, 500 Internal Server Error
   */
  router.post('/', async (c) => {
    try {
      logger.info('POST /withdrawals - Requesting new withdrawal');
      return await controller.requestWithdrawal(c);
    } catch (error) {
      logger.error('POST /withdrawals failed', error);
      throw error;
    }
  });

  /**
   * GET /api/v1/withdrawals/:id/status
   * Get withdrawal status
   * 
   * Response: 200 OK with withdrawal status
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id/status', async (c) => {
    try {
      logger.info(`GET /withdrawals/:id/status - withdrawalId: ${c.req.param('id')}`);
      return await controller.getWithdrawalStatus(c);
    } catch (error) {
      logger.error(`GET /withdrawals/:id/status failed`, error);
      throw error;
    }
  });

  return router;
}
