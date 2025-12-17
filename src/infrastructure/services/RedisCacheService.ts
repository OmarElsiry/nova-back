import type { ICacheService } from './ICacheService';

/**
 * Redis cache service implementation
 * Provides distributed caching with TTL support
 */
export class RedisCacheService implements ICacheService {
  private client: any; // Will be replaced with actual Redis client type
  private readonly defaultTTL = 300; // 5 minutes in seconds
  private isConnected = false;

  constructor(
    private readonly config: {
      host?: string;
      port?: number;
      password?: string;
      db?: number;
      keyPrefix?: string;
      maxRetries?: number;
      retryDelay?: number;
      enableOfflineQueue?: boolean;
    } = {}
  ) {
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    try {
      // Redis client initialization would go here
      // For now, we'll use a mock implementation that can be replaced
      // with actual Redis client (ioredis or redis package)
      
      // Example with ioredis:
      // const Redis = require('ioredis');
      // this.client = new Redis({
      //   host: this.config.host || process.env.REDIS_HOST || '127.0.0.1',
      //   port: this.config.port || 6379,
      //   password: this.config.password,
      //   db: this.config.db || 0,
      //   keyPrefix: this.config.keyPrefix || 'nova:',
      //   maxRetriesPerRequest: this.config.maxRetries || 3,
      //   retryStrategy: (times: number) => Math.min(times * (this.config.retryDelay || 50), 2000),
      //   enableOfflineQueue: this.config.enableOfflineQueue ?? true
      // });

      // For now, create a mock client that falls back to Map
      this.client = new MockRedisClient(this.config.keyPrefix || 'nova:');
      
      this.isConnected = true;
      console.log('Redis cache service initialized (using mock implementation)');
    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) return null;
      
      const value = await this.client.get(key);
      
      if (!value) return null;
      
      try {
        return JSON.parse(value) as T;
      } catch {
        // If it's not JSON, return as string
        return value as T;
      }
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      if (!this.isConnected) return;
      
      const serialized = typeof value === 'string' 
        ? value 
        : JSON.stringify(value);
      
      const ttlSeconds = ttl || this.defaultTTL;
      
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      // Fail silently for cache writes
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error(`Redis DELETE error for key ${key}:`, error);
      return false;
    }
  }

  async flush(): Promise<void> {
    try {
      if (!this.isConnected) return;
      
      // Use FLUSHDB to clear current database
      await this.client.flushdb();
    } catch (error) {
      console.error('Redis FLUSH error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (!this.isConnected) return -2;
      
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Redis TTL error for key ${key}:`, error);
      return -2; // Key doesn't exist
    }
  }

  /**
   * Batch get multiple keys
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (!this.isConnected || keys.length === 0) {
        return keys.map(() => null);
      }
      
      const values = await this.client.mget(...keys);
      
      return values.map((value: string | null) => {
        if (!value) return null;
        
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      console.error('Redis MGET error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Batch set multiple key-value pairs
   */
  async mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      if (!this.isConnected || items.length === 0) return;
      
      // Use pipeline for atomic batch operations
      const pipeline = this.client.pipeline();
      
      for (const item of items) {
        const serialized = typeof item.value === 'string'
          ? item.value
          : JSON.stringify(item.value);
        
        const ttl = item.ttl || this.defaultTTL;
        pipeline.set(item.key, serialized, 'EX', ttl);
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Redis MSET error:', error);
    }
  }

  /**
   * Increment a counter
   */
  async incr(key: string, amount: number = 1): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      
      if (amount === 1) {
        return await this.client.incr(key);
      } else {
        return await this.client.incrby(key, amount);
      }
    } catch (error) {
      console.error(`Redis INCR error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Decrement a counter
   */
  async decr(key: string, amount: number = 1): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      
      if (amount === 1) {
        return await this.client.decr(key);
      } else {
        return await this.client.decrby(key, amount);
      }
    } catch (error) {
      console.error(`Redis DECR error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
        this.isConnected = false;
      }
    } catch (error) {
      console.error('Redis disconnect error:', error);
    }
  }
}

/**
 * Mock Redis client for development/testing
 * Implements Redis-like interface using Map
 */
class MockRedisClient {
  private store: Map<string, { value: string; expiry?: number }> = new Map();
  
  constructor(private keyPrefix: string = '') {}

  async get(key: string): Promise<string | null> {
    const fullKey = this.keyPrefix + key;
    const item = this.store.get(fullKey);
    
    if (!item) return null;
    
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(fullKey);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: string, _mode: string, ttl: number): Promise<void> {
    const fullKey = this.keyPrefix + key;
    const expiry = ttl > 0 ? Date.now() + ttl * 1000 : undefined;
    
    this.store.set(fullKey, { value, expiry });
  }

  async del(key: string): Promise<number> {
    const fullKey = this.keyPrefix + key;
    return this.store.delete(fullKey) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    const fullKey = this.keyPrefix + key;
    const item = this.store.get(fullKey);
    
    if (!item) return 0;
    
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(fullKey);
      return 0;
    }
    
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const fullKey = this.keyPrefix + key;
    const item = this.store.get(fullKey);
    
    if (!item) return -2;
    if (!item.expiry) return -1;
    
    const remaining = Math.floor((item.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map(key => this.get(key)));
  }

  pipeline() {
    const operations: Array<() => Promise<any>> = [];
    
    return {
      set: (key: string, value: string, mode: string, ttl: number) => {
        operations.push(() => this.set(key, value, mode, ttl));
        return this;
      },
      exec: async () => {
        return Promise.all(operations.map(op => op()));
      }
    };
  }

  async incr(key: string): Promise<number> {
    const value = await this.get(key);
    const num = parseInt(value || '0', 10) + 1;
    await this.set(key, num.toString(), 'EX', 0);
    return num;
  }

  async incrby(key: string, amount: number): Promise<number> {
    const value = await this.get(key);
    const num = parseInt(value || '0', 10) + amount;
    await this.set(key, num.toString(), 'EX', 0);
    return num;
  }

  async decr(key: string): Promise<number> {
    const value = await this.get(key);
    const num = parseInt(value || '0', 10) - 1;
    await this.set(key, num.toString(), 'EX', 0);
    return num;
  }

  async decrby(key: string, amount: number): Promise<number> {
    const value = await this.get(key);
    const num = parseInt(value || '0', 10) - amount;
    await this.set(key, num.toString(), 'EX', 0);
    return num;
  }

  async flushdb(): Promise<void> {
    this.store.clear();
  }

  async quit(): Promise<void> {
    // No-op for mock client
  }
}
