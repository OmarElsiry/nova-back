/**
 * Deposit Validator
 * Validates deposit data according to business rules
 */

import { z } from 'zod';
import { ValidationError } from '../../shared/errors/AppError';

/**
 * Schema for processing a deposit
 */
export const ProcessDepositSchema = z.object({
  userId: z.number().int().positive('User ID must be positive'),
  canonicalAddress: z.string().min(1, 'Canonical address is required'),
  transactionHash: z.string().min(1, 'Transaction hash is required'),
  amountNano: z.string().regex(/^\d+$/, 'Amount must be a valid number string'),
  blockSeqno: z.number().int().nonnegative('Block seqno must be non-negative'),
  bounceFlag: z.boolean().optional()
});

export type ProcessDepositInput = z.infer<typeof ProcessDepositSchema>;

/**
 * Schema for confirming a deposit
 */
export const ConfirmDepositSchema = z.object({
  depositId: z.number().int().positive('Deposit ID must be positive'),
  confirmationDepth: z.number().int().nonnegative('Confirmation depth must be non-negative'),
  reorgSafe: z.boolean()
});

export type ConfirmDepositInput = z.infer<typeof ConfirmDepositSchema>;

/**
 * Deposit Validator class
 */
export class DepositValidator {
  private static readonly MIN_DEPOSIT_NANO = 1_000_000n; // 0.001 TON
  private static readonly MAX_DEPOSIT_NANO = 10_000_000_000_000n; // 10000 TON
  private static readonly REQUIRED_CONFIRMATIONS = 10;

  /**
   * Validate process deposit input
   */
  static validateProcessDeposit(data: unknown): ProcessDepositInput {
    try {
      return ProcessDepositSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid deposit processing data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate confirm deposit input
   */
  static validateConfirmDeposit(data: unknown): ConfirmDepositInput {
    try {
      return ConfirmDepositSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid deposit confirmation data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate deposit amount
   */
  static validateAmount(amountNano: bigint): boolean {
    return amountNano >= this.MIN_DEPOSIT_NANO && amountNano <= this.MAX_DEPOSIT_NANO;
  }

  /**
   * Validate minimum deposit
   */
  static validateMinimumAmount(amountNano: bigint): boolean {
    return amountNano >= this.MIN_DEPOSIT_NANO;
  }

  /**
   * Validate maximum deposit
   */
  static validateMaximumAmount(amountNano: bigint): boolean {
    return amountNano <= this.MAX_DEPOSIT_NANO;
  }

  /**
   * Validate canonical address format
   */
  static validateCanonicalAddress(address: string): boolean {
    return address.length > 0 && address.length < 256;
  }

  /**
   * Validate transaction hash format
   */
  static validateTransactionHash(hash: string): boolean {
    return hash.length >= 64; // At least 64 characters for hex hash
  }

  /**
   * Validate confirmation depth
   */
  static validateConfirmationDepth(depth: number): boolean {
    return depth >= this.REQUIRED_CONFIRMATIONS;
  }

  /**
   * Get minimum deposit amount in TON
   */
  static getMinimumAmountTon(): number {
    return Number(this.MIN_DEPOSIT_NANO) / 1_000_000_000;
  }

  /**
   * Get maximum deposit amount in TON
   */
  static getMaximumAmountTon(): number {
    return Number(this.MAX_DEPOSIT_NANO) / 1_000_000_000;
  }

  /**
   * Get required confirmations
   */
  static getRequiredConfirmations(): number {
    return this.REQUIRED_CONFIRMATIONS;
  }
}
