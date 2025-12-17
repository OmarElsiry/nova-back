/**
 * Refund Purchase Use Case
 * Handles the business logic for refunding a purchase
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { PurchaseValidator, type RefundPurchaseInput } from '../../domain/purchase/PurchaseValidator';
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

export class RefundPurchaseUseCase {
  constructor(
    private purchaseRepository: IPurchaseRepository,
    private userRepository: IUserRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the refund purchase use case
   */
  async execute(input: unknown): Promise<PurchaseEntity> {
    this.logger.info('Refunding purchase', { input });

    // Validate input
    let validatedInput: RefundPurchaseInput;
    try {
      validatedInput = PurchaseValidator.validateRefundPurchase(input);
    } catch (error) {
      this.logger.warn('Purchase refund validation failed', error);
      throw error;
    }

    // Get purchase
    const purchase = await this.purchaseRepository.findById(validatedInput.purchaseId);
    if (!purchase) {
      throw new NotFoundError('Purchase', validatedInput.purchaseId);
    }

    // Create entity
    const purchaseEntity = this.mapToEntity(purchase);

    // Check if purchase can be refunded
    if (purchaseEntity.isCompleted() || purchaseEntity.isRefunded()) {
      throw new BusinessLogicError('Cannot refund completed or already refunded purchases');
    }

    // Get buyer
    const buyer = await this.userRepository.findById(purchaseEntity.buyerId);
    if (!buyer) {
      throw new NotFoundError('Buyer', purchaseEntity.buyerId);
    }

    // Calculate refund amount
    const refundAmount = purchaseEntity.getRefundAmount();

    // Refund to buyer
    const buyerBalance = BigInt(buyer.balance);
    await this.userRepository.update(purchaseEntity.buyerId, {
      balance: (buyerBalance + refundAmount).toString()
    });

    // Update purchase status
    purchaseEntity.refund();

    const updatedPurchase = await this.purchaseRepository.update(validatedInput.purchaseId, {
      status: purchaseEntity.status
    });

    this.logger.info('Purchase refunded successfully', {
      purchaseId: validatedInput.purchaseId,
      buyerId: purchaseEntity.buyerId,
      refundAmount: refundAmount.toString(),
      reason: validatedInput.reason
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
