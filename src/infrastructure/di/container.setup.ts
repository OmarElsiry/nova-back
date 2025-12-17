/**
 * DI Container Setup
 * 
 * Configures and registers all services in the dependency injection container
 */

import { DIContainer } from './DIContainer';
import { PrismaClient } from '@prisma/client';
import { ConsoleLogger } from '../logging/ConsoleLogger';
import { LoggerFactory } from '../logging/LoggerFactory';
import type { ILogger } from '../logging/ILogger';

// Repositories
import { UserRepository } from '../repositories/UserRepository';
// import { MarketplaceRepository } from '../repositories/MarketplaceRepository';

// Use Cases
import { GetUserUseCase } from '../../application/user/GetUserUseCase';
import { CreateUserUseCase } from '../../application/user/CreateUserUseCase';
import { LinkWalletUseCase } from '../../application/user/LinkWalletUseCase';
// import { GetChannelsUseCase } from '../../application/channel/GetChannelsUseCase';
import { CreatePurchaseUseCase } from '../../application/purchase/CreatePurchaseUseCase';
import { ConfirmPurchaseUseCase } from '../../application/purchase/ConfirmPurchaseUseCase';
import { RefundPurchaseUseCase } from '../../application/purchase/RefundPurchaseUseCase';

/**
 * Setup and configure the DI container
 * 
 * @returns Configured DI container
 */
export function setupContainer(): DIContainer {
  const container = new DIContainer();

  // Register Prisma Client (singleton)
  container.registerInstance('prisma', new PrismaClient());

  // Register Logger (singleton)
  const loggerFactory = LoggerFactory.getInstance();
  const logger = loggerFactory.createLogger('app');
  container.registerInstance('logger', logger);

  // Register Repositories (singleton)
  container.register('userRepository', () => {
    const prisma = container.resolve<PrismaClient>('prisma');
    return new UserRepository(prisma);
  }, true);

  //   container.register('marketplaceRepository', () => {
  //     const prisma = container.resolve<PrismaClient>('prisma');
  //     return new MarketplaceRepository(prisma);
  //   }, true);

  // Register Use Cases (transient - new instance each time)
  container.register('getUserUseCase', () => {
    const userRepository = container.resolve<any>('userRepository');
    const logger = container.resolve<ILogger>('logger');
    return new GetUserUseCase(userRepository, logger);
  }, false);

  container.register('createUserUseCase', () => {
    const userRepository = container.resolve<any>('userRepository');
    const logger = container.resolve<ILogger>('logger');
    return new CreateUserUseCase(userRepository, logger);
  }, false);

  container.register('linkWalletUseCase', () => {
    const userRepository = container.resolve<any>('userRepository');
    const logger = container.resolve<ILogger>('logger');
    return new LinkWalletUseCase(userRepository, logger);
  }, false);

  //   container.register('getChannelsUseCase', () => {
  //     const marketplaceRepository = container.resolve<any>('marketplaceRepository');
  //     const logger = container.resolve<ILogger>('logger');
  //     return new GetChannelsUseCase(marketplaceRepository, logger);
  //   }, false);

  // Note: Purchase use cases need proper implementation
  // Commenting out for now until we have the correct interfaces
  /*
  container.register('createPurchaseUseCase', () => {
    const userRepository = container.resolve<any>('userRepository');
    const marketplaceRepository = container.resolve<any>('marketplaceRepository');
    const logger = container.resolve<ILogger>('logger');
    return new CreatePurchaseUseCase(userRepository, marketplaceRepository, logger);
  }, false);

  container.register('confirmPurchaseUseCase', () => {
    const marketplaceRepository = container.resolve<any>('marketplaceRepository');
    const logger = container.resolve<ILogger>('logger');
    return new ConfirmPurchaseUseCase(marketplaceRepository, logger);
  }, false);

  container.register('refundPurchaseUseCase', () => {
    const marketplaceRepository = container.resolve<any>('marketplaceRepository');
    const logger = container.resolve<ILogger>('logger');
    return new RefundPurchaseUseCase(marketplaceRepository, logger);
  }, false);
  */

  return container;
}

/**
 * Global container instance
 */
let globalContainer: DIContainer | null = null;

/**
 * Get or create the global container
 * 
 * @returns Global DI container
 */
export function getGlobalContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = setupContainer();
  }
  return globalContainer;
}

/**
 * Reset the global container
 * Useful for testing
 */
export function resetGlobalContainer(): void {
  globalContainer = null;
}
