/**
 * Production Logger Implementation
 * Provides structured logging with different levels and transports
 */

import type { ILogger } from './ILogger';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export class Logger implements ILogger {
  private context: string;
  private level: LogLevel;
  private metadata: Record<string, any> = {};

  constructor(context: string, level?: LogLevel) {
    this.context = context;
    this.level = level ?? this.getLogLevelFromEnv();
  }

  private getLogLevelFromEnv(): LogLevel {
    const levelStr = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    return LogLevel[levelStr as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] [${this.context}] ${message}${metaStr}`;
  }

  private log(level: LogLevel, levelStr: string, message: string, meta?: any): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(levelStr, message, { ...this.metadata, ...meta });

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formattedMessage);
        break;
    }

    // In production, you might want to send logs to an external service
    if (process.env.NODE_ENV === 'production' && level >= LogLevel.ERROR) {
      // Send to monitoring service (e.g., Sentry, DataDog, etc.)
      this.sendToMonitoring(levelStr, message, meta);
    }
  }

  private sendToMonitoring(level: string, message: string, meta?: any): void {
    // Implement external logging service integration here
    // For now, just a placeholder
    if (process.env.SENTRY_DSN) {
      // Send to Sentry
    }
  }

  debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, meta);
  }

  info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, meta);
  }

  error(message: string, error?: any): void {
    const meta = error instanceof Error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    } : error;
    this.log(LogLevel.ERROR, 'ERROR', message, meta);
  }

  fatal(message: string, error?: any): void {
    const meta = error instanceof Error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    } : error;
    this.log(LogLevel.FATAL, 'FATAL', message, meta);
  }

  setMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }

  clearMetadata(): void {
    this.metadata = {};
  }

  child(context: string): ILogger {
    const childLogger = new Logger(`${this.context}:${context}`, this.level);
    childLogger.metadata = { ...this.metadata };
    return childLogger;
  }
}

/**
 * Logger factory
 */
export function createLogger(context: string): ILogger {
  return new Logger(context);
}

/**
 * Global logger instance
 */
let globalLogger: ILogger | null = null;

export function getGlobalLogger(): ILogger {
  if (!globalLogger) {
    globalLogger = createLogger('app');
  }
  return globalLogger;
}
