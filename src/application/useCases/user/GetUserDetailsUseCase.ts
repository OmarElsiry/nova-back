import { z } from 'zod';
import { Result } from '../../../core/shared/Result';
import type { IUserRepository } from '../../../infrastructure/repositories/UserRepository';
import type { User as PrismaUser } from '@prisma/client';

/**
 * Query for getting user details
 */
export const GetUserDetailsQuery = z.object({
  userId: z.number().optional(),
  telegramId: z.string().optional(),
  walletAddress: z.string().optional(),
  includeTransactions: z.boolean().default(false),
  transactionLimit: z.number().default(10),
});

export type GetUserDetailsQueryDTO = z.infer<typeof GetUserDetailsQuery>;

/**
 * Response DTO for user details
 */
export interface UserDetailsResponse {
  id: number;
  telegramId: string;
  walletAddress: string;
  balance: number;
  createdAt: Date;
  transactions?: Array<{
    id: number;
    type: string;
    amount: number;
    createdAt: Date;
  }>;
  statistics?: {
    totalTransactions: number;
    totalDeposits: number;
    totalWithdrawals: number;
  };
}

/**
 * Use case for getting user details
 * Implements query logic for user information retrieval
 */
export class GetUserDetailsUseCase {
  constructor(
    private readonly userRepository: IUserRepository
  ) {}

  async execute(query: GetUserDetailsQueryDTO): Promise<Result<UserDetailsResponse>> {
    try {
      // Validate query
      const validated = GetUserDetailsQuery.parse(query);

      // Find user by appropriate identifier
      let user: PrismaUser | null = null;
      
      if (validated.userId) {
        user = await this.userRepository.findById(validated.userId.toString());
      } else if (validated.telegramId) {
        user = await this.userRepository.findByTelegramId(validated.telegramId);
      } else if (validated.walletAddress) {
        user = await this.userRepository.findByWalletAddress(validated.walletAddress);
      } else {
        return Result.fail<UserDetailsResponse>('No valid identifier provided');
      }

      if (!user) {
        return Result.fail<UserDetailsResponse>('User not found');
      }

      // Build response
      const response: UserDetailsResponse = {
        id: user.id,
        telegramId: user.telegramId,
        walletAddress: user.walletAddress,
        balance: user.balance,
        createdAt: user.createdAt,
      };

      // Include transactions if requested
      if (validated.includeTransactions) {
        const userWithTransactions = await this.userRepository.findWithTransactions(
          user.id,
          validated.transactionLimit
        );
        
        if (userWithTransactions && 'transactions' in userWithTransactions) {
          response.transactions = (userWithTransactions as any).transactions;
        }
      }

      return Result.ok(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Result.fail<UserDetailsResponse>(
          `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        );
      }
      return Result.fail<UserDetailsResponse>(
        error instanceof Error ? error.message : 'Failed to get user details'
      );
    }
  }
}
