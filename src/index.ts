import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { PrismaClient } from '@prisma/client';
import { env } from './config';
import { ServiceFactory } from './services';
import { registerAPIRoutes } from './api';
import { ensureDatabase } from './utils/database';

const app = new Hono();
await ensureDatabase();

const prisma = new PrismaClient();
const services = new ServiceFactory(prisma);

// Middleware
app.use(logger());
app.use(async (c, next) => {
  const method = c.req.method;
  const url = new URL(c.req.url);
  const headers = Object.fromEntries(c.req.raw.headers.entries());
  const start = Date.now();

  let requestBody = '';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    try {
      requestBody = await c.req.text();
      c.req.raw = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
        body: requestBody
      });
    } catch (e) {
      // Body already consumed or not available
    }
  }

  const summary = {
    path: url.pathname,
    origin: headers.origin || headers.host || 'n/a',
    contentType: headers['content-type'],
    contentLength: headers['content-length']
  };

  console.log(`\n➡️  ${method} ${summary.path}`);
  console.log(`   Origin: ${summary.origin}`);
  if (summary.contentType || summary.contentLength) {
    console.log(
      `   Payload: ${summary.contentType || 'n/a'}${summary.contentLength ? `, ${summary.contentLength} bytes` : ''}`
    );
  }
  if (requestBody) {
    console.log(`   Body: ${requestBody}`);
  }

  await next();

  const status = c.res.status;
  const duration = Date.now() - start;
  console.log(`⬅️  ${status} ${method} ${summary.path} (${duration}ms)`);
  console.log('---');
});
app.use(cors({
  origin: env.corsOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Id', 'x-telegram-id', 'X-Telegram-Init-Data', 'x-telegram-init-data', 'X-Telegram-InitData', 'x-telegram-initdata']
}));

// Register all API routes
registerAPIRoutes(app, services);

// Health Check
app.get('/health', async (c) => {
  const monitorStatus = await services.getBlockchainMonitorService().getStatus();
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
    monitor: monitorStatus
  });
});

// API Status
app.get('/api/status', async (c) => {
  const [userStats, marketplaceStats] = await Promise.all([
    services.getTelegramUserService().getTelegramUserStats(),
    services.getMarketplaceService().getMarketplaceStats(),
  ]);

  return c.json({
    api: 'running',
    version: '2.0.0',
    backend: 'bun.js',
    framework: 'hono',
    database: 'sqlite',
    users: userStats.totalUsers,
    channels: marketplaceStats.totalListings,
    timestamp: new Date().toISOString()
  });
});

// API Info
app.get('/api/info', (c) => {
  return c.json({
    name: 'Nova TON Backend',
    version: '2.0.0',
    runtime: 'Bun.js',
    framework: 'Hono',
    database: 'SQLite with Prisma',
    services: {
      blockchainMonitor: 'active',
      userService: 'active',
      marketplace: 'active',
      channelVerification: 'active',
      gifts: 'active',
      withdrawal: 'active',
      telegramUser: 'active',
    },
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error Handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    error: err.message || 'Internal Server Error',
    status: 500
  }, 500);
});

// Start Server
const port = env.port;
const host = env.host;

// Start blockchain monitor (API key is optional - TON API works without it)
const monitorService = services.getBlockchainMonitorService();
monitorService.startMonitoring().catch(console.error);
console.log('🔍 Blockchain monitor started');
if (!env.tonApiKey) {
  console.log('ℹ️ TON_API_KEY not set. TON API calls will use public rate limits.');
}

console.log(`🚀 Nova TON Backend starting...`);
console.log(`📍 Server: http://${host}:${port}`);
console.log(`🗄️  Database: ${env.databaseUrl}`);
console.log(`🌍 CORS Origins: ${env.corsOrigins.join(', ')}`);
console.log(`🛠️  Services: All 7 services loaded`);

export default {
  port,
  hostname: host,
  fetch: app.fetch
};
