/**
 * Base Repository Class
 * Provides common data access patterns for all repositories
 * Implements the Repository pattern for data abstraction
 */

import { PrismaClient } from '@prisma/client';
import { BaseEntity } from './BaseEntity';

export abstract class BaseRepository<T extends BaseEntity> {
  protected prisma: PrismaClient;
  protected modelName: string;

  constructor(prisma: PrismaClient, modelName: string) {
    this.prisma = prisma;
    this.modelName = modelName;
  }

  /**
   * Find entity by ID
   */
  abstract findById(id: string | number): Promise<T | null>;

  /**
   * Find all entities
   */
  abstract findAll(filters?: any): Promise<T[]>;

  /**
   * Create new entity
   */
  abstract create(data: Partial<T>): Promise<T>;

  /**
   * Update existing entity
   */
  abstract update(id: string | number, data: Partial<T>): Promise<T>;

  /**
   * Delete entity
   */
  abstract delete(id: string | number): Promise<boolean>;

  /**
   * Check if entity exists
   */
  abstract exists(id: string | number): Promise<boolean>;

  /**
   * Count entities matching criteria
   */
  abstract count(filters?: any): Promise<number>;

  /**
   * Helper method to convert Prisma result to domain entity
   */
  protected toDomain(raw: any): T {
    return raw as T;
  }

  /**
   * Helper method to convert domain entity to Prisma input
   */
  protected toPersistence(entity: T): any {
    return entity;
  }
}
