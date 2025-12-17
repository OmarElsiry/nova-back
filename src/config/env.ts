/**
 * Environment Configuration
 * Simple, direct environment variable access
 */

import 'dotenv/config';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('CRITICAL: TELEGRAM_BOT_TOKEN is missing from environment variables');
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('CRITICAL: DATABASE_URL is missing from environment variables');
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '5001'),
  HOST: process.env.HOST || '0.0.0.0',
  TELEGRAM_BOT_TOKEN,
  DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
};

export function getSafeEnvForLogging() {
  return {
    PORT: ENV.PORT,
    HOST: ENV.HOST,
    NODE_ENV: ENV.NODE_ENV,
    ALLOWED_ORIGINS: ENV.ALLOWED_ORIGINS,
    // Don't log secrets
  };
}
