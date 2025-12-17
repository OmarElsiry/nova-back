import type { Context, Next } from 'hono';

/**
 * Prometheus metrics for monitoring application performance
 * Implements RED method (Rate, Errors, Duration)
 */
export class PrometheusMetrics {
  private readonly metrics = {
    httpRequestDuration: new Map<string, number[]>(),
    httpRequestTotal: new Map<string, number>(),
    httpRequestErrors: new Map<string, number>(),
    activeConnections: 0,
    cacheHits: 0,
    cacheMisses: 0,
    dbQueries: 0,
    dbErrors: 0,
  };

  /**
   * Middleware to collect HTTP metrics
   */
  middleware() {
    return async (c: Context, next: Next) => {
      const start = Date.now();
      const method = c.req.method;
      const path = this.normalizePath(c.req.path);
      const key = `${method}_${path}`;

      // Increment active connections
      this.metrics.activeConnections++;

      try {
        await next();
        
        // Record successful request
        this.recordRequest(key, Date.now() - start, c.res.status);
      } catch (error) {
        // Record error
        this.recordError(key, Date.now() - start);
        throw error;
      } finally {
        // Decrement active connections
        this.metrics.activeConnections--;
      }
    };
  }

  /**
   * Record successful request
   */
  private recordRequest(key: string, duration: number, status: number) {
    // Update request count
    const count = this.metrics.httpRequestTotal.get(key) || 0;
    this.metrics.httpRequestTotal.set(key, count + 1);

    // Update duration histogram
    const durations = this.metrics.httpRequestDuration.get(key) || [];
    durations.push(duration);
    this.metrics.httpRequestDuration.set(key, durations);

    // Record error if status >= 400
    if (status >= 400) {
      const errors = this.metrics.httpRequestErrors.get(key) || 0;
      this.metrics.httpRequestErrors.set(key, errors + 1);
    }
  }

  /**
   * Record error request
   */
  private recordError(key: string, duration: number) {
    this.recordRequest(key, duration, 500);
  }

  /**
   * Normalize path for metrics (remove IDs)
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[A-Za-z0-9_-]+$/g, '/:param');
  }

  /**
   * Record cache hit
   */
  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  /**
   * Record database query
   */
  recordDbQuery(success: boolean = true) {
    this.metrics.dbQueries++;
    if (!success) {
      this.metrics.dbErrors++;
    }
  }

  /**
   * Get metrics in Prometheus format
   */
  getMetrics(): string {
    const lines: string[] = [];

    // HTTP request total
    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, value] of this.metrics.httpRequestTotal) {
      const [method, path] = key.split('_');
      lines.push(`http_requests_total{method="${method}",path="${path}"} ${value}`);
    }

    // HTTP request duration
    lines.push('# HELP http_request_duration_ms HTTP request duration in milliseconds');
    lines.push('# TYPE http_request_duration_ms histogram');
    for (const [key, durations] of this.metrics.httpRequestDuration) {
      const [method, path] = key.split('_');
      const sorted = durations.sort((a, b) => a - b);
      const p50 = this.percentile(sorted, 0.5);
      const p95 = this.percentile(sorted, 0.95);
      const p99 = this.percentile(sorted, 0.99);
      const sum = sorted.reduce((a, b) => a + b, 0);
      
      lines.push(`http_request_duration_ms{method="${method}",path="${path}",quantile="0.5"} ${p50}`);
      lines.push(`http_request_duration_ms{method="${method}",path="${path}",quantile="0.95"} ${p95}`);
      lines.push(`http_request_duration_ms{method="${method}",path="${path}",quantile="0.99"} ${p99}`);
      lines.push(`http_request_duration_ms_sum{method="${method}",path="${path}"} ${sum}`);
      lines.push(`http_request_duration_ms_count{method="${method}",path="${path}"} ${sorted.length}`);
    }

    // HTTP errors
    lines.push('# HELP http_requests_errors_total Total number of HTTP errors');
    lines.push('# TYPE http_requests_errors_total counter');
    for (const [key, value] of this.metrics.httpRequestErrors) {
      const [method, path] = key.split('_');
      lines.push(`http_requests_errors_total{method="${method}",path="${path}"} ${value}`);
    }

    // Active connections
    lines.push('# HELP active_connections Number of active connections');
    lines.push('# TYPE active_connections gauge');
    lines.push(`active_connections ${this.metrics.activeConnections}`);

    // Cache metrics
    lines.push('# HELP cache_hits_total Total number of cache hits');
    lines.push('# TYPE cache_hits_total counter');
    lines.push(`cache_hits_total ${this.metrics.cacheHits}`);

    lines.push('# HELP cache_misses_total Total number of cache misses');
    lines.push('# TYPE cache_misses_total counter');
    lines.push(`cache_misses_total ${this.metrics.cacheMisses}`);

    // Database metrics
    lines.push('# HELP db_queries_total Total number of database queries');
    lines.push('# TYPE db_queries_total counter');
    lines.push(`db_queries_total ${this.metrics.dbQueries}`);

    lines.push('# HELP db_errors_total Total number of database errors');
    lines.push('# TYPE db_errors_total counter');
    lines.push(`db_errors_total ${this.metrics.dbErrors}`);

    // Cache hit ratio
    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheRatio = cacheTotal > 0 ? this.metrics.cacheHits / cacheTotal : 0;
    lines.push('# HELP cache_hit_ratio Cache hit ratio');
    lines.push('# TYPE cache_hit_ratio gauge');
    lines.push(`cache_hit_ratio ${cacheRatio.toFixed(4)}`);

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON
   */
  getMetricsJson() {
    const httpMetrics: any[] = [];
    
    for (const [key, value] of this.metrics.httpRequestTotal) {
      const [method, path] = key.split('_');
      const durations = this.metrics.httpRequestDuration.get(key) || [];
      const errors = this.metrics.httpRequestErrors.get(key) || 0;
      const sorted = durations.sort((a, b) => a - b);
      
      httpMetrics.push({
        method,
        path,
        count: value,
        errors,
        errorRate: value > 0 ? (errors / value * 100).toFixed(2) + '%' : '0%',
        duration: {
          p50: this.percentile(sorted, 0.5),
          p95: this.percentile(sorted, 0.95),
          p99: this.percentile(sorted, 0.99),
          avg: sorted.length > 0 
            ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
            : 0,
        }
      });
    }

    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    
    return {
      http: {
        requests: httpMetrics,
        activeConnections: this.metrics.activeConnections,
      },
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        total: cacheTotal,
        hitRatio: cacheTotal > 0 
          ? (this.metrics.cacheHits / cacheTotal * 100).toFixed(2) + '%'
          : '0%',
      },
      database: {
        queries: this.metrics.dbQueries,
        errors: this.metrics.dbErrors,
        errorRate: this.metrics.dbQueries > 0
          ? (this.metrics.dbErrors / this.metrics.dbQueries * 100).toFixed(2) + '%'
          : '0%',
      }
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.httpRequestDuration.clear();
    this.metrics.httpRequestTotal.clear();
    this.metrics.httpRequestErrors.clear();
    this.metrics.activeConnections = 0;
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
    this.metrics.dbQueries = 0;
    this.metrics.dbErrors = 0;
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    const boundedIndex = Math.max(0, Math.min(index, sorted.length - 1));
    return sorted[boundedIndex] ?? 0;
  }
}

/**
 * Global metrics instance
 */
export const metrics = new PrometheusMetrics();

/**
 * Metrics endpoint handler
 */
export function metricsHandler(format: 'prometheus' | 'json' = 'prometheus') {
  return (c: Context) => {
    if (format === 'json') {
      return c.json(metrics.getMetricsJson());
    }
    
    return c.text(metrics.getMetrics(), 200, {
      'Content-Type': 'text/plain; version=0.0.4',
    });
  };
}
