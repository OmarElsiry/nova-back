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
 * GET /system/metrics
 * System performance metrics
 */
app.get('/metrics', async (c) => {
  try {
    // Get database stats
    const [userCount, depositCount, withdrawalCount] = await Promise.all([
      prisma.user.count(),
      prisma.$queryRaw<{count: bigint}[]>`SELECT COUNT(*) as count FROM deposits`,
      prisma.$queryRaw<{count: bigint}[]>`SELECT COUNT(*) as count FROM withdrawals`
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
