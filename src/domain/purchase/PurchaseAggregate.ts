/**
 * Purchase Aggregate
 * Core domain model for channel purchases with escrow
 */

export enum PurchaseStatus {
  HELD = 'held',
  PENDING_VERIFICATION = 'pending_verification',
  SELLER_CONFIRMED = 'seller_confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  EXPIRED = 'expired'
}

export interface PurchaseMetadata {
  originalGifts?: any[];
  sellerConfirmedAt?: Date;
  refundReason?: string;
  fraudDetected?: boolean;
  verificationNote?: string;
}

export class PurchaseAggregate {
  private _status: PurchaseStatus;
  private _metadata: PurchaseMetadata = {};
  private _ownershipVerified = false;
  private _giftsVerified = false;
  private _verifiedAt?: Date;
  private _refundedAt?: Date;
  private _events: any[] = [];

  constructor(
    private readonly _id: string,
    private readonly _channelId: number,
    private readonly _buyerId: number,
    private readonly _sellerId: number,
    private readonly _price: number,
    private readonly _verificationToken: string,
    private readonly _verificationDeadline: Date,
    status: PurchaseStatus = PurchaseStatus.HELD
  ) {
    this._status = status;
  }

  /**
   * Factory method to create new purchase
   */
  static create(
    id: string,
    channelId: number,
    buyerId: number,
    sellerId: number,
    price: number,
    verificationToken: string,
    verificationDeadline: Date,
    originalGifts?: any[]
  ): PurchaseAggregate {
    const purchase = new PurchaseAggregate(
      id,
      channelId,
      buyerId,
      sellerId,
      price,
      verificationToken,
      verificationDeadline
    );

    if (originalGifts) {
      purchase._metadata.originalGifts = originalGifts;
    }

    return purchase;
  }

  /**
   * Seller confirms the transfer
   */
  confirmTransfer(): void {
    if (this._status !== PurchaseStatus.HELD) {
      throw new Error('Can only confirm transfer for held purchases');
    }

    this._status = PurchaseStatus.SELLER_CONFIRMED;
    this._metadata.sellerConfirmedAt = new Date();
  }

  /**
   * Verify ownership and gifts
   */
  verify(ownershipVerified: boolean, giftsVerified: boolean): void {
    if (this._status === PurchaseStatus.COMPLETED || 
        this._status === PurchaseStatus.CANCELLED ||
        this._status === PurchaseStatus.REFUNDED) {
      throw new Error('Cannot verify completed, cancelled or refunded purchase');
    }

    this._ownershipVerified = ownershipVerified;
    this._giftsVerified = giftsVerified;
    this._verifiedAt = new Date();

    if (ownershipVerified && giftsVerified) {
      this._status = PurchaseStatus.COMPLETED;
    } else if (!giftsVerified) {
      // Fraud detected
      this._metadata.fraudDetected = true;
      this._status = PurchaseStatus.CANCELLED;
    }
  }

  /**
   * Cancel purchase
   */
  cancel(reason: string): void {
    if (this._status === PurchaseStatus.COMPLETED) {
      throw new Error('Cannot cancel completed purchase');
    }

    this._status = PurchaseStatus.CANCELLED;
    this._metadata.verificationNote = reason;
  }

  /**
   * Refund purchase
   */
  refund(reason: string): void {
    if (this._status === PurchaseStatus.COMPLETED) {
      throw new Error('Cannot refund completed purchase');
    }

    this._status = PurchaseStatus.REFUNDED;
    this._metadata.refundReason = reason;
    this._refundedAt = new Date();
  }

  /**
   * Mark as expired
   */
  expire(): void {
    if (this._status === PurchaseStatus.COMPLETED) {
      throw new Error('Cannot expire completed purchase');
    }

    this._status = PurchaseStatus.EXPIRED;
  }

  /**
   * Check if verification deadline passed
   */
  isExpired(currentTime: Date = new Date()): boolean {
    return currentTime > this._verificationDeadline;
  }

  /**
   * Check if in grace period
   */
  isInGracePeriod(gracePeriodMinutes: number = 30): boolean {
    if (!this._metadata.sellerConfirmedAt) {
      return false;
    }

    const timeSinceConfirmation = Date.now() - this._metadata.sellerConfirmedAt.getTime();
    const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
    
    return timeSinceConfirmation < gracePeriodMs;
  }

  // Getters
  get id(): string { return this._id; }
  get channelId(): number { return this._channelId; }
  get buyerId(): number { return this._buyerId; }
  get sellerId(): number { return this._sellerId; }
  get price(): number { return this._price; }
  get status(): PurchaseStatus { return this._status; }
  get verificationToken(): string { return this._verificationToken; }
  get verificationDeadline(): Date { return this._verificationDeadline; }
  get metadata(): PurchaseMetadata { return this._metadata; }
  get ownershipVerified(): boolean { return this._ownershipVerified; }
  get giftsVerified(): boolean { return this._giftsVerified; }
  get verifiedAt(): Date | undefined { return this._verifiedAt; }
  get refundedAt(): Date | undefined { return this._refundedAt; }

  /**
   * Get and clear domain events
   */
  getEvents(): any[] {
    const events = [...this._events];
    this._events = [];
    return events;
  }
}
