/**
 * Withdrawal Entity
 * Core domain entity representing a withdrawal request
 */

import { BaseEntity } from '../base/BaseEntity';

export enum WithdrawalStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface WithdrawalProperties {
  id: number;
  userId: number;
  destinationAddress: string;
  amountNano: bigint;
  status: WithdrawalStatus;
  transactionHash?: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class WithdrawalEntity extends BaseEntity {
  userId: number;
  destinationAddress: string;
  amountNano: bigint;
  status: WithdrawalStatus;
  transactionHash?: string;
  failureReason?: string;

  constructor(props: WithdrawalProperties) {
    super(props.id, props.createdAt, props.updatedAt);
    this.userId = props.userId;
    this.destinationAddress = props.destinationAddress;
    this.amountNano = props.amountNano;
    this.status = props.status;
    this.transactionHash = props.transactionHash;
    this.failureReason = props.failureReason;
  }

  /**
   * Check if withdrawal is pending
   */
  isPending(): boolean {
    return this.status === WithdrawalStatus.PENDING;
  }

  /**
   * Check if withdrawal is processing
   */
  isProcessing(): boolean {
    return this.status === WithdrawalStatus.PROCESSING;
  }

  /**
   * Check if withdrawal is completed
   */
  isCompleted(): boolean {
    return this.status === WithdrawalStatus.COMPLETED;
  }

  /**
   * Check if withdrawal failed
   */
  isFailed(): boolean {
    return this.status === WithdrawalStatus.FAILED;
  }

  /**
   * Check if withdrawal is cancelled
   */
  isCancelled(): boolean {
    return this.status === WithdrawalStatus.CANCELLED;
  }

  /**
   * Start processing the withdrawal
   */
  startProcessing(): void {
    if (!this.isPending()) {
      throw new Error('Only pending withdrawals can be processed');
    }
    this.status = WithdrawalStatus.PROCESSING;
    this.markAsUpdated();
  }

  /**
   * Complete the withdrawal
   */
  complete(transactionHash: string): void {
    if (!this.isProcessing()) {
      throw new Error('Only processing withdrawals can be completed');
    }
    this.status = WithdrawalStatus.COMPLETED;
    this.transactionHash = transactionHash;
    this.markAsUpdated();
  }

  /**
   * Mark withdrawal as failed
   */
  fail(reason: string): void {
    if (this.isCompleted()) {
      throw new Error('Cannot fail completed withdrawals');
    }
    this.status = WithdrawalStatus.FAILED;
    this.failureReason = reason;
    this.markAsUpdated();
  }

  /**
   * Cancel the withdrawal
   */
  cancel(): void {
    if (this.isCompleted() || this.isFailed()) {
      throw new Error('Cannot cancel completed or failed withdrawals');
    }
    this.status = WithdrawalStatus.CANCELLED;
    this.markAsUpdated();
  }

  /**
   * Get withdrawal amount in TON
   */
  getAmountInTon(): number {
    return Number(this.amountNano) / 1_000_000_000;
  }

  /**
   * Convert entity to plain object
   */
  override toJSON(): any {
    return {
      ...super.toJSON(),
      userId: this.userId,
      destinationAddress: this.destinationAddress,
      amountNano: this.amountNano.toString(),
      status: this.status,
      transactionHash: this.transactionHash,
      failureReason: this.failureReason
    };
  }
}
