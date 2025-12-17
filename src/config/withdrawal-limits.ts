/**
 * Secure Withdrawal Limits Configuration
 * Validates and enforces financial limits for withdrawals
 */

import { z } from 'zod';

// Define withdrawal limits schema with strict validation
const withdrawalLimitsSchema = z.object({
  DAILY_WITHDRAWAL_LIMIT: z.string()
    .default('1000000000000') // 1000 TON default
    .transform(val => {
      try {
        const limit = BigInt(val);
        if (limit <= 0) {
          throw new Error('Withdrawal limit must be positive');
        }
        return limit;
      } catch {
        throw new Error(`Invalid withdrawal limit: ${val}`);
      }
    }),
  
  PER_TX_WITHDRAWAL_LIMIT: z.string()
    .default('100000000000') // 100 TON default
    .transform(val => {
      try {
        const limit = BigInt(val);
        if (limit <= 0) {
          throw new Error('Per-transaction limit must be positive');
        }
        return limit;
      } catch {
        throw new Error(`Invalid per-transaction limit: ${val}`);
      }
    }),
  
  MIN_WITHDRAWAL: z.string()
    .default('1000000000') // 1 TON minimum
    .transform(val => {
      try {
        const min = BigInt(val);
        if (min <= 0) {
          throw new Error('Minimum withdrawal must be positive');
        }
        return min;
      } catch {
        throw new Error(`Invalid minimum withdrawal: ${val}`);
      }
    }),
  
  REQUIRE_ADMIN_APPROVAL_ABOVE: z.string()
    .default('10000000000') // 10 TON requires admin approval
    .transform(val => {
      try {
        const threshold = BigInt(val);
        if (threshold <= 0) {
          throw new Error('Admin approval threshold must be positive');
        }
        return threshold;
      } catch {
        throw new Error(`Invalid admin approval threshold: ${val}`);
      }
    }),
  
  COOLDOWN_PERIOD_MS: z.number()
    .min(0)
    .default(60000), // 1 minute between withdrawals
  
  MAX_PENDING_WITHDRAWALS: z.number()
    .min(1)
    .max(10)
    .default(3), // Maximum pending withdrawals per user
});

// Parse and validate limits from environment
export const WITHDRAWAL_LIMITS = (() => {
  try {
    const limits = withdrawalLimitsSchema.parse({
      DAILY_WITHDRAWAL_LIMIT: process.env.DAILY_WITHDRAWAL_LIMIT,
      PER_TX_WITHDRAWAL_LIMIT: process.env.PER_TX_WITHDRAWAL_LIMIT,
      MIN_WITHDRAWAL: process.env.MIN_WITHDRAWAL,
      REQUIRE_ADMIN_APPROVAL_ABOVE: process.env.REQUIRE_ADMIN_APPROVAL_ABOVE,
      COOLDOWN_PERIOD_MS: parseInt(process.env.WITHDRAWAL_COOLDOWN_MS || '60000'),
      MAX_PENDING_WITHDRAWALS: parseInt(process.env.MAX_PENDING_WITHDRAWALS || '3'),
    });
    
    // Additional validation: ensure min < per_tx < daily
    if (limits.MIN_WITHDRAWAL >= limits.PER_TX_WITHDRAWAL_LIMIT) {
      throw new Error('Minimum withdrawal must be less than per-transaction limit');
    }
    if (limits.PER_TX_WITHDRAWAL_LIMIT > limits.DAILY_WITHDRAWAL_LIMIT) {
      throw new Error('Per-transaction limit cannot exceed daily limit');
    }
    
    return limits;
  } catch (error) {
    console.error('❌ Invalid withdrawal limits configuration:', error);
    throw new Error('Failed to initialize withdrawal limits. Check environment configuration.');
  }
})();

// Helper functions for limit checking
export function isWithinDailyLimit(currentDailyTotal: bigint, requestedAmount: bigint): boolean {
  return currentDailyTotal + requestedAmount <= WITHDRAWAL_LIMITS.DAILY_WITHDRAWAL_LIMIT;
}

export function isWithinTransactionLimit(amount: bigint): boolean {
  return amount <= WITHDRAWAL_LIMITS.PER_TX_WITHDRAWAL_LIMIT && 
         amount >= WITHDRAWAL_LIMITS.MIN_WITHDRAWAL;
}

export function requiresAdminApproval(amount: bigint): boolean {
  return amount > WITHDRAWAL_LIMITS.REQUIRE_ADMIN_APPROVAL_ABOVE;
}

// Convert nano to TON for display
export function nanoToTON(nanoAmount: bigint): number {
  return Number(nanoAmount) / 1_000_000_000;
}

// Convert TON to nano for storage
export function tonToNano(tonAmount: number): bigint {
  return BigInt(Math.floor(tonAmount * 1_000_000_000));
}

// Export formatted limits for logging/display
export function getFormattedLimits() {
  return {
    daily: `${nanoToTON(WITHDRAWAL_LIMITS.DAILY_WITHDRAWAL_LIMIT)} TON`,
    perTransaction: `${nanoToTON(WITHDRAWAL_LIMITS.PER_TX_WITHDRAWAL_LIMIT)} TON`,
    minimum: `${nanoToTON(WITHDRAWAL_LIMITS.MIN_WITHDRAWAL)} TON`,
    adminApprovalThreshold: `${nanoToTON(WITHDRAWAL_LIMITS.REQUIRE_ADMIN_APPROVAL_ABOVE)} TON`,
    cooldownPeriod: `${WITHDRAWAL_LIMITS.COOLDOWN_PERIOD_MS / 1000} seconds`,
    maxPendingWithdrawals: WITHDRAWAL_LIMITS.MAX_PENDING_WITHDRAWALS,
  };
}
