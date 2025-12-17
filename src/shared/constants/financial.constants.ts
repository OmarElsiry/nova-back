/**
 * Financial Constants
 * Centralized financial values to eliminate magic numbers
 */

export const FINANCIAL = {
  // Conversion rates
  NANO_PER_TON: Number(process.env.NANO_PER_TON) || 1_000_000_000,

  // Platform fees
  DEFAULT_PLATFORM_FEE_PERCENT: Number(process.env.DEFAULT_PLATFORM_FEE_PERCENT) || 3,
  MIN_PLATFORM_FEE_NANO: Number(process.env.MIN_PLATFORM_FEE_NANO) || 100_000_000, // 0.1 TON minimum fee

  // Channel pricing limits
  MIN_CHANNEL_PRICE_TON: Number(process.env.MIN_CHANNEL_PRICE_TON) || 0.1,
  MAX_CHANNEL_PRICE_TON: Number(process.env.MAX_CHANNEL_PRICE_TON) || 10_000,
  MIN_CHANNEL_PRICE_NANO: BigInt(process.env.MIN_CHANNEL_PRICE_NANO || 100_000_000), // 0.1 TON in nano
  MAX_CHANNEL_PRICE_NANO: BigInt(process.env.MAX_CHANNEL_PRICE_NANO || 10_000_000_000_000), // 10,000 TON in nano

  // Escrow settings
  ESCROW_RELEASE_HOURS: Number(process.env.ESCROW_RELEASE_HOURS) || 24,
  ESCROW_AUTO_RELEASE_HOURS: Number(process.env.ESCROW_AUTO_RELEASE_HOURS) || 72, // Auto-release after 3 days
  ESCROW_DISPUTE_WINDOW_HOURS: Number(process.env.ESCROW_DISPUTE_WINDOW_HOURS) || 48, // 2 days to dispute

  // Withdrawal settings
  WITHDRAWAL_FEE_PERCENT: Number(process.env.WITHDRAWAL_FEE_PERCENT) || 1,
  WITHDRAWAL_MIN_FEE_TON: Number(process.env.WITHDRAWAL_MIN_FEE_TON) || 0.01,
  WITHDRAWAL_COOLDOWN_MS: Number(process.env.WITHDRAWAL_COOLDOWN_MS) || 60_000, // 1 minute between withdrawals
  WITHDRAWAL_PROCESSING_TIMEOUT_MS: Number(process.env.WITHDRAWAL_PROCESSING_TIMEOUT_MS) || 300_000, // 5 minute timeout

  // Deposit settings
  MIN_DEPOSIT_TON: Number(process.env.MIN_DEPOSIT_TON) || 0.01,

  // Transaction retry settings
  MAX_RETRY_ATTEMPTS: Number(process.env.MAX_RETRY_ATTEMPTS) || 3,
  RETRY_DELAY_MS: Number(process.env.RETRY_DELAY_MS) || 1_000,
  RETRY_BACKOFF_MULTIPLIER: Number(process.env.RETRY_BACKOFF_MULTIPLIER) || 2,
  MAX_RETRY_DELAY_MS: Number(process.env.MAX_RETRY_DELAY_MS) || 30_000,

  // Rate limiting
  WITHDRAWAL_RATE_LIMIT_PER_HOUR: Number(process.env.WITHDRAWAL_RATE_LIMIT_PER_HOUR) || 10,
  PURCHASE_RATE_LIMIT_PER_HOUR: Number(process.env.PURCHASE_RATE_LIMIT_PER_HOUR) || 20,
  API_RATE_LIMIT_PER_MINUTE: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 100,

  // Validation
  MAX_MEMO_LENGTH: Number(process.env.MAX_MEMO_LENGTH) || 128,
  MAX_TRANSACTION_AGE_HOURS: Number(process.env.MAX_TRANSACTION_AGE_HOURS) || 168, // 7 days

  // Precision
  PRICE_DECIMAL_PLACES: Number(process.env.PRICE_DECIMAL_PLACES) || 9,
  DISPLAY_DECIMAL_PLACES: Number(process.env.DISPLAY_DECIMAL_PLACES) || 4,
} as const;

// Type-safe conversion utilities
export function nanoToTON(nanoAmount: bigint | number): number {
  const nano = typeof nanoAmount === 'number' ? BigInt(nanoAmount) : nanoAmount;
  return Number(nano) / FINANCIAL.NANO_PER_TON;
}

export function tonToNano(tonAmount: number): bigint {
  if (!isFinite(tonAmount) || tonAmount < 0) {
    throw new Error(`Invalid TON amount: ${tonAmount}`);
  }
  return BigInt(Math.floor(tonAmount * FINANCIAL.NANO_PER_TON));
}

export function calculatePlatformFee(amount: bigint, feePercent?: number): bigint {
  const percent = feePercent ?? FINANCIAL.DEFAULT_PLATFORM_FEE_PERCENT;
  const fee = (amount * BigInt(percent)) / 100n;
  return fee < FINANCIAL.MIN_PLATFORM_FEE_NANO
    ? BigInt(FINANCIAL.MIN_PLATFORM_FEE_NANO)
    : fee;
}

export function formatTON(nanoAmount: bigint | number, decimals?: number): string {
  const ton = nanoToTON(nanoAmount);
  const places = decimals ?? FINANCIAL.DISPLAY_DECIMAL_PLACES;
  return ton.toFixed(places);
}

export function isValidChannelPrice(priceNano: bigint): boolean {
  return priceNano >= FINANCIAL.MIN_CHANNEL_PRICE_NANO &&
    priceNano <= FINANCIAL.MAX_CHANNEL_PRICE_NANO;
}

export function getRetryDelay(attemptNumber: number): number {
  const delay = FINANCIAL.RETRY_DELAY_MS *
    Math.pow(FINANCIAL.RETRY_BACKOFF_MULTIPLIER, attemptNumber - 1);
  return Math.min(delay, FINANCIAL.MAX_RETRY_DELAY_MS);
}
