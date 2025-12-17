import fetch from 'node-fetch';
import { API_CONFIG } from '../../config/api-endpoints';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
}

export interface RequestResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export class NetworkRequestService {
  private readonly defaultTimeout = API_CONFIG.timeout;
  private readonly maxRetries = API_CONFIG.retryAttempts;

  async request<T = any>(
    url: string,
    options: RequestOptions = {}
  ): Promise<RequestResult<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      retries = this.maxRetries
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json() as T;

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          status: response.status
        };
      }

      return {
        success: true,
        data,
        status: response.status
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout'
        };
      }

      // Retry logic
      if (retries > 0) {
        await this.delay(1000); // Wait 1 second before retry
        return this.request(url, { ...options, retries: retries - 1 });
      }

      return {
        success: false,
        error: error.message || 'Network request failed'
      };
    }
  }

  async get<T = any>(url: string, headers?: Record<string, string>): Promise<RequestResult<T>> {
    return this.request<T>(url, { method: 'GET', headers });
  }

  async post<T = any>(
    url: string,
    body: any,
    headers?: Record<string, string>
  ): Promise<RequestResult<T>> {
    return this.request<T>(url, { method: 'POST', body, headers });
  }

  async put<T = any>(
    url: string,
    body: any,
    headers?: Record<string, string>
  ): Promise<RequestResult<T>> {
    return this.request<T>(url, { method: 'PUT', body, headers });
  }

  async delete<T = any>(
    url: string,
    headers?: Record<string, string>
  ): Promise<RequestResult<T>> {
    return this.request<T>(url, { method: 'DELETE', headers });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
