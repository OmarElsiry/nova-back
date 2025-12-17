/**
 * Cache service interface for abstracted caching
 */
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  flush(): Promise<void>;
  exists(key: string): Promise<boolean>;
  ttl(key: string): Promise<number>;
}
