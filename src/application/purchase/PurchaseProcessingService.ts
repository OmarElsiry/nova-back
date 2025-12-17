/**
 * Purchase Processing Application Service
 * Orchestrates purchase business logic using domain services
 * NO BUSINESS LOGIC HERE - only orchestration
 */

import type { IPurchaseRepository } from '../../domain/purchase/IPurchaseRepository';
import type { IUserRepository } from '../../domain/user/IUserRepository';
import type { IChannelRepository } from '../../domain/channel/IChannelRepository';
import type { IEventBus } from '../../domain/events/IEventBus';
import type { ILogger } from '../../infrastructure/logging/ILogger';

import { PurchaseAggregate, PurchaseStatus } from '../../domain/purchase/PurchaseAggregate';
import { PurchaseValidationService } from '../../domain/purchase/PurchaseValidation';
import { PurchaseFraudDetectionService } from '../../domain/purchase/PurchaseFraudDetection';
import crypto from 'crypto';

export interface CreatePurchaseCommand {
  channelId: number;
  buyerId: number;
  sellerId: number;
  price: number;
}

export interface VerifyPurchaseCommand {
  purchaseId: string;
  verificationToken?: string;
  skipTokenCheck?: boolean;
}

export interface PurchaseResult {
  success: boolean;
  purchaseId?: string;
  verificationToken?: string;
  verificationDeadline?: Date;
  error?: string;
  data?: any;
}

export class PurchaseProcessingService {
  constructor(
    private readonly purchaseRepository: IPurchaseRepository,
    private readonly userRepository: IUserRepository,
    private readonly channelRepository: IChannelRepository,
    private readonly validationService: PurchaseValidationService,
    private readonly fraudService: PurchaseFraudDetectionService,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly config: {
      verificationTimeoutHours: number;
      gracePeriodMinutes: number;
    }
  ) {}

  /**
   * Create a new purchase with escrow
   */
  async createPurchase(command: CreatePurchaseCommand): Promise<PurchaseResult> {
    try {
      // Load entities
      const [buyer, seller, channel] = await Promise.all([
        this.userRepository.findById(command.buyerId),
        this.userRepository.findById(command.sellerId),
        this.channelRepository.findById(command.channelId)
      ]);

      if (!buyer) {
        return { success: false, error: 'Buyer not found' };
      }

      if (!seller) {
        return { success: false, error: 'Seller not found' };
      }

      if (!channel) {
        return { success: false, error: 'Channel not found' };
      }

      // Check for active purchase
      const hasActivePurchase = await this.purchaseRepository.hasActivePurchase(
        command.channelId
      );

      // Validate purchase
      const validationResult = this.validationService.validatePurchaseCreation({
        buyerBalance: buyer.balance,
        price: command.price,
        isBuyerBanned: buyer.isBanned || false,
        hasActivePurchase,
        isSellerActive: seller.isActive || true
      });

      if (!validationResult.isValid) {
        return { 
          success: false, 
          error: validationResult.errors.join(', ') 
        };
      }

      // Generate verification token and deadline
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationDeadline = new Date(
        Date.now() + this.config.verificationTimeoutHours * 60 * 60 * 1000
      );

      // Create purchase aggregate
      const purchaseId = this.generatePurchaseId(command);
      const purchase = PurchaseAggregate.create(
        purchaseId,
        command.channelId,
        command.buyerId,
        command.sellerId,
        command.price,
        verificationToken,
        verificationDeadline,
        channel.gifts // Store original gifts
      );

      // Transaction: Hold funds and create purchase
      await this.userRepository.beginTransaction(async () => {
        // Deduct from buyer (escrow)
        buyer.deductBalance(command.price);
        await this.userRepository.save(buyer);

        // Save purchase
        await this.purchaseRepository.save(purchase);

        // Update channel status
        channel.setStatus('sale_pending');
        await this.channelRepository.save(channel);
      });

      // Publish event
      await this.eventBus.publish({
        eventType: 'purchase.created',
        eventVersion: 1,
        aggregateId: purchaseId,
        occurredAt: new Date(),
        metadata: {
          buyerId: command.buyerId,
          sellerId: command.sellerId,
          channelId: command.channelId,
          price: command.price
        }
      });

      this.logger.info(`Purchase ${purchaseId} created with escrow`, {
        purchaseId,
        price: command.price
      });

      return {
        success: true,
        purchaseId,
        verificationToken,
        verificationDeadline,
        data: {
          message: 'Purchase created. Funds held in escrow. Please confirm channel ownership within 24 hours.'
        }
      };
    } catch (error) {
      this.logger.error('Failed to create purchase', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create purchase' 
      };
    }
  }

  /**
   * Verify purchase and release funds
   */
  async verifyPurchase(command: VerifyPurchaseCommand): Promise<PurchaseResult> {
    try {
      // Load purchase
      const purchase = await this.purchaseRepository.findById(command.purchaseId);
      if (!purchase) {
        return { success: false, error: 'Purchase not found' };
      }

      // Check verification deadline
      const deadlineResult = this.validationService.validateVerificationDeadline(
        purchase.verificationDeadline
      );

      if (!deadlineResult.isValid) {
        await this.handleExpiredPurchase(purchase);
        return { 
          success: false, 
          error: 'Verification deadline passed. Purchase cancelled and funds refunded.' 
        };
      }

      // Check grace period
      const gracePeriod = this.validationService.validateGracePeriod(
        purchase.metadata.sellerConfirmedAt || null
      );

      if (gracePeriod.inGracePeriod && !command.skipTokenCheck) {
        return {
          success: false,
          error: `Verification locked for ${gracePeriod.minutesLeft} more minutes`,
          data: {
            gracePeriodActive: true,
            minutesLeft: gracePeriod.minutesLeft
          }
        };
      }

      // Verify token
      if (!command.skipTokenCheck && command.verificationToken) {
        const tokenValid = this.validationService.validateVerificationToken(
          command.verificationToken,
          purchase.verificationToken
        );

        if (!tokenValid) {
          return { success: false, error: 'Invalid verification token' };
        }
      }

      // Load channel
      const channel = await this.channelRepository.findById(purchase.channelId);
      if (!channel) {
        return { success: false, error: 'Channel not found' };
      }

      // Verify ownership transfer
      const ownershipResult = this.fraudService.verifyOwnershipTransfer(
        purchase.buyerId.toString(),
        channel.userId.toString(),
        purchase.sellerId.toString()
      );

      // Verify gifts haven't been modified
      const giftResult = this.fraudService.verifyGifts(
        purchase.metadata.originalGifts || [],
        channel.gifts || []
      );

      // Handle fraud if detected
      if (!giftResult.verified) {
        await this.handleFraudulentPurchase(purchase, giftResult);
        return {
          success: false,
          error: 'Verification failed: Channel gifts were modified. Purchase cancelled and seller warned.'
        };
      }

      // Verify purchase
      purchase.verify(ownershipResult.verified, giftResult.verified);

      if (purchase.status === PurchaseStatus.COMPLETED) {
        // Transfer funds to seller
        const seller = await this.userRepository.findById(purchase.sellerId);
        if (seller) {
          seller.addBalance(purchase.price);
          await this.userRepository.save(seller);
        }

        // Update channel
        channel.setUserId(purchase.buyerId);
        channel.setStatus('sold');
        await this.channelRepository.save(channel);
      }

      // Save purchase
      await this.purchaseRepository.save(purchase);

      // Publish event
      await this.eventBus.publish({
        eventType: 'purchase.verified',
        eventVersion: 1,
        aggregateId: purchase.id,
        occurredAt: new Date(),
        metadata: {
          ownershipVerified: ownershipResult.verified,
          giftsVerified: giftResult.verified
        }
      });

      return {
        success: true,
        purchaseId: purchase.id,
        data: {
          ownershipVerified: ownershipResult.verified,
          giftsVerified: giftResult.verified,
          message: 'Purchase verified successfully. Funds released to seller.'
        }
      };
    } catch (error) {
      this.logger.error('Failed to verify purchase', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify purchase'
      };
    }
  }

  /**
   * Confirm transfer by seller
   */
  async confirmTransfer(purchaseId: string, sellerId: number): Promise<PurchaseResult> {
    try {
      const purchase = await this.purchaseRepository.findById(purchaseId);
      if (!purchase) {
        return { success: false, error: 'Purchase not found' };
      }

      if (purchase.sellerId !== sellerId) {
        return { success: false, error: 'Not authorized' };
      }

      purchase.confirmTransfer();
      await this.purchaseRepository.save(purchase);

      return {
        success: true,
        data: {
          message: 'Transfer confirmed. Verification window started (30 mins).',
          sellerConfirmedAt: purchase.metadata.sellerConfirmedAt
        }
      };
    } catch (error) {
      this.logger.error('Failed to confirm transfer', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to confirm transfer'
      };
    }
  }

  /**
   * Handle expired purchase
   */
  private async handleExpiredPurchase(purchase: PurchaseAggregate): Promise<void> {
    purchase.expire();
    
    // Refund buyer
    const buyer = await this.userRepository.findById(purchase.buyerId);
    if (buyer) {
      buyer.addBalance(purchase.price);
      await this.userRepository.save(buyer);
    }

    await this.purchaseRepository.save(purchase);

    await this.eventBus.publish({
      eventType: 'purchase.expired',
      eventVersion: 1,
      aggregateId: purchase.id,
      occurredAt: new Date()
    });
  }

  /**
   * Handle fraudulent purchase
   */
  private async handleFraudulentPurchase(
    purchase: PurchaseAggregate,
    giftResult: any
  ): Promise<void> {
    purchase.cancel('Gifts modified during purchase - fraud detected');
    
    // Refund buyer
    const buyer = await this.userRepository.findById(purchase.buyerId);
    if (buyer) {
      buyer.addBalance(purchase.price);
      await this.userRepository.save(buyer);
    }

    // Suspend channel
    const channel = await this.channelRepository.findById(purchase.channelId);
    if (channel) {
      channel.setStatus('suspended');
      await this.channelRepository.save(channel);
    }

    await this.purchaseRepository.save(purchase);

    // Publish fraud event
    const fraudEvent = this.fraudService.generateFraudEvent(
      purchase.id,
      purchase.sellerId.toString(),
      'gift_modification',
      giftResult
    );

    await this.eventBus.publish(fraudEvent);
  }

  /**
   * Generate unique purchase ID
   */
  private generatePurchaseId(command: CreatePurchaseCommand): string {
    const hash = crypto.createHash('sha256');
    hash.update(command.channelId.toString());
    hash.update(command.buyerId.toString());
    hash.update(command.sellerId.toString());
    hash.update(Date.now().toString());
    return `pur_${hash.digest('hex').substring(0, 16)}`;
  }
}
