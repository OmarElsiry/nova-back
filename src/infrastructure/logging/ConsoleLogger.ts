/**
 * Console Logger Implementation
 * Simple logger that outputs to console
 * Suitable for development and testing
 */

import type { ILogger } from './ILogger';

export class ConsoleLogger implements ILogger {
  private context: any = {};

  constructor(private serviceName: string, context?: any) {
    this.context = context || {};
  }

  debug(message: string, context?: any): void {
    console.debug(`[${this.serviceName}] DEBUG:`, message, {
      ...this.context,
      ...context
    });
  }

  info(message: string, context?: any): void {
    console.log(`[${this.serviceName}] INFO:`, message, {
      ...this.context,
      ...context
    });
  }

  warn(message: string, context?: any): void {
    console.warn(`[${this.serviceName}] WARN:`, message, {
      ...this.context,
      ...context
    });
  }

  error(message: string, error?: any, context?: any): void {
    console.error(`[${this.serviceName}] ERROR:`, message, {
      error: error?.message || error,
      stack: error?.stack,
      ...this.context,
      ...context
    });
  }

  child(context: any): ILogger {
    return new ConsoleLogger(this.serviceName, {
      ...this.context,
      ...context
    });
  }
}
