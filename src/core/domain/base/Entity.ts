/**
 * Base Entity class following Domain-Driven Design principles
 */
export abstract class Entity<T> {
  protected readonly _id: string;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  constructor(props: T, id?: string) {
    this._id = id ?? this.generateId();
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  get id(): string {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected generateId(): string {
    return crypto.randomUUID();
  }

  equals(entity: Entity<T>): boolean {
    if (entity === null || entity === undefined) {
      return false;
    }
    if (this === entity) {
      return true;
    }
    return this._id === entity._id;
  }

  protected updateTimestamp(): void {
    this._updatedAt = new Date();
  }
}
