/**
 * Advanced Logging Middleware
 * Provides detailed request/response logging with error tracking
 */

import type { Context, Next } from 'hono';

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: Record<string, any>;
  body?: any;
  status?: number;
  error?: any;
  duration?: number;
  userAgent?: string;
  ip?: string;
}

/**
 * Generate detailed error information
 */
function formatError(error: any): object {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5) // First 5 stack lines
    };
  }
  return error;
}

/**
 * Detailed logging middleware
 */
export async function detailedLogger(c: Context, next: Next) {
  const start = Date.now();
  
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    query: Object.fromEntries(new URL(c.req.url).searchParams),
    headers: Object.fromEntries(c.req.raw.headers.entries()),
    userAgent: c.req.header('User-Agent'),
    ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown'
  };

  // Log request body if present
  if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'PATCH') {
    try {
      const contentType = c.req.header('Content-Type');
      if (contentType?.includes('application/json')) {
        logEntry.body = await c.req.json().catch(() => 'Unable to parse JSON');
      }
    } catch (e) {
      // Ignore body parsing errors
    }
  }

  // Simplified, cleaner logging
  const queryStr = Object.keys(logEntry.query).length > 0 
    ? `?${new URLSearchParams(logEntry.query).toString()}` 
    : '';
  
  console.log(`\n┌─ ${c.req.method} ${c.req.path}${queryStr}`);
  console.log(`├─ Time: ${logEntry.timestamp}`);
  console.log(`├─ User-Agent: ${logEntry.userAgent?.substring(0, 80)}...`);
  
  // Log request body for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    try {
      // Use the body from logEntry that was already parsed
      if (logEntry.body) {
        console.log('├─ Request Body:');
        console.log(`├─   ${JSON.stringify(logEntry.body)}`);
      }
    } catch (requestError) {
      console.log('├─ ⚠️  Could not read request body');
    }
  }
  
  try {
    await next();
    
    const duration = Date.now() - start;
    logEntry.duration = duration;
    logEntry.status = c.res.status;

    // Color code status
    const statusColor = c.res.status >= 400 ? '\x1b[31m' : c.res.status < 300 ? '\x1b[32m' : '\x1b[33m';
    const reset = '\x1b[0m';
    const statusEmoji = c.res.status >= 400 ? '❌' : '✅';
    
    console.log(`└─ ${statusEmoji} ${statusColor}${c.res.status}${reset} in ${duration}ms`);
    
    // Log complete response body for all requests
    try {
      const responseClone = c.res.clone();
      const responseText = await responseClone.text();
      
      if (responseText) {
        console.log('\n📤 RESPONSE BODY:');
        console.log('━'.repeat(50));
        
        try {
          // Try to parse and pretty-print JSON
          const jsonResponse = JSON.parse(responseText);
          console.log(JSON.stringify(jsonResponse, null, 2));
        } catch {
          // If not JSON, print as text
          console.log(responseText);
        }
        
        console.log('━'.repeat(50));
      }
    } catch (responseError) {
      console.log('⚠️  Could not read response body:', responseError instanceof Error ? responseError.message : 'Unknown error');
    }
    
    // Log error details for 4xx and 5xx responses
    if (c.res.status >= 400) {
      console.log(`   └─ Error: ${c.res.status === 404 ? 'Resource not found' : 'Request failed'}`);
      
      // Enhanced error logging for debugging "Failed to fetch" issues
      console.log('\n🚨 ERROR ANALYSIS:');
      console.log('━'.repeat(60));
      console.log(`❌ Status: ${c.res.status} ${c.res.statusText || ''}`);
      console.log(`🔗 URL: ${c.req.method} ${c.req.path}`);
      console.log(`📋 Query: ${JSON.stringify(Object.fromEntries(new URL(c.req.url).searchParams))}`);
      console.log(`🕐 Time: ${new Date().toISOString()}`);
      console.log(`🌐 User-Agent: ${c.req.header('User-Agent')?.substring(0, 80)}...`);
      
      if (c.res.status === 404) {
        console.log('\n💡err 404');
          }
      
      console.log('━'.repeat(60));
    }
  } catch (error) {
    const duration = Date.now() - start;
    logEntry.duration = duration;
    logEntry.status = 500;
    logEntry.error = formatError(error);
    
    console.error('\n❌ ERROR DETAILS:', JSON.stringify({
      ...logEntry,
      headers: {
        'content-type': logEntry.headers['content-type'],
        'user-agent': logEntry.headers['user-agent']
      }
    }, null, 2));
    
    throw error;
  }
}

/**
 * Create a formatted error response with full details
 */
export function createDetailedError(
  title: string,
  message: string,
  code: string,
  request: {
    method: string;
    path: string;
    headers?: Record<string, any>;
    body?: any;
  },
  status: number = 500
) {
  const errorDetails = {
    error: {
      title,
      message,
      code,
      timestamp: new Date().toISOString()
    },
    request: {
      method: request.method,
      path: request.path,
      headers: request.headers || {},
      body: request.body
    },
    response: {
      status,
      statusText: status === 404 ? 'NOT FOUND' : status === 500 ? 'INTERNAL SERVER ERROR' : 'ERROR'
    },
    debug: {
      stack: new Error().stack?.split('\n').slice(2, 7), // Get call stack
      environment: process.env.NODE_ENV || 'development'
    }
  };

  // Log to console for server-side debugging
  console.error('\n🚨 DETAILED ERROR:', JSON.stringify(errorDetails, null, 2));
  
  return errorDetails;
}
