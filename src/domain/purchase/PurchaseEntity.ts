/**
 * Purchase Entity
 * Core domain entity representing a purchase/escrow transaction
 */

import { BaseEntity } from '../base/BaseEntity';

export enum PurchaseStatus {
  HELD = 'held',
  VERIFIED = 'verified',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export interface PurchaseProperties {
  id: number;
  channelId: number;
  buyerId: number;
  sellerId: number;
  price: bigint;
  heldAmount: bigint;
  status: PurchaseStatus;
  verificationToken?: string;
  verificationDeadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class PurchaseEntity extends BaseEntity {
  channelId: number;
  buyerId: number;
  sellerId: number;
  price: bigint;
  heldAmount: bigint;
  status: PurchaseStatus;
  verificationToken?: string;
  verificationDeadline?: Date;

  constructor(props: PurchaseProperties) {
    super(props.id, props.createdAt, props.updatedAt);
    this.channelId = props.channelId;
    this.buyerId = props.buyerId;
    this.sellerId = props.sellerId;
    this.price = props.price;
    this.heldAmount = props.heldAmount;
    this.status = props.status;
    this.verificationToken = props.verificationToken;
    this.verificationDeadline = props.verificationDeadline;
  }

  /**
   * Check if purchase is in held state
   */
  isHeld(): boolean {
    return this.status === PurchaseStatus.HELD;
  }

  /**
   * Check if purchase is verified
   */
  isVerified(): boolean {
    return this.status === PurchaseStatus.VERIFIED;
  }

  /**
   * Check if purchase is completed
   */
  isCompleted(): boolean {
    return this.status === PurchaseStatus.COMPLETED;
  }

  /**
   * Check if purchase is refunded
   */
  isRefunded(): boolean {
    return this.status === PurchaseStatus.REFUNDED;
  }

  /**
   * Check if verification deadline has passed
   */
  isVerificationExpired(): boolean {
    if (!this.verificationDeadline) {
      return false;
    }
    return new Date() > this.verificationDeadline;
  }

  /**
   * Verify the purchase
   */
  verify(): void {
    if (!this.isHeld()) {
      throw new Error('Only held purchases can be verified');
    }
    if (this.isVerificationExpired()) {
      throw new Error('Verification deadline has passed');
    }
    this.status = PurchaseStatus.VERIFIED;
    this.markAsUpdated();
  }

  /**
   * Complete the purchase
   */
  complete(): void {
    if (!this.isVerified()) {
      throw new Error('Only verified purchases can be completed');
    }
    this.status = PurchaseStatus.COMPLETED;
    this.markAsUpdated();
  }

  /**
   * Refund the purchase
   */
  refund(): void {
    if (this.isCompleted() || this.isRefunded()) {
      throw new Error('Cannot refund completed or already refunded purchases');
    }
    this.status = PurchaseStatus.REFUNDED;
    this.markAsUpdated();
  }

  /**
   * Cancel the purchase
   */
  cancel(): void {
    if (this.isCompleted()) {
      throw new Error('Cannot cancel completed purchases');
    }
    this.status = PurchaseStatus.CANCELLED;
    this.markAsUpdated();
  }

  /**
   * Get refund amount
   */
  getRefundAmount(): bigint {
    return this.heldAmount;
  }

  /**
   * Convert entity to plain object
   */
  override toJSON(): any {
    return {
      ...super.toJSON(),
      channelId: this.channelId,
      buyerId: this.buyerId,
      sellerId: this.sellerId,
      price: this.price.toString(),
      heldAmount: this.heldAmount.toString(),
      status: this.status,
      verificationToken: this.verificationToken,
      verificationDeadline: this.verificationDeadline
    };
  }
}
