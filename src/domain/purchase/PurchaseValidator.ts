/**
 * Purchase Validator
 * Validates purchase data according to business rules
 */

import { z } from 'zod';
import { ValidationError } from '../../shared/errors/AppError';

/**
 * Schema for creating a new purchase
 */
export const CreatePurchaseSchema = z.object({
  channelId: z.number().int().positive('Channel ID must be positive'),
  buyerId: z.number().int().positive('Buyer ID must be positive'),
  sellerId: z.number().int().positive('Seller ID must be positive'),
  price: z.string().regex(/^\d+$/, 'Price must be a valid number string')
});

export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;

/**
 * Schema for verifying a purchase
 */
export const VerifyPurchaseSchema = z.object({
  purchaseId: z.number().int().positive('Purchase ID must be positive'),
  verificationToken: z.string().min(1, 'Verification token is required')
});

export type VerifyPurchaseInput = z.infer<typeof VerifyPurchaseSchema>;

/**
 * Schema for completing a purchase
 */
export const CompletePurchaseSchema = z.object({
  purchaseId: z.number().int().positive('Purchase ID must be positive')
});

export type CompletePurchaseInput = z.infer<typeof CompletePurchaseSchema>;

/**
 * Schema for refunding a purchase
 */
export const RefundPurchaseSchema = z.object({
  purchaseId: z.number().int().positive('Purchase ID must be positive'),
  reason: z.string().optional()
});

export type RefundPurchaseInput = z.infer<typeof RefundPurchaseSchema>;

/**
 * Purchase Validator class
 */
export class PurchaseValidator {
  /**
   * Validate create purchase input
   */
  static validateCreatePurchase(data: unknown): CreatePurchaseInput {
    try {
      return CreatePurchaseSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid purchase data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate verify purchase input
   */
  static validateVerifyPurchase(data: unknown): VerifyPurchaseInput {
    try {
      return VerifyPurchaseSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid verification data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate complete purchase input
   */
  static validateCompletePurchase(data: unknown): CompletePurchaseInput {
    try {
      return CompletePurchaseSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid completion data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate refund purchase input
   */
  static validateRefundPurchase(data: unknown): RefundPurchaseInput {
    try {
      return RefundPurchaseSchema.parse(data);
    } catch (error: any) {
      throw new ValidationError('Invalid refund data', {
        errors: error.errors || error.message
      });
    }
  }

  /**
   * Validate price amount
   */
  static validatePrice(price: bigint): boolean {
    return price > 0n;
  }

  /**
   * Validate that buyer and seller are different
   */
  static validateBuyerSellerDifferent(buyerId: number, sellerId: number): boolean {
    return buyerId !== sellerId;
  }

  /**
   * Validate verification token format
   */
  static validateVerificationToken(token: string): boolean {
    return token.length >= 32; // At least 32 characters for security
  }
}
