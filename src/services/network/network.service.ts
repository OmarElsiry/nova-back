import { API_CONFIG, API_ENDPOINTS } from '../../config/api-endpoints';

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export class NetworkService {
  private defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  /**
   * Make an HTTP request with retry logic and timeout
   */
  async request<T = any>(
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = API_CONFIG.timeout,
      retries = API_CONFIG.retryAttempts,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: { ...this.defaultHeaders, ...headers },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json() as any;

        if (!response.ok) {
          return {
            success: false,
            error: data?.message || data?.error || `HTTP ${response.status}`,
            statusCode: response.status,
          };
        }

        return {
          success: true,
          data: data as T,
          statusCode: response.status,
        };
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries) {
          await this.delay(API_CONFIG.retryDelay * (attempt + 1));
          continue;
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Request failed',
    };
  }

  /**
   * Make a GET request
   */
  async get<T = any>(url: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'GET', headers });
  }

  /**
   * Make a POST request
   */
  async post<T = any>(
    url: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'POST', body, headers });
  }

  /**
   * Make a PUT request
   */
  async put<T = any>(
    url: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'PUT', body, headers });
  }

  /**
   * Make a DELETE request
   */
  async delete<T = any>(url: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>(url, { method: 'DELETE', headers });
  }

  /**
   * Build URL with path params
   */
  buildUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
    let url = `${baseUrl}${path}`;
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url = url.replace(`:${key}`, encodeURIComponent(value));
      });
    }
    
    return url;
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
