/**
 * Database Connection Manager
 * Manages Prisma client lifecycle and connection pooling
 */

import { PrismaClient } from '@prisma/client';
import type { ILogger } from '../logging/ILogger';

export class DatabaseConnection {
  private static instance: PrismaClient | null = null;
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Get or create Prisma client instance
   */
  async getInstance(): Promise<PrismaClient> {
    if (DatabaseConnection.instance) {
      return DatabaseConnection.instance;
    }

    this.logger.info('Initializing database connection');

    const prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' }
      ]
    });

    // Set up event listeners
    prisma.$on('query', (e) => {
      this.logger.debug('Database query', {
        query: e.query,
        duration: `${e.duration}ms`
      });
    });

    prisma.$on('error', (e) => {
      this.logger.error('Database error', e);
    });

    prisma.$on('warn', (e) => {
      this.logger.warn('Database warning', e);
    });

    // Test connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      this.logger.info('Database connection established successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }

    DatabaseConnection.instance = prisma;
    return prisma;
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (DatabaseConnection.instance) {
      this.logger.info('Disconnecting from database');
      await DatabaseConnection.instance.$disconnect();
      DatabaseConnection.instance = null;
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const prisma = await this.getInstance();
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }

  /**
   * Get connection pool stats
   */
  async getPoolStats(): Promise<any> {
    if (!DatabaseConnection.instance) {
      return null;
    }

    try {
      const result = await DatabaseConnection.instance.$queryRaw`
        SELECT 
          datname as database,
          numbackends as active_connections
        FROM pg_stat_database
        WHERE datname = current_database()
      `;
      return result;
    } catch (error) {
      this.logger.error('Failed to get pool stats', error);
      return null;
    }
  }
}
