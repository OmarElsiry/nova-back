// Centralized API endpoints configuration
export const API_ENDPOINTS = {
  // External APIs
  telegram: {
    base: 'https://api.telegram.org',
    getChatMember: '/getChatMember',
    getChatAdministrators: '/getChatAdministrators',
    getChat: '/getChat',
    sendMessage: '/sendMessage',
  },

  ton: {
    base: 'https://tonapi.io',
    accounts: '/v2/accounts',
    transactions: '/v2/blockchain/accounts/:address/transactions',
    jettons: '/v2/accounts/:address/jettons',
    nft: '/v2/accounts/:address/nfts',
  },

  gifts: {
    base: process.env.GIFTS_API_URL || 'https://channelsseller.site/api',
    userGifts: '/user/:username/nfts',
    giftDetails: '/v1/gift/:giftId',
    categories: '/v1/categories',
  },

  // Internal API routes
  internal: {
    health: '/health',
    status: '/api/status',
    info: '/api/info',

    // User routes
    users: '/api/users',
    userProfile: '/api/users/:id',
    userAuth: '/api/users/auth',

    // Channel routes
    channels: '/api/channels',
    channelDetails: '/api/channels/:id',
    channelVerify: '/api/channels/verify',
    channelListing: '/api/channels/listing',

    // Marketplace routes
    marketplace: '/api/marketplace',
    marketplacePurchase: '/api/marketplace/purchase',
    marketplaceStats: '/api/marketplace/stats',

    // Transaction routes
    deposits: '/api/deposits',
    withdrawals: '/api/withdrawals',
    balance: '/api/balance',

    // Gift routes
    gifts: '/api/gifts',
    giftTransfer: '/api/gifts/transfer',
  }
} as const;

// API configuration
export const API_CONFIG = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  maxPayloadSize: 5 * 1024 * 1024, // 5MB
  rateLimits: {
    default: { requests: 100, windowMs: 60000 }, // 100 req/min
    auth: { requests: 5, windowMs: 60000 }, // 5 req/min
    heavy: { requests: 10, windowMs: 60000 }, // 10 req/min
  }
} as const;
