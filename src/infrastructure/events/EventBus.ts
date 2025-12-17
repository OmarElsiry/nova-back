/**
 * Event Bus Implementation
 * In-memory event bus for domain events
 */

import type { DomainEvent, EventHandler, IEventBus } from '../../domain/events/IEventBus';

export class EventBus implements IEventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private isProcessing = false;
  private eventQueue: DomainEvent[] = [];

  /**
   * Publish an event to all registered handlers
   */
  async publish(event: DomainEvent): Promise<void> {
    // Add to queue if already processing (prevent infinite loops)
    if (this.isProcessing) {
      this.eventQueue.push(event);
      return;
    }

    await this.processEvent(event);
    
    // Process any queued events
    while (this.eventQueue.length > 0) {
      const queuedEvent = this.eventQueue.shift()!;
      await this.processEvent(queuedEvent);
    }
  }

  /**
   * Publish multiple events
   */
  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Subscribe to a specific event type
   */
  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe a handler
   */
  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.handlers.clear();
    this.eventQueue = [];
  }

  /**
   * Process a single event
   */
  private async processEvent(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType);
    if (!handlers || handlers.size === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      // Execute all handlers in parallel
      const promises = Array.from(handlers).map(handler => 
        this.executeHandler(handler, event)
      );
      
      await Promise.all(promises);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single handler with error handling
   */
  private async executeHandler(handler: EventHandler, event: DomainEvent): Promise<void> {
    try {
      await handler.handle(event);
    } catch (error) {
      // Log error but don't fail other handlers
      console.error(`Error in event handler for ${event.eventType}:`, error);
    }
  }
}
