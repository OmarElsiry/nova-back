import { Entity } from './Entity';
import { DomainEvent } from './DomainEvent';

/**
 * Aggregate Root - manages domain events and ensures consistency
 */
export abstract class AggregateRoot<T> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
    this.logDomainEvent(event);
  }

  public clearEvents(): void {
    this._domainEvents = [];
  }

  private logDomainEvent(event: DomainEvent): void {
    const eventName = event.constructor.name;
    console.log(`[Domain Event]: ${eventName}`, {
      aggregateId: this._id,
      occurredAt: event.occurredAt,
    });
  }
}
