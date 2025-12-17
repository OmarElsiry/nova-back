/**
 * Logger Factory
 * Creates logger instances based on configuration
 */

import type { ILogger } from './ILogger';
import { ConsoleLogger } from './ConsoleLogger';

type LoggerType = 'console' | 'file' | 'combined';

export class LoggerFactory {
  private static instance: LoggerFactory;
  private loggerType: LoggerType = 'console';
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';

  private constructor() {
    this.loggerType = (process.env.LOGGER_TYPE as LoggerType) || 'console';
    this.logLevel = (process.env.LOG_LEVEL as any) || 'info';
  }

  /**
   * Get or create the logger factory singleton
   */
  static getInstance(): LoggerFactory {
    if (!LoggerFactory.instance) {
      LoggerFactory.instance = new LoggerFactory();
    }
    return LoggerFactory.instance;
  }

  /**
   * Create a logger for a service
   */
  createLogger(serviceName: string, context?: any): ILogger {
    switch (this.loggerType) {
      case 'console':
        return new ConsoleLogger(serviceName, context);
      case 'file':
        // TODO: Implement file logger
        return new ConsoleLogger(serviceName, context);
      case 'combined':
        // TODO: Implement combined logger (console + file)
        return new ConsoleLogger(serviceName, context);
      default:
        return new ConsoleLogger(serviceName, context);
    }
  }

  /**
   * Set the logger type
   */
  setLoggerType(type: LoggerType): void {
    this.loggerType = type;
  }

  /**
   * Set the log level
   */
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logLevel = level;
  }

  /**
   * Get current logger type
   */
  getLoggerType(): LoggerType {
    return this.loggerType;
  }

  /**
   * Get current log level
   */
  getLogLevel(): string {
    return this.logLevel;
  }
}

/**
 * Convenience function to create a logger
 */
export function createLogger(serviceName: string, context?: any): ILogger {
  return LoggerFactory.getInstance().createLogger(serviceName, context);
}
