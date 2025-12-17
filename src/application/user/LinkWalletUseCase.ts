/**
 * Link Wallet Use Case
 * Handles the business logic for linking a wallet to a user
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { UserValidator, type LinkWalletInput } from '../../domain/user/UserValidator';
import { UserEntity } from '../../domain/user/UserEntity';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';

export interface IUserRepository {
  findById(id: number): Promise<any>;
  update(id: number, data: any): Promise<any>;
}

export class LinkWalletUseCase {
  constructor(
    private userRepository: IUserRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the link wallet use case
   */
  async execute(userId: number, input: unknown): Promise<UserEntity> {
    this.logger.info('Linking wallet to user', { userId, input });

    // Validate input
    let validatedInput: LinkWalletInput;
    try {
      validatedInput = UserValidator.validateLinkWallet(input);
    } catch (error) {
      this.logger.warn('Wallet linking validation failed', error);
      throw error;
    }

    // Get user
    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.warn('User not found', { userId });
      throw new NotFoundError('User', userId);
    }

    // Create user entity
    const userEntity = this.mapToEntity(user);

    // Link wallet
    userEntity.linkWallet(validatedInput.walletAddress, validatedInput.variants);

    // Persist changes
    const updatedUser = await this.userRepository.update(userId, {
      walletAddress: userEntity.walletAddress,
      walletAddressVariants: JSON.stringify(userEntity.walletAddressVariants)
    });

    this.logger.info('Wallet linked successfully', {
      userId,
      walletAddress: validatedInput.walletAddress
    });

    return this.mapToEntity(updatedUser);
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
