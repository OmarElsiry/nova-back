/**
 * Migration Manager
 * Manages database migrations and schema updates
 */

import { PrismaClient } from '@prisma/client';
import type { ILogger } from '../logging/ILogger';

export interface Migration {
  version: string;
  name: string;
  up: (prisma: PrismaClient) => Promise<void>;
  down: (prisma: PrismaClient) => Promise<void>;
}

export class MigrationManager {
  private prisma: PrismaClient;
  private logger: ILogger;
  private migrations: Map<string, Migration> = new Map();

  constructor(prisma: PrismaClient, logger: ILogger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Register a migration
   */
  registerMigration(migration: Migration): void {
    this.migrations.set(migration.version, migration);
    this.logger.info('Migration registered', { version: migration.version, name: migration.name });
  }

  /**
   * Run pending migrations
   */
  async runPendingMigrations(): Promise<void> {
    this.logger.info('Checking for pending migrations');

    try {
      // Get list of applied migrations from database
      const appliedMigrations = await this.getAppliedMigrations();

      // Run pending migrations
      for (const [version, migration] of this.migrations) {
        if (!appliedMigrations.includes(version)) {
          this.logger.info('Running migration', { version, name: migration.name });
          
          try {
            await migration.up(this.prisma);
            await this.recordMigration(version, migration.name);
            this.logger.info('Migration completed', { version, name: migration.name });
          } catch (error) {
            this.logger.error('Migration failed', error, { version, name: migration.name });
            throw error;
          }
        }
      }

      this.logger.info('All pending migrations completed');
    } catch (error) {
      this.logger.error('Failed to run migrations', error);
      throw error;
    }
  }

  /**
   * Rollback last migration
   */
  async rollbackLastMigration(): Promise<void> {
    this.logger.info('Rolling back last migration');

    try {
      const lastMigration = await this.getLastMigration();
      
      if (!lastMigration) {
        this.logger.warn('No migrations to rollback');
        return;
      }

      const migration = this.migrations.get(lastMigration.version);
      
      if (!migration) {
        throw new Error(`Migration not found: ${lastMigration.version}`);
      }

      this.logger.info('Rolling back migration', { version: lastMigration.version });
      
      await migration.down(this.prisma);
      await this.removeMigration(lastMigration.version);
      
      this.logger.info('Migration rollback completed', { version: lastMigration.version });
    } catch (error) {
      this.logger.error('Failed to rollback migration', error);
      throw error;
    }
  }

  /**
   * Get applied migrations
   */
  private async getAppliedMigrations(): Promise<string[]> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ version: string }>>`
        SELECT version FROM _migrations
        ORDER BY applied_at DESC
      `;
      return result.map((row) => row.version);
    } catch (error) {
      // Migrations table doesn't exist yet
      return [];
    }
  }

  /**
   * Get last applied migration
   */
  private async getLastMigration(): Promise<{ version: string; name: string } | null> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ version: string; name: string }>>`
        SELECT version, name FROM _migrations
        ORDER BY applied_at DESC
        LIMIT 1
      `;
      return result[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Record migration as applied
   */
  private async recordMigration(version: string, name: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO _migrations (version, name, applied_at)
        VALUES (${version}, ${name}, NOW())
      `;
    } catch (error) {
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();
      await this.prisma.$executeRaw`
        INSERT INTO _migrations (version, name, applied_at)
        VALUES (${version}, ${name}, NOW())
      `;
    }
  }

  /**
   * Remove migration record
   */
  private async removeMigration(version: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM _migrations WHERE version = ${version}
    `;
  }

  /**
   * Create migrations tracking table
   */
  private async createMigrationsTable(): Promise<void> {
    await this.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `;
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{ applied: string[]; pending: string[] }> {
    const applied = await this.getAppliedMigrations();
    const pending = Array.from(this.migrations.keys()).filter((v) => !applied.includes(v));

    return { applied, pending };
  }
}
