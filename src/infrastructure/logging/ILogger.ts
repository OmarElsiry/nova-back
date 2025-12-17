/**
 * Logger Interface
 * Defines the contract for logging implementations
 */

export interface ILogger {
  /**
   * Log debug message
   */
  debug(message: string, context?: any): void;

  /**
   * Log info message
   */
  info(message: string, context?: any): void;

  /**
   * Log warning message
   */
  warn(message: string, context?: any): void;

  /**
   * Log error message
   */
  error(message: string, error?: any, context?: any): void;

  /**
   * Create a child logger with additional context
   */
  child(context: any): ILogger;
}
