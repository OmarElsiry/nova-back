/**
 * Data Validator
 * Validates data before persistence to database
 */

import { z } from 'zod';
import { ValidationError } from '../../shared/errors/AppError';

/**
 * User data validation schema
 */
export const UserDataSchema = z.object({
  telegramId: z.string().min(1, 'Telegram ID is required'),
  walletAddress: z.string().optional(),
  walletAddressVariants: z.array(z.string()).optional(),
  balance: z.bigint().nonnegative('Balance cannot be negative')
});

export type UserData = z.infer<typeof UserDataSchema>;

/**
 * Channel data validation schema
 */
export const ChannelDataSchema = z.object({
  name: z.string().min(1, 'Channel name is required'),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active')
});

export type ChannelData = z.infer<typeof ChannelDataSchema>;

/**
 * Purchase data validation schema
 */
export const PurchaseDataSchema = z.object({
  channelId: z.number().int().positive('Channel ID must be positive'),
  buyerId: z.number().int().positive('Buyer ID must be positive'),
  sellerId: z.number().int().positive('Seller ID must be positive'),
  price: z.bigint().positive('Price must be positive'),
  heldAmount: z.bigint().positive('Held amount must be positive'),
  status: z.enum(['held', 'verified', 'completed', 'refunded', 'cancelled']).default('held'),
  verificationToken: z.string().optional(),
  verificationDeadline: z.date().optional()
});

export type PurchaseData = z.infer<typeof PurchaseDataSchema>;

/**
 * Withdrawal data validation schema
 */
export const WithdrawalDataSchema = z.object({
  userId: z.number().int().positive('User ID must be positive'),
  destinationAddress: z.string().min(1, 'Destination address is required'),
  amountNano: z.bigint().positive('Amount must be positive'),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).default('pending'),
  transactionHash: z.string().optional(),
  failureReason: z.string().optional()
});

export type WithdrawalData = z.infer<typeof WithdrawalDataSchema>;

/**
 * Deposit data validation schema
 */
export const DepositDataSchema = z.object({
  userId: z.number().int().positive('User ID must be positive'),
  canonicalAddress: z.string().min(1, 'Canonical address is required'),
  transactionHash: z.string().min(1, 'Transaction hash is required'),
  amountNano: z.bigint().positive('Amount must be positive'),
  status: z.enum(['pending', 'confirmed', 'failed']).default('pending'),
  confirmationDepth: z.number().int().nonnegative('Confirmation depth must be non-negative').default(0),
  reorgSafe: z.boolean().default(false),
  metadata: z.record(z.any()).optional()
});

export type DepositData = z.infer<typeof DepositDataSchema>;

/**
 * Data Validator class
 */
export class DataValidator {
  /**
   * Validate user data
   */
  static validateUserData(data: unknown): UserData {
    try {
      return UserDataSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid user data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate channel data
   */
  static validateChannelData(data: unknown): ChannelData {
    try {
      return ChannelDataSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid channel data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate purchase data
   */
  static validatePurchaseData(data: unknown): PurchaseData {
    try {
      return PurchaseDataSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid purchase data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate withdrawal data
   */
  static validateWithdrawalData(data: unknown): WithdrawalData {
    try {
      return WithdrawalDataSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid withdrawal data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate deposit data
   */
  static validateDepositData(data: unknown): DepositData {
    try {
      return DepositDataSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid deposit data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate all data before persistence
   */
  static validateBeforePersistence(entityType: string, data: unknown): any {
    switch (entityType) {
      case 'user':
        return this.validateUserData(data);
      case 'channel':
        return this.validateChannelData(data);
      case 'purchase':
        return this.validatePurchaseData(data);
      case 'withdrawal':
        return this.validateWithdrawalData(data);
      case 'deposit':
        return this.validateDepositData(data);
      default:
        throw new ValidationError(`Unknown entity type: ${entityType}`);
    }
  }
}
