/**
 * Redis Cache Integration
 * Provides caching layer for improved performance
 */

import Redis from 'ioredis';
import type { ILogger } from '../logging/ILogger';
import { CircuitBreaker } from '../errors/ErrorBoundary';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number; // Default TTL in seconds
  maxRetries?: number;
  enableCircuitBreaker?: boolean;
}

export class RedisCache {
  private static instance: RedisCache;
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private logger: ILogger;
  private config: CacheConfig;
  private isConnected = false;
  private circuitBreaker?: CircuitBreaker;
  private useMemoryFallback = false;
  private memoryCache = new Map<string, { value: any; expiry: number }>();

  private constructor(logger: ILogger, config?: Partial<CacheConfig>) {
    this.logger = logger;
    this.config = {
      host: config?.host || process.env.REDIS_HOST || '127.0.0.1',
      port: config?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
      password: config?.password || process.env.REDIS_PASSWORD,
      db: config?.db || parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: config?.keyPrefix || 'nova:',
      ttl: config?.ttl || 3600, // 1 hour default
      maxRetries: config?.maxRetries || 3,
      enableCircuitBreaker: config?.enableCircuitBreaker !== false,
    };

    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(5, 30000, logger);
    }

    this.cleanupMemoryCache();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(logger: ILogger, config?: Partial<CacheConfig>): RedisCache {
    if (!RedisCache.instance) {
      RedisCache.instance = new RedisCache(logger, config);
    }
    return RedisCache.instance;
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Try to connect to Redis
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        retryStrategy: (times: number) => {
          if (times > this.config.maxRetries!) {
            this.logger.error('Redis connection failed, falling back to memory cache');
            this.useMemoryFallback = true;
            return null;
          }
          return Math.min(times * 100, 3000);
        },
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
      });

      // Set up event handlers
      this.client.on('connect', () => {
        this.logger.info('Redis connected successfully');
        this.isConnected = true;
        this.useMemoryFallback = false;
      });

      this.client.on('error', (error) => {
        this.logger.error('Redis error', error);
        this.useMemoryFallback = true;
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      // Test connection
      await this.client.ping();
      
      // Set up pub/sub clients if needed
      this.subscriber = this.client.duplicate();
      this.publisher = this.client.duplicate();
      
      this.logger.info('Redis cache initialized');
    } catch (error) {
      this.logger.warn('Redis not available, using memory cache fallback', error);
      this.useMemoryFallback = true;
      this.isConnected = false;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    if (this.publisher) {
      await this.publisher.quit();
      this.publisher = null;
    }
    this.isConnected = false;
    this.logger.info('Redis disconnected');
  }

  /**
   * Get value from cache
   */
  public async get<T>(key: string): Promise<T | null> {
    const operation = async () => {
      if (this.useMemoryFallback) {
        return this.getFromMemory<T>(key);
      }

      if (!this.client) {
        return null;
      }

      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    };

    if (this.circuitBreaker) {
      try {
        return await this.circuitBreaker.execute(operation);
      } catch {
        return this.getFromMemory<T>(key);
      }
    }

    return operation();
  }

  /**
   * Set value in cache
   */
  public async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const operation = async () => {
      if (this.useMemoryFallback) {
        return this.setInMemory(key, value, ttl);
      }

      if (!this.client) {
        return false;
      }

      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const expiry = ttl || this.config.ttl!;

      if (expiry > 0) {
        await this.client.setex(key, expiry, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      return true;
    };

    if (this.circuitBreaker) {
      try {
        return await this.circuitBreaker.execute(operation);
      } catch {
        return this.setInMemory(key, value, ttl);
      }
    }

    return operation();
  }

  /**
   * Delete value from cache
   */
  public async del(key: string | string[]): Promise<boolean> {
    const operation = async () => {
      if (this.useMemoryFallback) {
        if (Array.isArray(key)) {
          key.forEach(k => this.memoryCache.delete(k));
        } else {
          this.memoryCache.delete(key);
        }
        return true;
      }

      if (!this.client) {
        return false;
      }

      const keys = Array.isArray(key) ? key : [key];
      await this.client.del(...keys);
      return true;
    };

    if (this.circuitBreaker) {
      try {
        return await this.circuitBreaker.execute(operation);
      } catch {
        return false;
      }
    }

    return operation();
  }

  /**
   * Check if key exists
   */
  public async exists(key: string): Promise<boolean> {
    const operation = async () => {
      if (this.useMemoryFallback) {
        const item = this.memoryCache.get(key);
        return !!(item && item.expiry > Date.now());
      }

      if (!this.client) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    };

    if (this.circuitBreaker) {
      try {
        return await this.circuitBreaker.execute(operation);
      } catch {
        return false;
      }
    }

    return operation();
  }

  /**
   * Increment value
   */
  public async incr(key: string, by: number = 1): Promise<number> {
    if (this.useMemoryFallback) {
      const current = await this.getFromMemory<number>(key) || 0;
      const newValue = current + by;
      await this.setInMemory(key, newValue);
      return newValue;
    }

    if (!this.client) {
      throw new Error('Redis client not available');
    }

    if (by === 1) {
      return await this.client.incr(key);
    } else {
      return await this.client.incrby(key, by);
    }
  }

  /**
   * Get all keys matching pattern
   */
  public async keys(pattern: string): Promise<string[]> {
    if (this.useMemoryFallback) {
      const keys: string[] = [];
      const regex = new RegExp(pattern.replace('*', '.*'));
      this.memoryCache.forEach((_, key) => {
        if (regex.test(key)) {
          keys.push(key);
        }
      });
      return keys;
    }

    if (!this.client) {
      return [];
    }

    return await this.client.keys(pattern);
  }

  /**
   * Flush all cache
   */
  public async flush(): Promise<void> {
    if (this.useMemoryFallback) {
      this.memoryCache.clear();
      return;
    }

    if (this.client) {
      await this.client.flushdb();
    }
  }

  /**
   * Cache with automatic refresh
   */
  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate new value
    const value = await factory();
    
    // Store in cache
    await this.set(key, value, ttl);
    
    return value;
  }

  /**
   * Invalidate cache by pattern
   */
  public async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.keys(pattern);
    if (keys.length > 0) {
      await this.del(keys);
    }
    return keys.length;
  }

  /**
   * Memory cache fallback methods
   */
  private getFromMemory<T>(key: string): T | null {
    const item = this.memoryCache.get(key);
    if (!item || item.expiry < Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }
    return item.value as T;
  }

  private setInMemory(key: string, value: any, ttl?: number): boolean {
    const expiry = Date.now() + ((ttl || this.config.ttl!) * 1000);
    this.memoryCache.set(key, { value, expiry });
    return true;
  }

  private cleanupMemoryCache(): void {
    setInterval(() => {
      const now = Date.now();
      this.memoryCache.forEach((item, key) => {
        if (item.expiry < now) {
          this.memoryCache.delete(key);
        }
      });
    }, 60000); // Cleanup every minute
  }

  /**
   * Pub/Sub functionality
   */
  public async publish(channel: string, message: any): Promise<void> {
    if (!this.publisher) {
      this.logger.warn('Publisher not available');
      return;
    }

    const serialized = typeof message === 'string' ? message : JSON.stringify(message);
    await this.publisher.publish(channel, serialized);
  }

  public async subscribe(
    channel: string,
    handler: (message: any) => void
  ): Promise<void> {
    if (!this.subscriber) {
      this.logger.warn('Subscriber not available');
      return;
    }

    await this.subscriber.subscribe(channel);
    
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const parsed = JSON.parse(message);
          handler(parsed);
        } catch {
          handler(message);
        }
      }
    });
  }

  /**
   * Session management
   */
  public async getSession(sessionId: string): Promise<any> {
    return await this.get(`session:${sessionId}`);
  }

  public async setSession(sessionId: string, data: any, ttl: number = 86400): Promise<boolean> {
    return await this.set(`session:${sessionId}`, data, ttl);
  }

  public async destroySession(sessionId: string): Promise<boolean> {
    return await this.del(`session:${sessionId}`);
  }

  /**
   * Rate limiting support
   */
  public async checkRateLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / (window * 1000))}`;
    
    const count = await this.incr(windowKey);
    
    if (count === 1) {
      await this.client?.expire(windowKey, window);
    }
    
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: Math.ceil(now / (window * 1000)) * window
    };
  }

  /**
   * Get cache statistics
   */
  public getStats() {
    return {
      isConnected: this.isConnected,
      useMemoryFallback: this.useMemoryFallback,
      memoryCacheSize: this.memoryCache.size,
      circuitBreakerState: this.circuitBreaker?.getState(),
    };
  }
}

/**
 * Cache decorators for methods
 */
export function Cacheable(ttl: number = 3600) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cache = RedisCache.getInstance(console as any); // Need proper logger
      const key = `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      
      const cached = await cache.get(key);
      if (cached !== null) {
        return cached;
      }
      
      const result = await originalMethod.apply(this, args);
      await cache.set(key, result, ttl);
      
      return result;
    };
    
    return descriptor;
  };
}

export function CacheInvalidate(pattern: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      const cache = RedisCache.getInstance(console as any);
      await cache.invalidatePattern(pattern);
      
      return result;
    };
    
    return descriptor;
  };
}
