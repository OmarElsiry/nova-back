/**
 * Singleton Database Connection Manager
 * Ensures single PrismaClient instance across the application
 * Implements connection pooling and graceful shutdown
 */

import { PrismaClient } from '@prisma/client';
import type { ILogger } from '../logging/ILogger';

export class PrismaConnection {
  private static instance: PrismaConnection;
  private prisma: PrismaClient;
  private logger: ILogger;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  private constructor(logger: ILogger) {
    this.logger = logger;

    // Configure Prisma with production settings
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'info', 'warn', 'error'],
      errorFormat: 'minimal',
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./prisma/data/nova.db'
        }
      }
    });

    // Handle connection events
    this.prisma.$on('query' as never, (e: any) => {
      if (process.env.LOG_QUERIES === 'true') {
        this.logger.debug('Database query', {
          query: e.query,
          params: e.params,
          duration: e.duration
        });
      }
    });

    this.setupShutdownHandlers();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(logger: ILogger): PrismaConnection {
    if (!PrismaConnection.instance) {
      PrismaConnection.instance = new PrismaConnection(logger);
    }
    return PrismaConnection.instance;
  }

  /**
   * Get Prisma client
   */
  public getClient(): PrismaClient {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.prisma;
  }

  /**
   * Connect to database
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.performConnection();
    return this.connectionPromise;
  }

  private async performConnection(): Promise<void> {
    try {
      this.logger.info('Connecting to database...');

      // Test connection
      await this.prisma.$connect();

      // Verify connection with a simple query
      await this.prisma.$queryRaw`SELECT 1`;

      this.isConnected = true;
      this.logger.info('Database connected successfully');

      // Set WAL mode for better concurrency (SQLite)
      if (process.env.DATABASE_URL?.includes('sqlite')) {
        await this.prisma.$executeRaw`PRAGMA journal_mode = WAL`;
        await this.prisma.$executeRaw`PRAGMA synchronous = NORMAL`;
        await this.prisma.$executeRaw`PRAGMA cache_size = -64000`;
        await this.prisma.$executeRaw`PRAGMA temp_store = MEMORY`;
        await this.prisma.$executeRaw`PRAGMA mmap_size = 30000000000`;
        this.logger.info('SQLite optimizations applied');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      // Sanitize potential connection string in error message
      const sanitizedError = errorMessage.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');

      this.logger.error('Failed to connect to database', { error: sanitizedError });
      this.isConnected = false;
      this.connectionPromise = null;
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      this.logger.info('Disconnecting from database...');
      await this.prisma.$disconnect();
      this.isConnected = false;
      this.connectionPromise = null;
      this.logger.info('Database disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting from database', error);
      throw error;
    }
  }

  /**
   * Check connection health
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      const sanitizedError = errorMessage.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
      this.logger.error('Database health check failed', { error: sanitizedError });
      return false;
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Nodemon restart
  }

  /**
   * Execute transaction with retry logic
   */
  public async transaction<T>(
    fn: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          return await fn(tx as PrismaClient);
        }, {
          maxWait: 5000,
          timeout: 10000,
          isolationLevel: 'Serializable'
        });
      } catch (error) {
        lastError = error as Error;

        // Don't retry on non-retryable errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        const errorMessage = (error as any)?.message || 'Unknown error';
        const sanitizedError = errorMessage.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
        this.logger.warn(`Transaction failed (attempt ${i + 1}/${maxRetries})`, { error: sanitizedError });

        // Exponential backoff
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
        }
      }
    }

    throw lastError || new Error('Transaction failed after all retries');
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: any): boolean {
    const errorCode = error?.code;
    const nonRetryableCodes = [
      'P2002', // Unique constraint violation
      'P2003', // Foreign key constraint violation
      'P2025', // Record not found
    ];
    return nonRetryableCodes.includes(errorCode);
  }

  /**
   * Get connection stats
   */
  public getStats() {
    return {
      isConnected: this.isConnected,
      // Add more metrics as needed
    };
  }
}

// Export singleton getter for convenience
export function getPrismaClient(logger: ILogger): PrismaClient {
  const connection = PrismaConnection.getInstance(logger);
  return connection.getClient();
}
