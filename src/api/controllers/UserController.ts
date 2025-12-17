import type { Context } from 'hono';
import { BaseController } from './BaseController';
import { DIContainer } from '../../infrastructure/di/DIContainer';
import { GetUserUseCase } from '../../application/user/GetUserUseCase';
import { CreateUserUseCase } from '../../application/user/CreateUserUseCase';
import { LinkWalletUseCase } from '../../application/user/LinkWalletUseCase';
import { UserValidator } from '../../domain/user/UserValidator';
import { ValidationError, NotFoundError } from '../../shared/errors/AppError';
import type { ILogger } from '../../infrastructure/logging/ILogger';

/**
 * UserController
 * 
 * Handles all user-related HTTP requests and responses.
 * Extends BaseController for common functionality.
 */
export class UserController extends BaseController {
  private getUserUseCase: GetUserUseCase;
  private createUserUseCase: CreateUserUseCase;
  private linkWalletUseCase: LinkWalletUseCase;
  private userValidator: UserValidator;

  constructor(logger: ILogger, container: DIContainer) {
    super(logger);
    this.getUserUseCase = container.resolve<GetUserUseCase>('getUserUseCase');
    this.createUserUseCase = container.resolve<CreateUserUseCase>('createUserUseCase');
    this.linkWalletUseCase = container.resolve<LinkWalletUseCase>('linkWalletUseCase');
    this.userValidator = new UserValidator();
  }

  /**
   * Get user by ID
   * 
   * @param c - Hono context
   * @returns User data or error response
   */
  async getUser(c: Context): Promise<Response> {
    try {
      const userId = this.getParam(c, 'id');
      const numUserId = parseInt(userId);

      this.logRequest(c, 'Get user');
      const user = await this.getUserUseCase.executeById(numUserId);

      this.logResponse(c, 'Get user', 200);
      return this.success(c, user, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Create new user
   * 
   * @param c - Hono context
   * @returns Created user data or error response
   */
  async createUser(c: Context): Promise<Response> {
    try {
      const body = await this.getBody<any>(c);

      this.logRequest(c, 'Create user');
      const user = await this.createUserUseCase.execute(body);

      this.logResponse(c, 'Create user', 201);
      return this.success(c, user, 201);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Update user
   * 
   * @param c - Hono context
   * @returns Updated user data or error response
   */
  async updateUser(c: Context): Promise<Response> {
    try {
      const userId = this.getParam(c, 'id');
      const numUserId = parseInt(userId);
      const body = await this.getBody<any>(c);

      this.logRequest(c, 'Update user');
      
      // Get existing user
      const user = await this.getUserUseCase.executeById(numUserId);

      // Update user (for now, we'll return the existing user)
      // In a real implementation, you would have an UpdateUserUseCase
      this.logResponse(c, 'Update user', 200);
      return this.success(c, user, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Delete user
   * 
   * @param c - Hono context
   * @returns No content or error response
   */
  async deleteUser(c: Context): Promise<Response> {
    try {
      const userId = this.getParam(c, 'id');
      const numUserId = parseInt(userId);

      this.logRequest(c, 'Delete user');
      
      // Get existing user (to verify it exists)
      await this.getUserUseCase.executeById(numUserId);

      // Delete user (for now, we'll return no content)
      // In a real implementation, you would have a DeleteUserUseCase
      this.logResponse(c, 'Delete user', 204);
      return c.json(null, 204 as any);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Link wallet to user
   * 
   * @param c - Hono context
   * @returns Updated user data or error response
   */
  async linkWallet(c: Context): Promise<Response> {
    try {
      const userId = this.getParam(c, 'id');
      const numUserId = parseInt(userId);
      const body = await this.getBody<any>(c);

      this.logRequest(c, 'Link wallet');
      const user = await this.linkWalletUseCase.execute(numUserId, body.walletAddress);

      this.logResponse(c, 'Link wallet', 200);
      return this.success(c, user, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }

  /**
   * Get user balance
   * 
   * @param c - Hono context
   * @returns User balance or error response
   */
  async getBalance(c: Context): Promise<Response> {
    try {
      const userId = this.getParam(c, 'id');
      const numUserId = parseInt(userId);

      this.logRequest(c, 'Get balance');
      const user = await this.getUserUseCase.executeById(numUserId);

      this.logResponse(c, 'Get balance', 200);
      return this.success(c, { userId: user.id, balance: user.balance }, 200);
    } catch (error) {
      return this.error(c, error);
    }
  }
}
