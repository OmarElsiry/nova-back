/**
 * Purchase Validation Domain Service
 * Single Responsibility: Validate purchase requests
 */

export interface PurchaseValidationConfig {
  minPrice: number;
  maxPrice: number;
  verificationTimeoutHours: number;
  gracePeriodMinutes: number;
}

export interface PurchaseValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface PurchaseValidationContext {
  buyerBalance: number;
  price: number;
  isBuyerBanned: boolean;
  hasActivePurchase: boolean;
  isSellerActive: boolean;
}

export class PurchaseValidationService {
  constructor(private readonly config: PurchaseValidationConfig) {}

  /**
   * Validate purchase creation
   */
  validatePurchaseCreation(context: PurchaseValidationContext): PurchaseValidationResult {
    const errors: string[] = [];

    // Check buyer balance
    if (context.buyerBalance < context.price) {
      errors.push('Insufficient balance');
    }

    // Check if buyer is banned
    if (context.isBuyerBanned) {
      errors.push('User is banned from purchases');
    }

    // Check for existing purchase
    if (context.hasActivePurchase) {
      errors.push('This channel is already being purchased by another buyer');
    }

    // Check price limits
    if (context.price < this.config.minPrice) {
      errors.push(`Minimum price is ${this.config.minPrice}`);
    }

    if (context.price > this.config.maxPrice) {
      errors.push(`Maximum price is ${this.config.maxPrice}`);
    }

    // Check if seller is active
    if (!context.isSellerActive) {
      errors.push('Seller account is not active');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate verification deadline
   */
  validateVerificationDeadline(
    verificationDeadline: Date,
    currentTime: Date = new Date()
  ): PurchaseValidationResult {
    const errors: string[] = [];

    if (currentTime > verificationDeadline) {
      errors.push('Verification deadline has passed');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate grace period for seller
   */
  validateGracePeriod(
    sellerConfirmedAt: Date | null,
    currentTime: Date = new Date()
  ): { inGracePeriod: boolean; minutesLeft: number } {
    if (!sellerConfirmedAt) {
      return { inGracePeriod: false, minutesLeft: 0 };
    }

    const timeSinceConfirmation = currentTime.getTime() - sellerConfirmedAt.getTime();
    const gracePeriodMs = this.config.gracePeriodMinutes * 60 * 1000;

    if (timeSinceConfirmation < gracePeriodMs) {
      const minutesLeft = Math.ceil((gracePeriodMs - timeSinceConfirmation) / 60000);
      return { inGracePeriod: true, minutesLeft };
    }

    return { inGracePeriod: false, minutesLeft: 0 };
  }

  /**
   * Validate verification token
   */
  validateVerificationToken(
    providedToken: string,
    expectedToken: string
  ): boolean {
    return providedToken === expectedToken;
  }
}
