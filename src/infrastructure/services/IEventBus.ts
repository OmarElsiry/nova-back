/**
 * Event interface for domain events
 */
export interface IEvent {
  type: string;
  payload: any;
  occurredAt: Date;
  correlationId?: string;
}

/**
 * Event handler interface
 */
export interface IEventHandler<T extends IEvent = IEvent> {
  handle(event: T): Promise<void>;
}

/**
 * Event bus interface for publishing and subscribing to domain events
 */
export interface IEventBus {
  publish(event: IEvent): Promise<void>;
  publishMany(events: IEvent[]): Promise<void>;
  subscribe(eventType: string, handler: IEventHandler): void;
  unsubscribe(eventType: string, handler: IEventHandler): void;
}
