import { z } from 'zod';
import { Result } from '../../../core/shared/Result';
import type { IUserRepository } from '../../../infrastructure/repositories/UserRepository';
import type { IEventBus } from '../../../infrastructure/services/IEventBus';
import type { User as PrismaUser } from '@prisma/client';

/**
 * Command for updating user balance
 */
export const UpdateBalanceCommand = z.object({
  userId: z.number().positive(),
  amount: z.number(),
  operation: z.enum(['add', 'subtract', 'set']),
  reason: z.string().optional(),
  correlationId: z.string().optional(),
});

export type UpdateBalanceCommandDTO = z.infer<typeof UpdateBalanceCommand>;

/**
 * Use case for updating user balance
 * Implements business rules for balance modifications
 */
export class UpdateUserBalanceUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly eventBus?: IEventBus
  ) {}

  async execute(command: UpdateBalanceCommandDTO): Promise<Result<{ balance: number }>> {
    try {
      // Validate command
      const validated = UpdateBalanceCommand.parse(command);

      // Get user
      const user = await this.userRepository.findById(validated.userId.toString());
      if (!user) {
        return Result.fail<{ balance: number }>('User not found');
      }

      // Calculate new balance based on operation
      let newBalance: number;
      switch (validated.operation) {
        case 'add':
          newBalance = user.balance + validated.amount;
          break;
        case 'subtract':
          if (user.balance < validated.amount) {
            return Result.fail<{ balance: number }>('Insufficient balance');
          }
          newBalance = user.balance - validated.amount;
          break;
        case 'set':
          if (validated.amount < 0) {
            return Result.fail<{ balance: number }>('Balance cannot be negative');
          }
          newBalance = validated.amount;
          break;
      }

      // Update user balance
      const updatedUser = await this.userRepository.update(
        validated.userId.toString(),
        { balance: newBalance }
      );

      // Emit domain event
      await this.eventBus?.publish({
        type: 'BalanceUpdated',
        payload: {
          userId: user.id,
          previousBalance: user.balance,
          newBalance: updatedUser.balance,
          operation: validated.operation,
          amount: validated.amount,
          reason: validated.reason,
        },
        occurredAt: new Date(),
        correlationId: validated.correlationId,
      });

      return Result.ok({ balance: updatedUser.balance });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Result.fail<{ balance: number }>(
          `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        );
      }
      return Result.fail<{ balance: number }>(
        error instanceof Error ? error.message : 'Failed to update balance'
      );
    }
  }
}
