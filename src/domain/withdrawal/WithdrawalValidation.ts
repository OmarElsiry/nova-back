/**
 * Withdrawal Validation Domain Service
 * Single Responsibility: Validate withdrawal requests
 */

import { Address } from '@ton/ton';

export interface WithdrawalValidationConfig {
  minWithdrawalNano: bigint;
  maxWithdrawalNano: bigint;
  dailyLimitNano: bigint;
  requireTwoFactor: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class WithdrawalValidationService {
  constructor(private readonly config: WithdrawalValidationConfig) {}

  /**
   * Validate withdrawal request parameters
   */
  validateRequest(
    destinationAddress: string,
    amountNano: bigint,
    twoFactorCode?: string
  ): ValidationResult {
    const errors: string[] = [];

    // Validate address format
    if (!this.isValidAddress(destinationAddress)) {
      errors.push('Invalid destination address format');
    }

    // Check minimum amount
    if (amountNano < this.config.minWithdrawalNano) {
      errors.push(
        `Minimum withdrawal is ${Number(this.config.minWithdrawalNano) / 1e9} TON`
      );
    }

    // Check maximum amount
    if (amountNano > this.config.maxWithdrawalNano) {
      errors.push(
        `Maximum withdrawal is ${Number(this.config.maxWithdrawalNano) / 1e9} TON`
      );
    }

    // Check 2FA if required
    if (this.config.requireTwoFactor && !twoFactorCode) {
      errors.push('Two-factor authentication required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate daily limit
   */
  validateDailyLimit(
    dailyTotal: bigint,
    requestAmount: bigint
  ): ValidationResult {
    const errors: string[] = [];
    
    if (dailyTotal + requestAmount > this.config.dailyLimitNano) {
      errors.push(
        `Exceeds daily limit of ${Number(this.config.dailyLimitNano) / 1e9} TON`
      );
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if TON address is valid
   */
  private isValidAddress(address: string): boolean {
    try {
      Address.parse(address);
      return true;
    } catch {
      return false;
    }
  }
}
