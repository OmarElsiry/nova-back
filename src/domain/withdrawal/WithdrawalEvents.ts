/**
 * Withdrawal Domain Events
 * Events that occur in the withdrawal lifecycle
 */

import type { DomainEvent } from '../events/IEventBus';

export class WithdrawalCreatedEvent implements DomainEvent {
  readonly eventType = 'withdrawal.created';
  readonly eventVersion = 1;
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: string,
    public readonly payload: {
      userId: number;
      amountNano: bigint;
      destinationAddress: string;
      timestamp?: Date;
    },
    public readonly metadata?: Record<string, any>
  ) {
    this.occurredAt = this.payload.timestamp || new Date();
  }
}

export class WithdrawalApprovedEvent implements DomainEvent {
  readonly eventType = 'withdrawal.approved';
  readonly eventVersion = 1;
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: string,
    public readonly payload: {
      withdrawalId: string;
      txHash: string;
      timestamp?: Date;
    },
    public readonly metadata?: Record<string, any>
  ) {
    this.occurredAt = this.payload.timestamp || new Date();
  }
}

export class WithdrawalRejectedEvent {
  constructor(
    public readonly payload: {
      withdrawalId: string;
      reason: string;
      timestamp?: Date;
    }
  ) {
    this.payload.timestamp = this.payload.timestamp || new Date();
  }
}

export class WithdrawalCompletedEvent {
  constructor(
    public readonly payload: {
      withdrawalId: string;
      txHash: string;
      confirmations: number;
      timestamp?: Date;
    }
  ) {
    this.payload.timestamp = this.payload.timestamp || new Date();
  }
}

export class WithdrawalFailedEvent {
  constructor(
    public readonly payload: {
      withdrawalId: string;
      error: string;
      timestamp?: Date;
    }
  ) {
    this.payload.timestamp = this.payload.timestamp || new Date();
  }
}
