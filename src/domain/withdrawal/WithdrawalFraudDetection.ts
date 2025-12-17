/**
 * Withdrawal Fraud Detection Domain Service
 * Single Responsibility: Assess withdrawal fraud risk
 */

import type { DomainEvent } from '../events/IEventBus';

export interface FraudCheckResult {
  passed: boolean;
  riskScore: number;
  reasons: string[];
  requiresManualReview: boolean;
}

export interface WithdrawalPattern {
  userId: string;
  recentWithdrawalCount: number;
  hourlyWithdrawalCount: number;
  dailyTotalNano: bigint;
  uniqueAddressesUsed: number;
  isNewAddress: boolean;
  accountAgeInDays: number;
}

export class WithdrawalFraudDetectionService {
  private readonly HIGH_RISK_THRESHOLD = 0.7;
  private readonly MEDIUM_RISK_THRESHOLD = 0.4;
  
  /**
   * Perform comprehensive fraud assessment
   */
  assessRisk(
    pattern: WithdrawalPattern,
    amountNano: bigint,
    destinationAddress: string
  ): FraudCheckResult {
    let riskScore = 0;
    const reasons: string[] = [];

    // Check for rapid withdrawals
    if (pattern.hourlyWithdrawalCount > 3) {
      riskScore += 0.3;
      reasons.push('Multiple withdrawals in short period');
    }

    // Check for unusual patterns
    if (pattern.recentWithdrawalCount > 10) {
      riskScore += 0.2;
      reasons.push('High withdrawal frequency');
    }

    // New address risk
    if (pattern.isNewAddress) {
      if (pattern.accountAgeInDays < 7) {
        riskScore += 0.3;
        reasons.push('New account with new address');
      } else {
        riskScore += 0.1;
        reasons.push('First withdrawal to this address');
      }
    }

    // Large amount risk
    const largeAmountThreshold = BigInt(100) * BigInt(1e9); // 100 TON
    if (amountNano > largeAmountThreshold) {
      riskScore += 0.2;
      reasons.push('Large withdrawal amount');
    }

    // Many different addresses
    if (pattern.uniqueAddressesUsed > 5) {
      riskScore += 0.2;
      reasons.push('Multiple destination addresses used');
    }

    // Ensure score is between 0 and 1
    riskScore = Math.min(1, Math.max(0, riskScore));

    return {
      passed: riskScore < this.MEDIUM_RISK_THRESHOLD,
      riskScore,
      reasons,
      requiresManualReview: riskScore >= this.HIGH_RISK_THRESHOLD
    };
  }

  /**
   * Generate fraud alert event if needed
   */
  generateFraudEvent(
    userId: string,
    withdrawalId: string,
    result: FraudCheckResult
  ): FraudAlertEvent | null {
    if (result.riskScore >= this.MEDIUM_RISK_THRESHOLD) {
      return new FraudAlertEvent(
        withdrawalId,
        userId,
        result.riskScore,
        result.reasons
      );
    }
    return null;
  }
}

/**
 * Domain Event: Fraud Alert
 */
export class FraudAlertEvent implements DomainEvent {
  readonly eventType = 'withdrawal.fraud_alert';
  readonly eventVersion = 1;
  readonly occurredAt = new Date();
  
  constructor(
    public readonly aggregateId: string,
    public readonly userId: string,
    public readonly riskScore: number,
    public readonly reasons: string[],
    public readonly metadata?: Record<string, any>
  ) {}
}
