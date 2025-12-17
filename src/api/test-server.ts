/**
 * Test Server for Nova API
 * Lightweight server for E2E testing without external dependencies
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { logger } from 'hono/logger';

const app = new Hono();

// Middleware
app.use('*', secureHeaders());
app.use('*', cors({
  origin: '*',
  credentials: true,
}));
app.use('*', logger());

// ==========================================
// Health Check
// ==========================================

app.get('/api/health', (c) => {
  return c.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      database: 'connected',
      rpc: 'ready'
    }
  });
});

app.get('/system/health', (c) => {
  return c.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// Auth Endpoints (Mock)
// ==========================================

app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    
    // Validate required fields
    if (!body || typeof body !== 'object') {
      return c.json({
        success: false,
        error: 'Invalid request body',
        message: 'Request body must be valid JSON'
      }, 400);
    }
    
    // Validate telegram_id is a number
    if (body.telegram_id && isNaN(Number(body.telegram_id))) {
      return c.json({
        success: false,
        error: 'Invalid telegram_id',
        message: 'telegram_id must be a number'
      }, 422);
    }
    
    return c.json({
      success: true,
      data: {
        id: 1,
        email: body.email,
        token: 'mock-token-' + Math.random().toString(36).substr(2, 9)
      }
    });
  } catch (err) {
    return c.json({
      success: false,
      error: 'Invalid request',
      message: 'Malformed JSON'
    }, 400);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    
    if (!body || typeof body !== 'object') {
      return c.json({
        success: false,
        error: 'Invalid request body',
        message: 'Request body must be valid JSON'
      }, 400);
    }
    
    // Validate required fields
    if (!body.email || !body.password) {
      return c.json({
        success: false,
        error: 'Missing credentials',
        message: 'Email and password are required'
      }, 400);
    }
    
    return c.json({
      success: true,
      data: {
        id: 1,
        email: body.email,
        token: 'mock-token-' + Math.random().toString(36).substr(2, 9)
      }
    });
  } catch (err) {
    return c.json({
      success: false,
      error: 'Invalid request',
      message: 'Malformed JSON'
    }, 400);
  }
});

// ==========================================
// User Endpoints (Mock)
// ==========================================

app.post('/api/users/create', async (c) => {
  const body = await c.req.json();
  return c.json({
    success: true,
    data: {
      id: 1,
      telegramId: body.telegram_id,
      walletAddress: body.wallet_address,
      createdAt: new Date().toISOString()
    }
  });
});

app.get('/api/users/profile', (c) => {
  // Check for authentication header
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({
      success: false,
      error: 'Authentication required'
    }, 401);
  }
  
  // Validate token format
  if (!authHeader.startsWith('Bearer ') || authHeader === 'Bearer invalid_token') {
    return c.json({
      success: false,
      error: 'Invalid token'
    }, 401);
  }
  
  return c.json({
    success: true,
    data: {
      id: 1,
      telegramId: 123456789,
      walletAddress: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
      balance: '1000000000',
      createdAt: new Date().toISOString()
    }
  });
});

app.get('/api/users/profile/:id', (c) => {
  const id = c.req.param('id');
  return c.json({
    success: true,
    data: {
      id: parseInt(id) || 1,
      telegramId: 123456789,
      walletAddress: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
      balance: '1000000000',
      createdAt: new Date().toISOString()
    }
  });
});

// ==========================================
// Balance Endpoints (Mock)
// ==========================================

app.get('/api/balance/wallet/:address', (c) => {
  const address = c.req.param('address');
  
  // Validate address format (basic check)
  if (!address || address.length < 10 || address === 'invalid-address') {
    return c.json({
      success: false,
      error: 'Invalid address format'
    }, 400);
  }
  
  return c.json({
    address: address,
    balance: '1000000000',
    currency: 'TON',
    lastUpdated: new Date().toISOString()
  });
});

app.post('/api/balance/refresh/wallet/:address', async (c) => {
  const address = c.req.param('address');
  return c.json({
    success: true,
    data: {
      address: address,
      balance: '1000000000',
      refreshedAt: new Date().toISOString()
    }
  });
});

// ==========================================
// Marketplace Endpoints (Mock)
// ==========================================

app.get('/api/marketplace/listings', (c) => {
  return c.json({
    success: true,
    data: {
      listings: [
        {
          id: '1',
          name: 'Channel 1',
          price: '1000000000',
          description: 'Test channel'
        }
      ],
      total: 1,
      page: 1,
      limit: 10
    }
  });
});

app.post('/api/marketplace/purchase', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    
    // Check for authentication header
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({
        success: false,
        error: 'Authentication required'
      }, 401);
    }
    
    if (!body || typeof body !== 'object') {
      return c.json({
        success: false,
        error: 'Invalid request body'
      }, 400);
    }
    
    return c.json({
      success: true,
      data: {
        transactionId: 'tx-' + Math.random().toString(36).substr(2, 9),
        status: 'completed'
      }
    });
  } catch (err) {
    return c.json({
      success: false,
      error: 'Invalid request'
    }, 400);
  }
});

// ==========================================
// Channel Endpoints (Mock)
// ==========================================

app.get('/api/channels', (c) => {
  return c.json({
    success: true,
    data: {
      channels: [
        {
          id: '1',
          name: 'Test Channel',
          description: 'A test channel'
        }
      ],
      total: 1
    }
  });
});

app.post('/api/channels/create', async (c) => {
  const body = await c.req.json();
  return c.json({
    success: true,
    data: {
      id: '1',
      name: body.name,
      createdAt: new Date().toISOString()
    }
  });
});

// ==========================================
// Gift Endpoints (Mock)
// ==========================================

app.get('/api/gifts/:username', (c) => {
  const username = c.req.param('username');
  return c.json({
    username: username,
    gifts: [],
    total: 0
  });
});

app.get('/api/gifts/user/:userId', (c) => {
  const userId = c.req.param('userId');
  return c.json({
    userId: userId,
    gifts: [],
    total: 0
  });
});

app.post('/api/gifts/send', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    
    if (!body || typeof body !== 'object') {
      return c.json({
        success: false,
        error: 'Invalid request body'
      }, 400);
    }
    
    return c.json({
      success: true,
      data: {
        transactionId: 'gift-' + Math.random().toString(36).substr(2, 9),
        status: 'sent'
      }
    });
  } catch (err) {
    return c.json({
      success: false,
      error: 'Invalid request'
    }, 400);
  }
});

// ==========================================
// Transaction Endpoints (Mock)
// ==========================================

app.get('/api/transactions', (c) => {
  return c.json({
    success: true,
    data: {
      transactions: [],
      total: 0
    }
  });
});

app.post('/api/transactions/deposit', async (c) => {
  const body = await c.req.json();
  return c.json({
    success: true,
    data: {
      transactionId: 'dep-' + Math.random().toString(36).substr(2, 9),
      amount: body.amount,
      status: 'confirmed'
    }
  });
});

app.post('/api/transactions/withdraw', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    
    if (!body || typeof body !== 'object') {
      return c.json({
        success: false,
        error: 'Invalid request body'
      }, 400);
    }
    
    // Validate required fields
    if (!body.user_id || !body.amount || !body.destination_address) {
      return c.json({
        success: false,
        error: 'Missing required fields',
        required: ['user_id', 'amount', 'destination_address']
      }, 400);
    }
    
    return c.json({
      success: true,
      data: {
        transactionId: 'wth-' + Math.random().toString(36).substr(2, 9),
        amount: body.amount,
        destination: body.destination_address,
        status: 'pending'
      }
    }, 201);
  } catch (err) {
    return c.json({
      success: false,
      error: 'Invalid request'
    }, 400);
  }
});

// ==========================================
// Error Handling
// ==========================================

app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Endpoint not found',
    path: c.req.path
  }, 404);
});

app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    success: false,
    error: err.message || 'Internal server error'
  }, 500);
});

// ==========================================
// Server Start
// ==========================================

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

console.log(`
╔══════════════════════════════════════════╗
║     Nova Test API Server Started         ║
║                                          ║
║  Host: ${HOST}                      ║
║  Port: ${PORT}                           ║
║  URL: http://${HOST}:${PORT}              ║
║                                          ║
║  Ready for E2E Testing                   ║
╚══════════════════════════════════════════╝
`);

export default app;
