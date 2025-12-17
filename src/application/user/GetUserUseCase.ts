/**
 * Get User Use Case
 * Handles the business logic for retrieving user information
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { UserEntity } from '../../domain/user/UserEntity';
import { NotFoundError } from '../../shared/errors/AppError';

export interface IUserRepository {
  findById(id: number): Promise<any>;
  findByTelegramId(telegramId: string): Promise<any>;
}

export class GetUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    private logger: ILogger
  ) {}

  /**
   * Get user by ID
   */
  async executeById(userId: number): Promise<UserEntity> {
    this.logger.info('Fetching user by ID', { userId });

    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.warn('User not found', { userId });
      throw new NotFoundError('User', userId);
    }

    this.logger.info('User retrieved successfully', { userId });

    return this.mapToEntity(user);
  }

  /**
   * Get user by Telegram ID
   */
  async executeByTelegramId(telegramId: string): Promise<UserEntity> {
    this.logger.info('Fetching user by Telegram ID', { telegramId });

    const user = await this.userRepository.findByTelegramId(telegramId);
    if (!user) {
      this.logger.warn('User not found', { telegramId });
      throw new NotFoundError('User', telegramId);
    }

    this.logger.info('User retrieved successfully', { telegramId });

    return this.mapToEntity(user);
  }

  /**
   * Map database user to entity
   */
  private mapToEntity(user: any): UserEntity {
    return new UserEntity({
      id: user.id,
      telegramId: user.telegramId,
      walletAddress: user.walletAddress,
      walletAddressVariants: JSON.parse(user.walletAddressVariants || '[]'),
      balance: BigInt(user.balance),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  }
}
