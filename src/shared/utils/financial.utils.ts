/**
 * Financial Utility Functions
 * Uses Decimal.js for precise financial calculations
 * All monetary values should go through these functions
 */

import Decimal from 'decimal.js';

// Type alias for Decimal instances
type DecimalValue = InstanceType<typeof Decimal>;

// Configure Decimal.js for financial precision
// @ts-ignore - Decimal.set is available in v10 but types might be mismatched
Decimal.set({
  precision: 20,     // 20 significant digits
  rounding: Decimal.ROUND_DOWN, // Always round down for financial safety
  toExpPos: 20,      // Use exponential notation for large numbers
  toExpNeg: -9,      // Use exponential notation for small numbers
});

/**
 * Constants for TON currency
 */
export const FINANCIAL_CONSTANTS = {
  NANO_PER_TON: new Decimal(1e9),
  MIN_BALANCE: new Decimal(0),
  MAX_BALANCE: new Decimal(1e15), // 1 million TON max (in nanotons)
  DISPLAY_DECIMALS: 9, // TON supports 9 decimal places
} as const;

/**
 * Convert nanotons to TON
 * @param nanotons - Amount in nanotons (string, number, or Decimal)
 * @returns Amount in TON as Decimal
 */
export function nanoToTON(nanotons: string | number | DecimalValue): DecimalValue {
  try {
    const nano = new Decimal(nanotons);
    return nano.div(FINANCIAL_CONSTANTS.NANO_PER_TON);
  } catch (error) {
    console.error('Invalid nanoton value:', nanotons, error);
    throw new Error(`Invalid financial value: ${nanotons}`);
  }
}

/**
 * Convert TON to nanotons
 * @param ton - Amount in TON (string, number, or Decimal)
 * @returns Amount in nanotons as Decimal
 */
export function tonToNano(ton: string | number | DecimalValue): DecimalValue {
  try {
    const tonAmount = new Decimal(ton);
    return tonAmount.times(FINANCIAL_CONSTANTS.NANO_PER_TON);
  } catch (error) {
    console.error('Invalid TON value:', ton, error);
    throw new Error(`Invalid financial value: ${ton}`);
  }
}

/**
 * Format nanotons for display
 * @param nanotons - Amount in nanotons
 * @param decimals - Number of decimal places (default 9)
 * @returns Formatted string for display
 */
export function formatTON(
  nanotons: string | number | DecimalValue,
  decimals: number = FINANCIAL_CONSTANTS.DISPLAY_DECIMALS
): string {
  try {
    const ton = nanoToTON(nanotons);
    return ton.toFixed(decimals);
  } catch (error) {
    return '0.000000000';
  }
}

/**
 * Parse balance from database (handles string, number, or Decimal)
 * @param balance - Balance from database
 * @returns Balance as Decimal
 */
export function parseBalance(balance: any): DecimalValue {
  if (balance === null || balance === undefined) {
    return new Decimal(0);
  }

  try {
    // Handle Prisma Decimal type
    if (balance instanceof Decimal) {
      return balance;
    }

    // Handle string or number
    return new Decimal(balance);
  } catch (error) {
    console.error('Invalid balance value:', balance, error);
    return new Decimal(0);
  }
}

/**
 * Add two financial amounts safely
 * @param amount1 - First amount
 * @param amount2 - Second amount
 * @returns Sum as Decimal
 */
export function addAmounts(
  ...amounts: (string | number | DecimalValue)[]
): DecimalValue {
  try {
    const sum = amounts.reduce<DecimalValue>((acc, amount) => acc.plus(new Decimal(amount)), new Decimal(0));
    return sum;
  } catch (error) {
    throw new Error('Invalid amounts for addition');
  }
}

/**
 * Subtract two financial amounts safely
 * @param minuend - Amount to subtract from
 * @param subtrahend - Amount to subtract
 * @returns Difference as Decimal
 */
export function subtractAmounts(
  minuend: string | number | DecimalValue,
  subtrahend: string | number | DecimalValue
): DecimalValue {
  try {
    const a1 = new Decimal(minuend);
    const a2 = new Decimal(subtrahend);
    return a1.minus(a2);
  } catch (error) {
    throw new Error('Invalid amounts for subtraction');
  }
}

/**
 * Check if balance is sufficient for amount
 * @param currentBalance - Current balance
 * @param requiredAmount - Required amount
 * @returns true if balance >= amount
 */
export function hasSufficientBalance(
  currentBalance: string | number | DecimalValue,
  requiredAmount: string | number | DecimalValue
): boolean {
  try {
    const bal = new Decimal(currentBalance);
    const amt = new Decimal(requiredAmount);
    return bal.gte(amt);
  } catch (error) {
    return false;
  }
}

/**
 * Validate if amount is within acceptable range
 * @param amount - Amount to validate
 * @param min - Minimum allowed (default 0)
 * @param max - Maximum allowed (default MAX_BALANCE)
 * @returns true if valid
 */
export function isValidAmount(
  amount: string | number | DecimalValue,
  min: string | number | DecimalValue = 0,
  max: string | number | DecimalValue = FINANCIAL_CONSTANTS.MAX_BALANCE
): boolean {
  try {
    const amt = new Decimal(amount);
    const minAmt = new Decimal(min);
    const maxAmt = new Decimal(max);

    return amt.gte(minAmt) && amt.lte(maxAmt) && amt.gte(0);
  } catch (error) {
    return false;
  }
}

/**
 * Calculate percentage (for fees, etc)
 * @param amount - Base amount
 * @param percentage - Percentage (e.g., 3 for 3%)
 * @returns Calculated percentage as Decimal
 */
export function calculatePercentage(
  amount: string | number | DecimalValue,
  percentage: number
): DecimalValue {
  try {
    const amt = new Decimal(amount);
    return amt.times(percentage).div(100);
  } catch (error) {
    throw new Error('Invalid amount or percentage');
  }
}

/**
 * Round to nearest nanoton (no fractional nanotons)
 * @param amount - Amount to round
 * @returns Rounded amount as Decimal
 */
export function roundToNanoton(amount: string | number | DecimalValue): DecimalValue {
  try {
    const amt = new Decimal(amount);
    return amt.round();
  } catch (error) {
    throw new Error('Invalid amount for rounding');
  }
}

/**
 * Compare two amounts
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareAmounts(
  a: string | number | DecimalValue,
  b: string | number | DecimalValue
): number {
  try {
    const amountA = new Decimal(a);
    const amountB = new Decimal(b);
    return amountA.cmp(amountB);
  } catch (error) {
    throw new Error('Invalid amounts for comparison');
  }
}

/**
 * Get display string for balance (with TON suffix)
 * @param nanotons - Balance in nanotons
 * @param includeSymbol - Whether to include TON symbol
 * @returns Formatted display string
 */
export function displayBalance(
  nanotons: string | number | DecimalValue,
  includeSymbol: boolean = true
): string {
  const formatted = formatTON(nanotons);
  return includeSymbol ? `${formatted} TON` : formatted;
}

/**
 * Serialize Decimal for JSON/database storage
 * @param value - Decimal value
 * @returns String representation
 */
export function serializeDecimal(value: string | number | DecimalValue): string {
  const dec = new Decimal(value);
  return dec.toString();
}

/**
 * Deserialize string to Decimal
 * @param value - String value
 * @returns Decimal instance
 */
export function deserializeDecimal(value: string): DecimalValue {
  return new Decimal(value);
}
