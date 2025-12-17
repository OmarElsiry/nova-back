/**
 * Error Logger Middleware
 * Logs only failed requests (4xx, 5xx) to a text file
 */

import type { Context, Next } from 'hono';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOG_DIR = join(process.cwd(), 'logs');
const ERROR_LOG_FILE = join(LOG_DIR, 'errors.log');

// Ensure logs directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Format error log entry
 */
function formatErrorLog(
  method: string,
  path: string,
  status: number,
  requestBody: any,
  responseBody: any,
  error?: any
): string {
  const timestamp = new Date().toISOString();
  const separator = '='.repeat(80);

  let log = `\n${separator}\n`;
  log += `[${timestamp}] ERROR ${status}\n`;
  log += `${method} ${path}\n`;
  log += `${separator}\n`;

  // Request details
  if (requestBody && Object.keys(requestBody).length > 0) {
    log += `\n📤 REQUEST BODY:\n`;
    log += JSON.stringify(requestBody, null, 2);
    log += `\n`;
  }

  // Response details
  log += `\n📥 RESPONSE (Status: ${status}):\n`;
  log += JSON.stringify(responseBody, null, 2);
  log += `\n`;

  // Stack trace if available
  if (error && error.stack) {
    log += `\n🔥 ERROR STACK:\n`;
    log += error.stack;
    log += `\n`;
  }

  log += `${separator}\n`;

  return log;
}

/**
 * Error logging middleware
 * Captures responses with status >= 400 and logs them to file
 */
export const errorLogger = async (c: Context, next: Next) => {
  const startTime = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // Capture request body for POST/PUT/PATCH
  let requestBody: any = {};
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      // Clone the request to read body without consuming it
      const clonedReq = c.req.raw.clone();
      const text = await clonedReq.text();
      if (text) {
        requestBody = JSON.parse(text);
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  await next();

  const status = c.res.status;
  const duration = Date.now() - startTime;

  // Only log errors (status >= 400)
  if (status >= 400) {
    try {
      // Clone response to read body
      const clonedRes = c.res.clone();
      const responseText = await clonedRes.text();
      let responseBody: any = {};

      try {
        responseBody = JSON.parse(responseText);
      } catch (e) {
        responseBody = { raw: responseText };
      }

      // Format and write to log file
      const logEntry = formatErrorLog(
        method,
        path,
        status,
        requestBody,
        responseBody
      );

      appendFileSync(ERROR_LOG_FILE, logEntry, 'utf8');

      // Also log to console with minimal info
      console.error(`❌ [${status}] ${method} ${path} (${duration}ms) - Logged to ${ERROR_LOG_FILE}`);

    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }
};
