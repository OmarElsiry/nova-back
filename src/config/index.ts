import { config } from 'dotenv';

config();

export const env = {
  port: parseInt(process.env.PORT || '5001'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'file:./data/nova.db',

  // TON
  websiteWallet: process.env.WEBSITE_WALLET || 'UQDrY5iulWs_MyWTP9JSGedWBzlbeRmhCBoqsSaNiSLOs315',
  tonApiKey: process.env.TON_API_KEY,
  tonRpcPrimary: process.env.TON_RPC_PRIMARY || 'https://ton.access.orbs.network/v2/mainnet',
  tonRpcFallback: process.env.TON_RPC_FALLBACK || 'https://ton.api.onfinality.io/rpc?apikey=3b2dcae8-fae2-45b3-864e-c8c2a7ef57ca',
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '10000'),

  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramApiId: parseInt(process.env.TELEGRAM_API_ID || '26814288'),
  telegramApiHash: process.env.TELEGRAM_API_HASH,

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(','),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // External APIs
  giftsApiUrl: process.env.GIFTS_API_URL || 'http://151.241.228.83:7085',
  giftsApiAdminPassword: process.env.GIFTS_API_ADMIN_PASSWORD || 'nova_admin_2024',
};

export const isDevelopment = env.nodeEnv === 'development';
export const isProduction = env.nodeEnv === 'production';
