/**
 * Purchase Fraud Detection Domain Service
 * Single Responsibility: Detect fraud and cheating in purchases
 */

import type { DomainEvent } from '../events/IEventBus';

export interface GiftVerificationResult {
  verified: boolean;
  modified: boolean;
  missingGifts: string[];
  addedGifts: string[];
  reason?: string;
}

export interface OwnershipVerificationResult {
  verified: boolean;
  isNewOwner: boolean;
  previousOwnerId?: string;
  currentOwnerId?: string;
  reason?: string;
}

export class PurchaseFraudDetectionService {
  /**
   * Verify gifts haven't been modified during purchase
   */
  verifyGifts(
    originalGifts: any[],
    currentGifts: any[]
  ): GiftVerificationResult {
    try {
      const originalGiftIds = new Set(originalGifts.map(g => g.id));
      const currentGiftIds = new Set(currentGifts.map(g => g.id));

      // Find missing gifts (removed by seller)
      const missingGifts: string[] = [];
      for (const id of originalGiftIds) {
        if (!currentGiftIds.has(id)) {
          const gift = originalGifts.find(g => g.id === id);
          missingGifts.push(gift?.name || id);
        }
      }

      // Find added gifts (shouldn't happen during sale)
      const addedGifts: string[] = [];
      for (const id of currentGiftIds) {
        if (!originalGiftIds.has(id)) {
          const gift = currentGifts.find(g => g.id === id);
          addedGifts.push(gift?.name || id);
        }
      }

      const modified = missingGifts.length > 0 || addedGifts.length > 0;

      if (modified) {
        return {
          verified: false,
          modified: true,
          missingGifts,
          addedGifts,
          reason: 'Gifts were modified during the purchase process'
        };
      }

      return {
        verified: true,
        modified: false,
        missingGifts: [],
        addedGifts: []
      };
    } catch (error) {
      return {
        verified: false,
        modified: false,
        missingGifts: [],
        addedGifts: [],
        reason: 'Failed to verify gifts'
      };
    }
  }

  /**
   * Verify channel ownership transfer
   */
  verifyOwnershipTransfer(
    expectedOwnerId: string,
    currentOwnerId: string,
    previousOwnerId?: string
  ): OwnershipVerificationResult {
    if (currentOwnerId === expectedOwnerId) {
      return {
        verified: true,
        isNewOwner: true,
        previousOwnerId,
        currentOwnerId
      };
    }

    if (currentOwnerId === previousOwnerId) {
      return {
        verified: false,
        isNewOwner: false,
        previousOwnerId,
        currentOwnerId,
        reason: 'Ownership has not been transferred yet'
      };
    }

    return {
      verified: false,
      isNewOwner: false,
      previousOwnerId,
      currentOwnerId,
      reason: 'Ownership transferred to wrong user'
    };
  }

  /**
   * Generate fraud event if cheating detected
   */
  generateFraudEvent(
    purchaseId: string,
    sellerId: string,
    fraudType: 'gift_modification' | 'ownership_fraud' | 'price_manipulation',
    details: any
  ): PurchaseFraudEvent {
    return new PurchaseFraudEvent(
      purchaseId,
      sellerId,
      fraudType,
      details
    );
  }
}

/**
 * Domain Event: Purchase Fraud Detected
 */
export class PurchaseFraudEvent implements DomainEvent {
  readonly eventType = 'purchase.fraud_detected';
  readonly eventVersion = 1;
  readonly occurredAt = new Date();
  
  constructor(
    public readonly aggregateId: string,
    public readonly sellerId: string,
    public readonly fraudType: string,
    public readonly details: any,
    public readonly metadata?: Record<string, any>
  ) {}
}
