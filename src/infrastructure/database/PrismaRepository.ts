/**
 * Prisma Repository Base Class
 * Provides common Prisma-based repository functionality
 */

import { PrismaClient } from '@prisma/client';
import { BaseRepository } from '../../domain/base/BaseRepository';
import type { BaseEntity } from '../../domain/base/BaseEntity';
import { NotFoundError } from '../../shared/errors/AppError';

export abstract class PrismaRepository<T extends BaseEntity> extends BaseRepository<T> {
  protected prismaModel: any;

  constructor(prisma: PrismaClient, modelName: string, prismaModel: any) {
    super(prisma, modelName);
    this.prismaModel = prismaModel;
  }

  /**
   * Find entity by ID
   */
  async findById(id: string | number): Promise<T | null> {
    try {
      const result = await this.prismaModel.findUnique({
        where: { id: typeof id === 'string' ? parseInt(id) : id }
      });
      return result ? this.toDomain(result) : null;
    } catch (error) {
      throw new Error(`Failed to find ${this.modelName} by ID: ${error}`);
    }
  }

  /**
   * Find all entities
   */
  async findAll(filters?: any): Promise<T[]> {
    try {
      const results = await this.prismaModel.findMany({
        where: filters || {}
      });
      return results.map((result: any) => this.toDomain(result));
    } catch (error) {
      throw new Error(`Failed to find all ${this.modelName}: ${error}`);
    }
  }

  /**
   * Create new entity
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      const result = await this.prismaModel.create({
        data: this.toPersistence(data as T)
      });
      return this.toDomain(result);
    } catch (error) {
      throw new Error(`Failed to create ${this.modelName}: ${error}`);
    }
  }

  /**
   * Update existing entity
   */
  async update(id: string | number, data: Partial<T>): Promise<T> {
    try {
      const result = await this.prismaModel.update({
        where: { id: typeof id === 'string' ? parseInt(id) : id },
        data: this.toPersistence(data as T)
      });
      return this.toDomain(result);
    } catch (error) {
      throw new Error(`Failed to update ${this.modelName}: ${error}`);
    }
  }

  /**
   * Delete entity
   */
  async delete(id: string | number): Promise<boolean> {
    try {
      await this.prismaModel.delete({
        where: { id: typeof id === 'string' ? parseInt(id) : id }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if entity exists
   */
  async exists(id: string | number): Promise<boolean> {
    try {
      const result = await this.prismaModel.findUnique({
        where: { id: typeof id === 'string' ? parseInt(id) : id }
      });
      return !!result;
    } catch (error) {
      return false;
    }
  }

  /**
   * Count entities matching criteria
   */
  async count(filters?: any): Promise<number> {
    try {
      return await this.prismaModel.count({
        where: filters || {}
      });
    } catch (error) {
      throw new Error(`Failed to count ${this.modelName}: ${error}`);
    }
  }

  /**
   * Find with pagination
   */
  async findWithPagination(
    page: number = 1,
    pageSize: number = 10,
    filters?: any
  ): Promise<{ data: T[]; total: number; page: number; pageSize: number }> {
    try {
      const skip = (page - 1) * pageSize;
      const [data, total] = await Promise.all([
        this.prismaModel.findMany({
          where: filters || {},
          skip,
          take: pageSize
        }),
        this.prismaModel.count({
          where: filters || {}
        })
      ]);

      return {
        data: data.map((item: any) => this.toDomain(item)),
        total,
        page,
        pageSize
      };
    } catch (error) {
      throw new Error(`Failed to paginate ${this.modelName}: ${error}`);
    }
  }

  /**
   * Batch create entities
   */
  async createMany(data: Partial<T>[]): Promise<T[]> {
    try {
      const results = await this.prismaModel.createMany({
        data: data.map((item) => this.toPersistence(item as T))
      });
      return results.map((result: any) => this.toDomain(result));
    } catch (error) {
      throw new Error(`Failed to batch create ${this.modelName}: ${error}`);
    }
  }

  /**
   * Batch update entities
   */
  async updateMany(updates: Array<{ id: string | number; data: Partial<T> }>): Promise<T[]> {
    try {
      const results = await Promise.all(
        updates.map((update) =>
          this.prismaModel.update({
            where: { id: typeof update.id === 'string' ? parseInt(update.id) : update.id },
            data: this.toPersistence(update.data as T)
          })
        )
      );
      return results.map((result) => this.toDomain(result));
    } catch (error) {
      throw new Error(`Failed to batch update ${this.modelName}: ${error}`);
    }
  }

  /**
   * Batch delete entities
   */
  async deleteMany(ids: (string | number)[]): Promise<number> {
    try {
      const result = await this.prismaModel.deleteMany({
        where: {
          id: {
            in: ids.map((id) => (typeof id === 'string' ? parseInt(id) : id))
          }
        }
      });
      return result.count;
    } catch (error) {
      throw new Error(`Failed to batch delete ${this.modelName}: ${error}`);
    }
  }
}
