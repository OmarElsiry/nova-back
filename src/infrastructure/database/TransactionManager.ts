/**
 * Transaction Manager
 * 
 * Provides transaction management utilities for database operations
 */

import { PrismaClient } from '@prisma/client';
import type { ILogger } from '../logging/ILogger';

export class TransactionManager {
  constructor(
    private prisma: PrismaClient,
    private logger: ILogger
  ) {}

  /**
   * Execute operations within a transaction
   * Automatically rolls back on error
   */
  async executeInTransaction<T>(
    operation: (tx: PrismaClient) => Promise<T>,
    operationName: string = 'transaction'
  ): Promise<T> {
    this.logger.info(`Starting transaction: ${operationName}`);
    const startTime = Date.now();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        return await operation(tx as PrismaClient);
      });

      const duration = Date.now() - startTime;
      this.logger.info(`Transaction completed: ${operationName}`, {
        duration: `${duration}ms`,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Transaction failed: ${operationName}`, {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
      });

      throw error;
    }
  }

  /**
   * Execute operations with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        this.logger.warn(`Operation failed, attempt ${attempt}/${maxRetries}`, {
          error: lastError.message,
        });

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    this.logger.error('Operation failed after all retries', {
      attempts: maxRetries,
      error: lastError?.message,
    });

    throw lastError || new Error('Operation failed');
  }

  /**
   * Execute transaction with retry logic
   */
  async executeTransactionWithRetry<T>(
    operation: (tx: PrismaClient) => Promise<T>,
    operationName: string = 'transaction',
    maxRetries: number = 3
  ): Promise<T> {
    return this.executeWithRetry(
      () => this.executeInTransaction(operation, operationName),
      maxRetries
    );
  }
}
