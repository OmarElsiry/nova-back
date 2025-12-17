/**
 * Deposit Entity
 * Core domain entity representing a deposit/incoming transaction
 */

import { BaseEntity } from '../base/BaseEntity';

export enum DepositStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed'
}

export interface DepositProperties {
  id: number;
  userId: number;
  canonicalAddress: string;
  transactionHash: string;
  amountNano: bigint;
  status: DepositStatus;
  confirmationDepth: number;
  reorgSafe: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class DepositEntity extends BaseEntity {
  userId: number;
  canonicalAddress: string;
  transactionHash: string;
  amountNano: bigint;
  status: DepositStatus;
  confirmationDepth: number;
  reorgSafe: boolean;
  metadata?: Record<string, any>;

  constructor(props: DepositProperties) {
    super(props.id, props.createdAt, props.updatedAt);
    this.userId = props.userId;
    this.canonicalAddress = props.canonicalAddress;
    this.transactionHash = props.transactionHash;
    this.amountNano = props.amountNano;
    this.status = props.status;
    this.confirmationDepth = props.confirmationDepth;
    this.reorgSafe = props.reorgSafe;
    this.metadata = props.metadata;
  }

  /**
   * Check if deposit is pending
   */
  isPending(): boolean {
    return this.status === DepositStatus.PENDING;
  }

  /**
   * Check if deposit is confirmed
   */
  isConfirmed(): boolean {
    return this.status === DepositStatus.CONFIRMED;
  }

  /**
   * Check if deposit failed
   */
  isFailed(): boolean {
    return this.status === DepositStatus.FAILED;
  }

  /**
   * Confirm the deposit
   */
  confirm(confirmationDepth: number, reorgSafe: boolean): void {
    if (!this.isPending()) {
      throw new Error('Only pending deposits can be confirmed');
    }
    this.status = DepositStatus.CONFIRMED;
    this.confirmationDepth = confirmationDepth;
    this.reorgSafe = reorgSafe;
    this.markAsUpdated();
  }

  /**
   * Mark deposit as failed
   */
  fail(): void {
    if (this.isConfirmed()) {
      throw new Error('Cannot fail confirmed deposits');
    }
    this.status = DepositStatus.FAILED;
    this.markAsUpdated();
  }

  /**
   * Get deposit amount in TON
   */
  getAmountInTon(): number {
    return Number(this.amountNano) / 1_000_000_000;
  }

  /**
   * Check if deposit is reorg safe
   */
  isReorgSafe(): boolean {
    return this.reorgSafe && this.confirmationDepth >= 10;
  }

  /**
   * Convert entity to plain object
   */
  override toJSON(): any {
    return {
      ...super.toJSON(),
      userId: this.userId,
      canonicalAddress: this.canonicalAddress,
      transactionHash: this.transactionHash,
      amountNano: this.amountNano.toString(),
      status: this.status,
      confirmationDepth: this.confirmationDepth,
      reorgSafe: this.reorgSafe,
      metadata: this.metadata
    };
  }
}
