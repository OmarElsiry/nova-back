/**
 * Hono Type Definitions
 * Extends Hono's context to support our service container
 */

import type { PrismaClient } from '@prisma/client';
import type { AuditLogger } from '../infrastructure/logging/audit-logger';

interface ServiceContainer {
  prisma: PrismaClient;
  auditLogger: AuditLogger;
  withdrawalService: any; // Type would come from actual service
  rpcService: any; // Type would come from actual service
  logger: any; // Type would come from actual logger
}

declare module 'hono' {
  interface ContextVariableMap {
    // Service container
    container: ServiceContainer;
    services: ServiceContainer;
    
    // Telegram Authentication
    telegramId: string;
    telegramUser: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    initData: string;
    
    // Request metadata
    requestId: string;
    ipAddress: string;
    userAgent: string;
    
    // Validation
    validated: any; // Result from request validation middleware
  }
}

export {};
