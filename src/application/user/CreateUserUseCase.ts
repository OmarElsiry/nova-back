/**
 * Create User Use Case
 * Handles the business logic for creating a new user
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { UserValidator, type CreateUserInput } from '../../domain/user/UserValidator';
import { UserEntity } from '../../domain/user/UserEntity';
import { ConflictError, ValidationError } from '../../shared/errors/AppError';

export interface IUserRepository {
  findByTelegramId(telegramId: string): Promise<any>;
  create(data: any): Promise<any>;
}

export class CreateUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the create user use case
   */
  async execute(input: unknown): Promise<UserEntity> {
    this.logger.info('Creating new user', { input });

    // Validate input
    let validatedInput: CreateUserInput;
    try {
      validatedInput = UserValidator.validateCreateUser(input);
    } catch (error) {
      this.logger.warn('User creation validation failed', error);
      throw error;
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findByTelegramId(validatedInput.telegramId);
    if (existingUser) {
      this.logger.warn('User already exists', { telegramId: validatedInput.telegramId });
      throw new ConflictError('User already exists', {
        telegramId: validatedInput.telegramId
      });
    }

    // Create user entity
    const userEntity = new UserEntity({
      id: 0, // Will be assigned by database
      telegramId: validatedInput.telegramId,
      walletAddress: validatedInput.walletAddress,
      walletAddressVariants: validatedInput.walletAddressVariants || [],
      balance: 0n,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Persist to database
    const createdUser = await this.userRepository.create({
      telegramId: userEntity.telegramId,
      walletAddress: userEntity.walletAddress,
      walletAddressVariants: JSON.stringify(userEntity.walletAddressVariants),
      balance: userEntity.balance.toString()
    });

    this.logger.info('User created successfully', { userId: createdUser.id });

    // Return entity with database-assigned id
    return new UserEntity({
      id: createdUser.id,
      telegramId: createdUser.telegramId,
      walletAddress: createdUser.walletAddress,
      walletAddressVariants: JSON.parse(createdUser.walletAddressVariants || '[]'),
      balance: BigInt(createdUser.balance),
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt
    });
  }
}
