/**
 * Nova API Server - Production Ready
 * Implements proper dependency injection and security
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { PrismaConnection } from './src/infrastructure/database/PrismaConnection';
import { createLogger } from './src/infrastructure/logging/logger';
import { detailedLogger } from './src/api/middleware/logging.middleware';
import { createEnhancedRateLimit } from './src/api/middleware/enhanced-rate-limit.middleware';
import { secureHeaders } from 'hono/secure-headers';
import { ENV, getSafeEnvForLogging } from './src/config/env';

// Import routes
import systemRoutes from './src/api/routes/system.routes';
import authTelegramRoutes from './src/api/routes/auth-telegram.routes';
import balanceRoutes from './src/api/routes/balance.routes';
import depositRoutes from './src/api/routes/deposit.routes';
import withdrawalRoutes from './src/api/routes/withdrawal.routes';
import channelRoutes from './src/api/routes/channel.routes';
import transactionRoutes from './src/api/routes/transaction.routes';
import marketplaceRoutes from './src/api/routes/marketplace.routes';
import userRoutes from './src/api/routes/user.routes';
import giftRoutes from './src/api/routes/gift.routes';
import adminRoutes from './src/api/routes/admin.routes';
import purchaseRoutes from './src/api/routes/purchase.routes';
import listingRoutes from './src/api/routes/listing.routes';

// Import middleware
import { errorHandler } from './src/api/middleware/error.middleware';
import { requireTelegramAuth, optionalTelegramAuth } from './src/api/middleware/telegram-auth.middleware';
import { roleAuth } from './src/api/middleware/role.middleware';

const app = new Hono();

// Use validated and secure environment variables
const PORT = ENV.PORT;
const HOST = ENV.HOST;
const ALLOWED_ORIGINS = ENV.ALLOWED_ORIGINS;

// Initialize core services
const appLogger = createLogger('nova-api');
const dbConnection = PrismaConnection.getInstance(appLogger);

// Initialize database connection
await dbConnection.connect();
const prisma = dbConnection.getClient();

// Initialize and start Secure Deposit Service (Background Monitoring)
import { SecureDepositService } from './src/services/secure-deposit.service';
const secureDepositService = SecureDepositService.getInstance();
await secureDepositService.initialize();
secureDepositService.startMonitoring().catch(err => {
  appLogger.error('Failed to start Secure Deposit Service monitoring', err);
});

// Security headers with strict CSP
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", ...ALLOWED_ORIGINS],
  },
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  xXssProtection: '1; mode=block',
  referrerPolicy: 'strict-origin-when-cross-origin'
}));

// CORS with SECURE origin validation
app.use('*', cors({
  origin: (origin) => {
    // Block non-browser requests in production
    if (!origin) {
      if (ENV.NODE_ENV === 'production') {
        return null; // Reject non-browser requests in production
      }
      return '*'; // Allow in development for testing
    }

    // Strict origin checking
    if (ALLOWED_ORIGINS.includes(origin)) {
      return origin;
    }

    // Development only - with warning and localhost check
    if (ENV.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      appLogger.warn(`⚠️ Allowing development origin: ${origin}`);
      return origin;
    }

    // Log rejected origins for security monitoring
    appLogger.error(`❌ Rejected CORS origin: ${origin}`);
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Telegram-Id', 'x-telegram-id', 'X-Telegram-Init-Data', 'X-Telegram-InitData', 'x-telegram-initdata'],
  exposeHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Total-Count'],
  maxAge: 86400
}));

// Enhanced logging
app.use('*', detailedLogger);

// Enhanced rate limiting with proper production configuration
app.use('/api/*', createEnhancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for production usage
  message: 'Too many requests from this IP/user, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: (c) => {
    // Use both IP and user ID for rate limiting
    const ip = c.req.header('x-forwarded-for') ||
      c.req.header('x-real-ip') ||
      c.req.header('cf-connecting-ip') || // Cloudflare
      'unknown';
    const userId = c.get ? c.get('userId') : 'anonymous';
    return `${ip}:${userId}`;
  },
  handler: (c) => {
    appLogger.warn('Rate limit exceeded', {
      ip: c.req.header('x-forwarded-for'),
      userId: c.get ? c.get('userId') : null,
      path: c.req.path
    });
    return c.json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: 900 // seconds
    }, 429);
  }
}));

const authMiddleware = requireTelegramAuth();
const optionalAuth = optionalTelegramAuth();

app.route('/system', systemRoutes);
app.route('/auth', authTelegramRoutes);
app.route('/api/auth', authTelegramRoutes);

// Note: Some marketplace endpoints are public for browsing
// Authentication will be enforced on specific operations below

// PUBLIC endpoints that don't require authentication
// These are needed for the app to function before user logs in
app.get('/api/users/profile/:telegramId', (c, next) => next()); // Public profile viewing
app.get('/api/transactions/pending/:telegramId', (c, next) => next()); // Public pending transactions check
app.post('/api/channels/verify-with-gifts', (c, next) => next()); // Public channel verification during onboarding
app.post('/api/marketplace/purchases/:id/confirm', (c, next) => next()); // Public purchase confirmation (uses verification token)
// Authentication endpoints (must be public to allow login!)
// NEW: Proper Telegram initData validation (ONLY method)
app.post('/auth/telegram', (c, next) => next()); // Public: Telegram authentication with initData
app.post('/api/users/register-telegram', (c, next) => next()); // Public: Legacy endpoint (redirects to /auth/telegram)

// CRITICAL: Protected routes (authentication required)
// Financial operations - MUST BE PROTECTED
app.use('/api/balance/*', authMiddleware); // Protect ALL balance operations (GET, POST, etc.)
app.use('/api/deposit/*', authMiddleware);
app.use('/api/withdraw/*', authMiddleware);  // CRITICAL - FUNDS AT RISK!
app.use('/api/purchases/*', authMiddleware);  // CRITICAL - MONEY INVOLVED!

// User data operations - MUST BE PROTECTED (except public GET operations and verify-with-gifts)
// Note: /api/channels/verify-with-gifts is public, so we protect other channel POST operations individually
app.post('/api/channels/create-listing', authMiddleware);
app.post('/api/channels/update', authMiddleware);
app.post('/api/channels/add-gift', authMiddleware);
app.put('/api/channels/*', authMiddleware);
app.delete('/api/channels/*', authMiddleware);
// Transactions - only protect write operations, allow public reads
app.post('/api/transactions/*', authMiddleware);
app.put('/api/transactions/*', authMiddleware);
app.delete('/api/transactions/*', authMiddleware);
app.use('/api/listings/*', authMiddleware);
// Note: /api/users/register-telegram is public (no auth required)
// Only protect specific user endpoints that need authentication
app.post('/api/users/profile/*', authMiddleware);
app.put('/api/users/profile/*', authMiddleware);
app.delete('/api/users/profile/*', authMiddleware);
app.post('/api/users/link-wallet', authMiddleware);
app.use('/api/users/settings/*', authMiddleware);

// Protected marketplace write operations
app.post('/api/marketplace/*', authMiddleware);
app.put('/api/marketplace/*', authMiddleware);
app.delete('/api/marketplace/*', authMiddleware);

// Register routes after middleware
app.route('/api/balance', balanceRoutes);
app.route('/api/deposit', depositRoutes);
app.route('/api/withdraw', withdrawalRoutes);
app.route('/api/channels', channelRoutes);
app.route('/api/transactions', transactionRoutes);
app.route('/api/marketplace', marketplaceRoutes);
app.route('/api/listings', listingRoutes);
app.route('/api/users', userRoutes);
app.route('/api/gifts', giftRoutes);
app.route('/api/purchases', purchaseRoutes);

// Admin routes (auth required)
// Admin routes (auth required + admin role)
app.use('/api/admin/*', authMiddleware, roleAuth(['admin', 'superadmin']));
app.route('/api/admin', adminRoutes);

// Error handling
app.onError(errorHandler);

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Nova API',
    version: '1.0.0',
    status: 'operational',
    port: PORT,
    endpoints: {
      health: '/system/health',
      docs: '/system/info',
      login: '/auth/login'
    }
  });
});

// Start server with proper logging
appLogger.info('🚀 Nova API Server Starting...', {
  port: PORT,
  host: HOST,
  environment: ENV.NODE_ENV,
  url: `http://localhost:${PORT}`
});

// Log safe environment details
if (ENV.LOG_LEVEL === 'debug') {
  appLogger.debug('Environment configuration', getSafeEnvForLogging());
}

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
});

appLogger.info('✅ Nova API Server Ready!', {
  server: `http://localhost:${PORT}`,
  environment: ENV.NODE_ENV,
  authEnabled: true,
  rateLimitingEnabled: true,
  corsConfigured: true
});
