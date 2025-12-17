/**
 * Withdrawal Validator
 * Validates withdrawal data according to business rules
 */

import { z } from 'zod';
import { ValidationError } from '../../shared/errors/AppError';

/**
 * Schema for requesting a withdrawal
 */
export const RequestWithdrawalSchema = z.object({
  userId: z.number().int().positive('User ID must be positive'),
  destinationAddress: z.string().min(1, 'Destination address is required'),
  amountNano: z.string().regex(/^\d+$/, 'Amount must be a valid number string')
});

export type RequestWithdrawalInput = z.infer<typeof RequestWithdrawalSchema>;

/**
 * Schema for processing a withdrawal
 */
export const ProcessWithdrawalSchema = z.object({
  withdrawalId: z.number().int().positive('Withdrawal ID must be positive')
});

export type ProcessWithdrawalInput = z.infer<typeof ProcessWithdrawalSchema>;

/**
 * Schema for completing a withdrawal
 */
export const CompleteWithdrawalSchema = z.object({
  withdrawalId: z.number().int().positive('Withdrawal ID must be positive'),
  transactionHash: z.string().min(1, 'Transaction hash is required')
});

export type CompleteWithdrawalInput = z.infer<typeof CompleteWithdrawalSchema>;

/**
 * Withdrawal Validator class
 */
export class WithdrawalValidator {
  private static readonly MIN_WITHDRAWAL_NANO = 1_000_000n; // 0.001 TON
  private static readonly MAX_WITHDRAWAL_NANO = 1_000_000_000_000n; // 1000 TON
  private static readonly DAILY_LIMIT_NANO = 100_000_000_000n; // 100 TON

  /**
   * Validate request withdrawal input
   */
  static validateRequestWithdrawal(data: unknown): RequestWithdrawalInput {
    try {
      return RequestWithdrawalSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid withdrawal request data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate process withdrawal input
   */
  static validateProcessWithdrawal(data: unknown): ProcessWithdrawalInput {
    try {
      return ProcessWithdrawalSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid withdrawal processing data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate complete withdrawal input
   */
  static validateCompleteWithdrawal(data: unknown): CompleteWithdrawalInput {
    try {
      return CompleteWithdrawalSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid withdrawal completion data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate withdrawal amount
   */
  static validateAmount(amountNano: bigint): boolean {
    return amountNano >= this.MIN_WITHDRAWAL_NANO && amountNano <= this.MAX_WITHDRAWAL_NANO;
  }

  /**
   * Validate minimum withdrawal
   */
  static validateMinimumAmount(amountNano: bigint): boolean {
    return amountNano >= this.MIN_WITHDRAWAL_NANO;
  }

  /**
   * Validate maximum withdrawal
   */
  static validateMaximumAmount(amountNano: bigint): boolean {
    return amountNano <= this.MAX_WITHDRAWAL_NANO;
  }

  /**
   * Validate daily limit
   */
  static validateDailyLimit(totalWithdrawnToday: bigint, newAmount: bigint): boolean {
    return totalWithdrawnToday + newAmount <= this.DAILY_LIMIT_NANO;
  }

  /**
   * Validate destination address format
   */
  static validateDestinationAddress(address: string): boolean {
    // Basic validation - can be extended with TON address validation
    return address.length > 0 && address.length < 256;
  }

  /**
   * Validate transaction hash format
   */
  static validateTransactionHash(hash: string): boolean {
    return hash.length >= 64; // At least 64 characters for hex hash
  }

  /**
   * Get minimum withdrawal amount in TON
   */
  static getMinimumAmountTon(): number {
    return Number(this.MIN_WITHDRAWAL_NANO) / 1_000_000_000;
  }

  /**
   * Get maximum withdrawal amount in TON
   */
  static getMaximumAmountTon(): number {
    return Number(this.MAX_WITHDRAWAL_NANO) / 1_000_000_000;
  }

  /**
   * Get daily limit in TON
   */
  static getDailyLimitTon(): number {
    return Number(this.DAILY_LIMIT_NANO) / 1_000_000_000;
  }
}
