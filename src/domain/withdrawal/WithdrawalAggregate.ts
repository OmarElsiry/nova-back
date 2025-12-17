/**
 * Withdrawal Aggregate Root
 * Following DDD principles - contains business logic and invariants
 */

import { BaseEntity } from '../base/BaseEntity';
import { WithdrawalStatus, WithdrawalRiskLevel } from './WithdrawalValueObjects';
import { WithdrawalCreatedEvent, WithdrawalApprovedEvent, WithdrawalRejectedEvent } from './WithdrawalEvents';

export interface WithdrawalProperties {
  id: string;
  userId: number;
  destinationAddress: string;
  amountNano: bigint;
  status: WithdrawalStatus;
  riskScore?: number;
  message?: string;
  txHash?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class WithdrawalAggregate extends BaseEntity {
  private _userId: number;
  private _destinationAddress: string;
  private _amountNano: bigint;
  private _status: WithdrawalStatus;
  private _riskScore: number;
  private _message?: string;
  private _txHash?: string;
  private _rejectionReason?: string;
  private _events: any[] = [];

  constructor(props: WithdrawalProperties) {
    super(props.id, props.createdAt, props.updatedAt);
    this._userId = props.userId;
    this._destinationAddress = props.destinationAddress;
    this._amountNano = props.amountNano;
    this._status = props.status;
    this._riskScore = props.riskScore || 0;
    this._message = props.message;
    this._txHash = props.txHash;
    this._rejectionReason = props.rejectionReason;
  }

  /**
   * Factory method to create new withdrawal
   */
  static create(
    userId: number,
    destinationAddress: string,
    amountNano: bigint,
    message?: string
  ): WithdrawalAggregate {
    const id = `withdrawal_${Date.now()}_${userId}`;
    const now = new Date();
    
    const withdrawal = new WithdrawalAggregate({
      id,
      userId,
      destinationAddress,
      amountNano,
      status: WithdrawalStatus.PENDING,
      message,
      createdAt: now,
      updatedAt: now
    });

    withdrawal.addEvent(new WithdrawalCreatedEvent({
      withdrawalId: id,
      userId,
      amountNano,
      destinationAddress
    }));

    return withdrawal;
  }

  /**
   * Business rule: Check if withdrawal can be processed
   */
  canProcess(): boolean {
    return this._status === WithdrawalStatus.PENDING && 
           this.getRiskLevel() !== WithdrawalRiskLevel.CRITICAL;
  }

  /**
   * Business rule: Calculate risk level based on score
   */
  getRiskLevel(): WithdrawalRiskLevel {
    if (this._riskScore > 0.8) return WithdrawalRiskLevel.CRITICAL;
    if (this._riskScore > 0.5) return WithdrawalRiskLevel.HIGH;
    if (this._riskScore > 0.3) return WithdrawalRiskLevel.MEDIUM;
    return WithdrawalRiskLevel.LOW;
  }

  /**
   * Business rule: Approve withdrawal
   */
  approve(txHash: string): void {
    if (!this.canProcess()) {
      throw new Error('Withdrawal cannot be processed in current state');
    }

    this._status = WithdrawalStatus.APPROVED;
    this._txHash = txHash;
    this.markAsUpdated();

    this.addEvent(new WithdrawalApprovedEvent({
      withdrawalId: this.id,
      txHash
    }));
  }

  /**
   * Business rule: Reject withdrawal
   */
  reject(reason: string): void {
    if (this._status !== WithdrawalStatus.PENDING) {
      throw new Error('Only pending withdrawals can be rejected');
    }

    this._status = WithdrawalStatus.REJECTED;
    this._rejectionReason = reason;
    this.markAsUpdated();

    this.addEvent(new WithdrawalRejectedEvent({
      withdrawalId: this.id,
      reason
    }));
  }

  /**
   * Business rule: Set risk score
   */
  setRiskScore(score: number): void {
    if (score < 0 || score > 1) {
      throw new Error('Risk score must be between 0 and 1');
    }
    this._riskScore = score;
    this.markAsUpdated();
  }

  /**
   * Domain event handling
   */
  private addEvent(event: any): void {
    this._events.push(event);
  }

  getUncommittedEvents(): any[] {
    return this._events;
  }

  markEventsAsCommitted(): void {
    this._events = [];
  }

  // Getters
  get userId(): number { return this._userId; }
  get destinationAddress(): string { return this._destinationAddress; }
  get amountNano(): bigint { return this._amountNano; }
  get status(): WithdrawalStatus { return this._status; }
  get riskScore(): number { return this._riskScore; }
  get message(): string | undefined { return this._message; }
  get txHash(): string | undefined { return this._txHash; }
  get rejectionReason(): string | undefined { return this._rejectionReason; }
}
