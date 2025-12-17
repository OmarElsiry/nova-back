/**
 * Create Purchase Use Case
 * Handles the business logic for creating a purchase with held funds
 */

import type { ILogger } from '../../infrastructure/logging/ILogger';
import { PurchaseValidator, type CreatePurchaseInput } from '../../domain/purchase/PurchaseValidator';
import { PurchaseEntity, PurchaseStatus } from '../../domain/purchase/PurchaseEntity';
import { NotFoundError, BusinessLogicError, ValidationError } from '../../shared/errors/AppError';
import { randomBytes } from 'crypto';

export interface IUserRepository {
  findById(id: number): Promise<any>;
  update(id: number, data: any): Promise<any>;
}

export interface IPurchaseRepository {
  findByChannelId(channelId: number): Promise<any>;
  create(data: any): Promise<any>;
}

export interface IChannelRepository {
  findById(id: number): Promise<any>;
  update(id: number, data: any): Promise<any>;
}

const VERIFICATION_TIMEOUT_HOURS = 24;

export class CreatePurchaseUseCase {
  constructor(
    private userRepository: IUserRepository,
    private purchaseRepository: IPurchaseRepository,
    private channelRepository: IChannelRepository,
    private logger: ILogger
  ) {}

  /**
   * Execute the create purchase use case
   */
  async execute(input: unknown): Promise<PurchaseEntity> {
    this.logger.info('Creating new purchase', { input });

    // Validate input
    let validatedInput: CreatePurchaseInput;
    try {
      validatedInput = PurchaseValidator.validateCreatePurchase(input);
    } catch (error) {
      this.logger.warn('Purchase creation validation failed', error);
      throw error;
    }

    // Validate buyer and seller are different
    if (!PurchaseValidator.validateBuyerSellerDifferent(validatedInput.buyerId, validatedInput.sellerId)) {
      throw new ValidationError('Buyer and seller must be different');
    }

    // Check if buyer exists and has sufficient balance
    const buyer = await this.userRepository.findById(validatedInput.buyerId);
    if (!buyer) {
      throw new NotFoundError('Buyer', validatedInput.buyerId);
    }

    const price = BigInt(validatedInput.price);
    if (!PurchaseValidator.validatePrice(price)) {
      throw new ValidationError('Price must be greater than 0');
    }

    const buyerBalance = BigInt(buyer.balance);
    if (buyerBalance < price) {
      throw new BusinessLogicError('Insufficient balance', {
        required: price.toString(),
        available: buyerBalance.toString()
      });
    }

    // Check if seller exists
    const seller = await this.userRepository.findById(validatedInput.sellerId);
    if (!seller) {
      throw new NotFoundError('Seller', validatedInput.sellerId);
    }

    // Check if channel exists
    const channel = await this.channelRepository.findById(validatedInput.channelId);
    if (!channel) {
      throw new NotFoundError('Channel', validatedInput.channelId);
    }

    // Check if channel already has an active purchase
    const existingPurchase = await this.purchaseRepository.findByChannelId(validatedInput.channelId);
    if (existingPurchase && existingPurchase.status === 'held') {
      throw new BusinessLogicError('Channel already has an active purchase', {
        channelId: validatedInput.channelId
      });
    }

    // Create purchase entity
    const verificationToken = randomBytes(32).toString('hex');
    const verificationDeadline = new Date(Date.now() + VERIFICATION_TIMEOUT_HOURS * 60 * 60 * 1000);

    const purchaseEntity = new PurchaseEntity({
      id: 0, // Will be assigned by database
      channelId: validatedInput.channelId,
      buyerId: validatedInput.buyerId,
      sellerId: validatedInput.sellerId,
      price,
      heldAmount: price,
      status: PurchaseStatus.HELD,
      verificationToken,
      verificationDeadline,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Deduct from buyer's balance
    await this.userRepository.update(validatedInput.buyerId, {
      balance: (buyerBalance - price).toString()
    });

    // Update channel status
    await this.channelRepository.update(validatedInput.channelId, {
      status: 'sale_pending'
    });

    // Persist purchase
    const createdPurchase = await this.purchaseRepository.create({
      channelId: purchaseEntity.channelId,
      buyerId: purchaseEntity.buyerId,
      sellerId: purchaseEntity.sellerId,
      price: purchaseEntity.price.toString(),
      heldAmount: purchaseEntity.heldAmount.toString(),
      status: purchaseEntity.status,
      verificationToken: purchaseEntity.verificationToken,
      verificationDeadline: purchaseEntity.verificationDeadline
    });

    this.logger.info('Purchase created successfully', {
      purchaseId: createdPurchase.id,
      channelId: validatedInput.channelId,
      price: price.toString()
    });

    return new PurchaseEntity({
      id: createdPurchase.id,
      channelId: createdPurchase.channelId,
      buyerId: createdPurchase.buyerId,
      sellerId: createdPurchase.sellerId,
      price: BigInt(createdPurchase.price),
      heldAmount: BigInt(createdPurchase.heldAmount),
      status: createdPurchase.status,
      verificationToken: createdPurchase.verificationToken,
      verificationDeadline: createdPurchase.verificationDeadline,
      createdAt: createdPurchase.createdAt,
      updatedAt: createdPurchase.updatedAt
    });
  }
}
