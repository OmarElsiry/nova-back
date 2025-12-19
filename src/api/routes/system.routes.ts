/**
 * System Routes
 * Health checks, monitoring, and system information
 */

import { Hono } from 'hono';
import { RpcService } from '../../services/rpc.service';
import { SecureDepositService } from '../../services/secure-deposit.service';
import { PrismaClient } from '@prisma/client';

const app = new Hono();
const prisma = new PrismaClient();

const API_HELP = {
  name: 'Nova API',
  version: '1.0.0',
  description: 'Nova TON Trading System API Documentation',
  auth_info: {
    type: 'initData (Telegram)',
    header: 'Authorization / X-Telegram-Init-Data',
    required_for: 'All /api/* endpoints (excluding public browsing)',
    note: 'Authentication is performed by validating the HMAC-SHA256 signature of the Telegram WebApp initData string.'
  },
  endpoints: {
    system: [
      { method: 'GET', path: '/system/health', description: 'Basic health check (Database connectivity status)' },
      { method: 'GET', path: '/system/status', description: 'Detailed status including blockchain RPC and deposit monitoring' },
      { method: 'GET', path: '/system/info', description: 'General server metadata and blockchain network info' },
      { method: 'GET', path: '/system/metrics', description: 'System performance and data metrics' },
      { method: 'GET', path: '/system/help', description: 'Complete API Documentation (This page)' }
    ],
    auth: [
      { method: 'POST', path: '/auth/telegram', description: 'Main Login: Validates initData and returns user session' },
      { method: 'POST', path: '/auth/refresh', description: 'Re-validates initData to extend or refresh session' }
    ],
    api: {
      balance: [
        { method: 'GET', path: '/api/balance', description: 'Fetch current user balance and wallet details' },
        { method: 'GET', path: '/api/balance/history', description: 'Fetch unified transaction history' },
        { method: 'POST', path: '/api/balance/refresh', description: 'Trigger manual on-chain balance sync' },
        { method: 'GET', path: '/api/balance/statistics', description: 'User-specific financial analytics' },
        { method: 'GET', path: '/api/balance/telegram/:telegramId', description: 'Public balance check by Telegram ID' }
      ],
      deposit: [
        { method: 'GET', path: '/api/deposit/address', description: 'Retrieve user-specific TON deposit address' },
        { method: 'GET', path: '/api/deposit/history', description: 'List historical deposits' },
        { method: 'GET', path: '/api/deposit/stats', description: 'Global and user-specific deposit metrics' },
        { method: 'POST', path: '/api/deposit/check', description: 'Initiate manual scan for pending deposits' }
      ],
      withdraw: [
        { method: 'POST', path: '/api/withdraw/request', description: 'Submit withdrawal request (Subject to limits)' },
        { method: 'GET', path: '/api/withdraw/history', description: 'List historical withdrawal attempts' },
        { method: 'POST', path: '/api/withdraw/cancel', description: 'Abort a pending withdrawal request' }
      ],
      marketplace: [
        { method: 'GET', path: '/api/marketplace/filter', description: 'Search and filter channel listings with metadata' },
        { method: 'GET', path: '/api/marketplace/stats', description: 'Global platform trading statistics' },
        { method: 'POST', path: '/api/marketplace/purchase', description: 'Create a purchase request for a listing' },
        { method: 'GET', path: '/api/marketplace/purchases', description: 'User-specific purchase history' }
      ],
      channels: [
        { method: 'GET', path: '/api/channels', description: 'Browse available channel listings' },
        { method: 'GET', path: '/api/channels/my-channels', description: 'List channels owned by the user (Telegram sync)' },
        { method: 'POST', path: '/api/channels/verify-with-gifts', description: 'Onboard channel via NFT/Gift verification' },
        { method: 'POST', path: '/api/channels/create-listing', description: 'List a verified channel for sale' },
        { method: 'DELETE', path: '/api/channels/delete/:id', description: 'Remove channel from user portfolio' }
      ],
      gifts: [
        { method: 'GET', path: '/api/gifts/stats', description: 'Distribution statistics of Telegram Gifts' },
        { method: 'GET', path: '/api/gifts/:username', description: 'Real-time gift fetch for specific channel' },
        { method: 'GET', path: '/api/gifts/user/:telegramId', description: 'Real-time gift fetch for specific user' }
      ],
      admin: [
        { method: 'GET', path: '/api/admin/dashboard', description: 'High-level system overview for administrators' },
        { method: 'GET', path: '/api/admin/users', description: 'User management and audit logging' },
        { method: 'POST', path: '/api/admin/withdrawals/approve/:id', description: 'Sanction a pending withdrawal' },
        { method: 'POST', path: '/api/admin/withdrawals/reject/:id', description: 'Deny a pending withdrawal with reason' }
      ]
    }
  }
};

/**
 * GET /system/health
 * Basic health check endpoint
 */
app.get('/health', async (c) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    }, 503);
  }
});

/**
 * GET /system/status
 * Detailed system status including RPC and services
 */
app.get('/status', async (c) => {
  try {
    const rpcService = RpcService.getInstance();
    const depositService = SecureDepositService.getInstance();

    const [rpcHealth, depositStats] = await Promise.all([
      rpcService.healthCheck(),
      depositService.getDepositStats()
    ]);

    return c.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'connected',
        rpc: rpcHealth,
        deposits: depositStats
      },
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal
      }
    });
  } catch (error) {
    return c.json({
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * GET /system/info
 * General system information
 */
app.get('/info', (c) => {
  return c.json({
    name: 'Nova API',
    version: '1.0.0',
    description: 'Nova TON Trading System',
    endpoints: {
      health: '/system/health',
      status: '/system/status',
      help: '/system/help',
      auth: '/auth',
      api: '/api',
      admin: '/api/admin'
    },
    blockchain: {
      network: 'TON Mainnet',
      rpc: {
        primary: 'Orbs Network',
        fallback: 'OnFinality'
      }
    }
  });
});

/**
 * GET /system/help
 * Complete API Documentation
 */
app.get('/help', (c) => {
  return c.json(API_HELP);
});

/**
 * GET /system/metrics
 * System performance metrics
 */
app.get('/metrics', async (c) => {
  try {
    // Get database stats
    const [userCount, depositCount, withdrawalCount] = await Promise.all([
      prisma.user.count(),
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM deposits`,
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM withdrawals`
    ]);

    return c.json({
      timestamp: new Date().toISOString(),
      metrics: {
        users: {
          total: userCount
        },
        deposits: {
          total: Number(depositCount[0]?.count || 0)
        },
        withdrawals: {
          total: Number(withdrawalCount[0]?.count || 0)
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      }
    });
  } catch (error) {
    return c.json({
      error: 'Failed to fetch metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;

