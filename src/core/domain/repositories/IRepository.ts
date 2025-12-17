/**
 * Generic repository interface following repository pattern
 */
export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(criteria?: any): Promise<T[]>;
  save(entity: T): Promise<T>;
  update(id: string, entity: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
}

/**
 * Base criteria for filtering
 */
export interface ICriteria {
  where?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
  include?: string[];
}

/**
 * Pagination result
 */
export interface IPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
