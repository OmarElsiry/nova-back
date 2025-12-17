/**
 * Withdrawal Value Objects
 * Immutable objects representing domain concepts
 */

export enum WithdrawalStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum WithdrawalRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class WithdrawalAmount {
  private readonly _nanoAmount: bigint;

  constructor(nanoAmount: bigint) {
    if (nanoAmount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }
    this._nanoAmount = nanoAmount;
  }

  get nanoAmount(): bigint {
    return this._nanoAmount;
  }

  get tonAmount(): number {
    return Number(this._nanoAmount) / 1_000_000_000;
  }

  isGreaterThan(other: WithdrawalAmount): boolean {
    return this._nanoAmount > other._nanoAmount;
  }

  isLessThan(other: WithdrawalAmount): boolean {
    return this._nanoAmount < other._nanoAmount;
  }

  equals(other: WithdrawalAmount): boolean {
    return this._nanoAmount === other._nanoAmount;
  }

  add(other: WithdrawalAmount): WithdrawalAmount {
    return new WithdrawalAmount(this._nanoAmount + other._nanoAmount);
  }

  static fromTON(tonAmount: number): WithdrawalAmount {
    return new WithdrawalAmount(BigInt(Math.floor(tonAmount * 1_000_000_000)));
  }

  static fromNano(nanoAmount: bigint): WithdrawalAmount {
    return new WithdrawalAmount(nanoAmount);
  }
}

export class TONAddress {
  private readonly _address: string;

  constructor(address: string) {
    // Validate TON address format
    if (!this.isValidTONAddress(address)) {
      throw new Error('Invalid TON address format');
    }
    this._address = address;
  }

  private isValidTONAddress(address: string): boolean {
    // Basic validation - can be enhanced with proper TON address validation
    return address.startsWith('UQ') || address.startsWith('EQ');
  }

  get value(): string {
    return this._address;
  }

  equals(other: TONAddress): boolean {
    return this._address === other._address;
  }

  toString(): string {
    return this._address;
  }
}
