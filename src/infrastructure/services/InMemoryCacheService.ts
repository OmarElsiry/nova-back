import type { ICacheService } from './ICacheService';

interface CacheItem<T> {
  value: T;
  expiry: number;
}

/**
 * In-memory cache implementation with TTL support
 */
export class InMemoryCacheService implements ICacheService {
  private cache: Map<string, CacheItem<any>> = new Map();
  private readonly defaultTTL = 300; // 5 minutes in seconds

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const ttlMs = (ttl || this.defaultTTL) * 1000;
    const expiry = Date.now() + ttlMs;
    
    this.cache.set(key, {
      value,
      expiry
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async flush(): Promise<void> {
    this.cache.clear();
  }

  async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async ttl(key: string): Promise<number> {
    const item = this.cache.get(key);
    
    if (!item) {
      return -2; // Key doesn't exist
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return -2; // Key expired
    }

    const remainingMs = item.expiry - Date.now();
    return Math.floor(remainingMs / 1000);
  }

  /**
   * Cleanup expired items periodically
   */
  startCleanup(intervalMs: number = 60000): void {
    setInterval(() => {
      for (const [key, item] of this.cache.entries()) {
        if (Date.now() > item.expiry) {
          this.cache.delete(key);
        }
      }
    }, intervalMs);
  }
}
