/**
 * Confirm Purchase Use Case
 * Handles the business logic for confirming a purchase after verification
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { PurchaseValidator, type VerifyPurchaseInput } from '../../domain/purchase/PurchaseValidator';
import { PurchaseEntity } from '../../domain/purchase/PurchaseEntity';
import { NotFoundError, BusinessLogicError } from '../../shared/errors/AppError';

export interface IPurchaseRepository {
  findById(id: number): Promise<any>;
  update(id: number, data: any): Promise<any>;
}

export interface IUserRepository {
  findById(id: number): Promise<any>;
  update(id: number, data: any): Promise<any>;
}

export class ConfirmPurchaseUseCase {
  constructor(
    private purchaseRepository: IPurchaseRepository,
    private userRepository: IUserRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the confirm purchase use case
   */
  async execute(input: unknown): Promise<PurchaseEntity> {
    this.logger.info('Confirming purchase', { input });

    // Validate input
    let validatedInput: VerifyPurchaseInput;
    try {
      validatedInput = PurchaseValidator.validateVerifyPurchase(input);
    } catch (error) {
      this.logger.warn('Purchase confirmation validation failed', error);
      throw error;
    }

    // Get purchase
    const purchase = await this.purchaseRepository.findById(validatedInput.purchaseId);
    if (!purchase) {
      throw new NotFoundError('Purchase', validatedInput.purchaseId);
    }

    // Create entity
    const purchaseEntity = this.mapToEntity(purchase);

    // Verify token
    if (purchaseEntity.verificationToken !== validatedInput.verificationToken) {
      throw new BusinessLogicError('Invalid verification token');
    }

    // Verify purchase
    purchaseEntity.verify();

    // Get seller
    const seller = await this.userRepository.findById(purchaseEntity.sellerId);
    if (!seller) {
      throw new NotFoundError('Seller', purchaseEntity.sellerId);
    }

    // Transfer funds to seller
    const sellerBalance = BigInt(seller.balance);
    await this.userRepository.update(purchaseEntity.sellerId, {
      balance: (sellerBalance + purchaseEntity.price).toString()
    });

    // Update purchase status
    const updatedPurchase = await this.purchaseRepository.update(validatedInput.purchaseId, {
      status: purchaseEntity.status,
      verificationToken: null // Clear token after verification
    });

    this.logger.info('Purchase confirmed successfully', {
      purchaseId: validatedInput.purchaseId,
      sellerId: purchaseEntity.sellerId,
      amount: purchaseEntity.price.toString()
    });

    return this.mapToEntity(updatedPurchase);
  }

  /**
   * Map database purchase to entity
   */
  private mapToEntity(purchase: any): PurchaseEntity {
    return new PurchaseEntity({
      id: purchase.id,
      channelId: purchase.channelId,
      buyerId: purchase.buyerId,
      sellerId: purchase.sellerId,
      price: BigInt(purchase.price),
      heldAmount: BigInt(purchase.heldAmount),
      status: purchase.status,
      verificationToken: purchase.verificationToken,
      verificationDeadline: purchase.verificationDeadline,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt
    });
  }
}
