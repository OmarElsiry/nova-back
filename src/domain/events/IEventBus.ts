/**
 * Event Bus Interface
 * Core abstraction for event-driven architecture
 */

export interface DomainEvent {
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  metadata?: Record<string, any>;
}

export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>;
}

export interface IEventBus {
  /**
   * Publish an event to all registered handlers
   */
  publish(event: DomainEvent): Promise<void>;
  
  /**
   * Publish multiple events
   */
  publishAll(events: DomainEvent[]): Promise<void>;
  
  /**
   * Subscribe to a specific event type
   */
  subscribe(eventType: string, handler: EventHandler): void;
  
  /**
   * Unsubscribe a handler
   */
  unsubscribe(eventType: string, handler: EventHandler): void;
  
  /**
   * Clear all subscriptions (useful for testing)
   */
  clearSubscriptions(): void;
}
