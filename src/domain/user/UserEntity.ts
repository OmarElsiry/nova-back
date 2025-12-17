/**
 * User Entity
 * Core domain entity representing a user in the system
 */

import { BaseEntity } from '../base/BaseEntity';

export interface UserProperties {
  id: number;
  telegramId: string;
  walletAddress?: string;
  walletAddressVariants: string[];
  balance: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export class UserEntity extends BaseEntity {
  telegramId: string;
  walletAddress?: string;
  walletAddressVariants: string[];
  balance: bigint;

  constructor(props: UserProperties) {
    super(props.id, props.createdAt, props.updatedAt);
    this.telegramId = props.telegramId;
    this.walletAddress = props.walletAddress;
    this.walletAddressVariants = props.walletAddressVariants || [];
    this.balance = props.balance;
  }

  /**
   * Check if user has sufficient balance
   */
  hasSufficientBalance(amount: bigint): boolean {
    return this.balance >= amount;
  }

  /**
   * Deduct amount from user balance
   */
  deductBalance(amount: bigint): void {
    if (!this.hasSufficientBalance(amount)) {
      throw new Error('Insufficient balance');
    }
    this.balance -= amount;
    this.markAsUpdated();
  }

  /**
   * Add amount to user balance
   */
  addBalance(amount: bigint): void {
    this.balance += amount;
    this.markAsUpdated();
  }

  /**
   * Link wallet to user
   */
  linkWallet(walletAddress: string, variants: string[] = []): void {
    this.walletAddress = walletAddress;
    this.walletAddressVariants = [walletAddress, ...variants];
    this.markAsUpdated();
  }

  /**
   * Check if wallet is linked
   */
  hasWallet(): boolean {
    return !!this.walletAddress;
  }

  /**
   * Check if address matches any variant
   */
  matchesWalletVariant(address: string): boolean {
    return this.walletAddressVariants.includes(address);
  }

  /**
   * Convert entity to plain object
   */
  override toJSON(): any {
    return {
      ...super.toJSON(),
      telegramId: this.telegramId,
      walletAddress: this.walletAddress,
      walletAddressVariants: this.walletAddressVariants,
      balance: this.balance.toString()
    };
  }
}
