import { Hono } from 'hono';
import { getGlobalContainer } from '../../../infrastructure/di/container.setup';
import { UserController } from '../../controllers/UserController';
import type { ILogger } from '../../../infrastructure/logging/ILogger';

/**
 * User Routes
 * 
 * Handles all user-related API endpoints:
 * - GET /api/v1/users/:id - Get user by ID
 * - POST /api/v1/users - Create new user
 * - PUT /api/v1/users/:id - Update user
 * - DELETE /api/v1/users/:id - Delete user
 * - POST /api/v1/users/:id/link-wallet - Link wallet to user
 * - GET /api/v1/users/:id/balance - Get user balance
 */

export function createUserRoutes(): Hono {
  const router = new Hono();
  const container = getGlobalContainer();
  const logger = container.resolve<ILogger>('logger');
  const controller = new UserController(logger, container);

  /**
   * GET /api/v1/users/:id
   * Get user by ID
   * 
   * Response: 200 OK with user data
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id', async (c) => {
    try {
      logger.info(`GET /users/:id - userId: ${c.req.param('id')}`);
      return await controller.getUser(c);
    } catch (error) {
      logger.error(`GET /users/:id failed`, error);
      throw error;
    }
  });

  /**
   * POST /api/v1/users
   * Create new user
   * 
   * Request body:
   * {
   *   telegramId: number,
   *   walletAddress?: string
   * }
   * 
   * Response: 201 Created with user data
   * Errors: 400 Bad Request, 409 Conflict, 500 Internal Server Error
   */
  router.post('/', async (c) => {
    try {
      logger.info('POST /users - Creating new user');
      return await controller.createUser(c);
    } catch (error) {
      logger.error('POST /users failed', error);
      throw error;
    }
  });

  /**
   * PUT /api/v1/users/:id
   * Update user
   * 
   * Request body:
   * {
   *   telegramId?: number,
   *   walletAddress?: string
   * }
   * 
   * Response: 200 OK with updated user data
   * Errors: 400 Bad Request, 404 Not Found, 500 Internal Server Error
   */
  router.put('/:id', async (c) => {
    try {
      logger.info(`PUT /users/:id - userId: ${c.req.param('id')}`);
      return await controller.updateUser(c);
    } catch (error) {
      logger.error(`PUT /users/:id failed`, error);
      throw error;
    }
  });

  /**
   * DELETE /api/v1/users/:id
   * Delete user
   * 
   * Response: 204 No Content
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.delete('/:id', async (c) => {
    try {
      logger.info(`DELETE /users/:id - userId: ${c.req.param('id')}`);
      return await controller.deleteUser(c);
    } catch (error) {
      logger.error(`DELETE /users/:id failed`, error);
      throw error;
    }
  });

  /**
   * POST /api/v1/users/:id/link-wallet
   * Link wallet to user
   * 
   * Request body:
   * {
   *   walletAddress: string
   * }
   * 
   * Response: 200 OK with updated user data
   * Errors: 400 Bad Request, 404 Not Found, 409 Conflict, 500 Internal Server Error
   */
  router.post('/:id/link-wallet', async (c) => {
    try {
      logger.info(`POST /users/:id/link-wallet - userId: ${c.req.param('id')}`);
      return await controller.linkWallet(c);
    } catch (error) {
      logger.error(`POST /users/:id/link-wallet failed`, error);
      throw error;
    }
  });

  /**
   * GET /api/v1/users/:id/balance
   * Get user balance
   * 
   * Response: 200 OK with balance data
   * Errors: 404 Not Found, 500 Internal Server Error
   */
  router.get('/:id/balance', async (c) => {
    try {
      logger.info(`GET /users/:id/balance - userId: ${c.req.param('id')}`);
      return await controller.getBalance(c);
    } catch (error) {
      logger.error(`GET /users/:id/balance failed`, error);
      throw error;
    }
  });

  return router;
}
