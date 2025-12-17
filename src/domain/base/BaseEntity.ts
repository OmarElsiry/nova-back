/**
 * Base Entity Class
 * All domain entities should extend this class
 * Provides common properties and methods for all entities
 */

export abstract class BaseEntity {
  id: string | number;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string | number, createdAt?: Date, updatedAt?: Date) {
    this.id = id;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  /**
   * Check if entity is new (not yet persisted)
   */
  isNew(): boolean {
    return !this.id;
  }

  /**
   * Update the updatedAt timestamp
   */
  markAsUpdated(): void {
    this.updatedAt = new Date();
  }

  /**
   * Convert entity to plain object
   */
  toJSON(): any {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
