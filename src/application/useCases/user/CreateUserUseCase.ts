import { z } from 'zod';
import { Result } from '../../../core/shared/Result';
import type { IUserRepository } from '../../../infrastructure/repositories/UserRepository';
import type { IEventBus } from '../../../infrastructure/services/IEventBus';

/**
 * Command for creating a user
 */
export const CreateUserCommand = z.object({
  telegramId: z.string().min(1).regex(/^\d+$/),
  walletAddress: z.string().min(1),
  walletAddressVariants: z.array(z.string()).optional(),
});

export type CreateUserCommandDTO = z.infer<typeof CreateUserCommand>;

/**
 * Use case for creating a new user
 * Follows Single Responsibility Principle - only handles user creation
 */
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus?: IEventBus
  ) {}

  async execute(command: CreateUserCommandDTO): Promise<Result<{ userId: number }>> {
    try {
      // Validate command
      const validated = CreateUserCommand.parse(command);

      // Check if user already exists
      const existingUser = await this.userRepository.findByTelegramId(validated.telegramId);
      if (existingUser) {
        return Result.fail<{ userId: number }>('User with this Telegram ID already exists');
      }

      // Check wallet address uniqueness
      const userWithWallet = await this.userRepository.findByWalletAddress(validated.walletAddress);
      if (userWithWallet) {
        return Result.fail<{ userId: number }>('Wallet address is already in use');
      }

      // Prepare user data
      const variants = validated.walletAddressVariants || [validated.walletAddress];
      
      // Create user
      const newUser = await this.userRepository.save({
        telegramId: validated.telegramId,
        walletAddress: validated.walletAddress,
        walletAddressVariants: JSON.stringify(variants),
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Emit domain event
      await this.eventBus?.publish({
        type: 'UserCreated',
        payload: {
          userId: newUser.id,
          telegramId: newUser.telegramId,
          walletAddress: newUser.walletAddress,
        },
        occurredAt: new Date(),
      });

      return Result.ok({ userId: newUser.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Result.fail<{ userId: number }>(
          `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        );
      }
      return Result.fail<{ userId: number }>(
        error instanceof Error ? error.message : 'Failed to create user'
      );
    }
  }
}
