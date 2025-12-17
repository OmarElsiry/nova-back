/**
 * Base class for all domain events
 */
export abstract class DomainEvent {
  public readonly occurredAt: Date;
  public readonly aggregateId: string;
  public readonly eventVersion: number;

  constructor(aggregateId: string) {
    this.occurredAt = new Date();
    this.aggregateId = aggregateId;
    this.eventVersion = 1;
  }

  abstract getEventName(): string;
}
