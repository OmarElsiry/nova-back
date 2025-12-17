/**
 * User Validator
 * Validates user data according to business rules
 */

import { z } from 'zod';
import { ValidationError } from '../../shared/errors/AppError';

/**
 * Schema for creating a new user
 */
export const CreateUserSchema = z.object({
  telegramId: z.string().min(1, 'Telegram ID is required'),
  walletAddress: z.string().optional(),
  walletAddressVariants: z.array(z.string()).optional()
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/**
 * Schema for updating user
 */
export const UpdateUserSchema = z.object({
  walletAddress: z.string().optional(),
  walletAddressVariants: z.array(z.string()).optional()
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

/**
 * Schema for linking wallet
 */
export const LinkWalletSchema = z.object({
  walletAddress: z.string().min(1, 'Wallet address is required'),
  variants: z.array(z.string()).optional()
});

export type LinkWalletInput = z.infer<typeof LinkWalletSchema>;

/**
 * User Validator class
 */
export class UserValidator {
  /**
   * Validate create user input
   */
  static validateCreateUser(data: unknown): CreateUserInput {
    try {
      return CreateUserSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid user data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate update user input
   */
  static validateUpdateUser(data: unknown): UpdateUserInput {
    try {
      return UpdateUserSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid update data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate link wallet input
   */
  static validateLinkWallet(data: unknown): LinkWalletInput {
    try {
      return LinkWalletSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid wallet data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate telegram ID
   */
  static validateTelegramId(telegramId: string): boolean {
    return telegramId.length > 0;
  }

  /**
   * Validate wallet address format
   */
  static validateWalletAddress(address: string): boolean {
    // Basic validation - can be extended with TON address validation
    return address.length > 0;
  }

  /**
   * Validate balance amount
   */
  static validateBalance(balance: bigint): boolean {
    return balance >= 0n;
  }
}
