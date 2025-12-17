import { PrismaClient } from '@prisma/client';
import { BlockchainMonitorService } from './BlockchainMonitorService';
import { UserService } from './UserService';
import { MarketplaceService } from './MarketplaceService';
import { ChannelVerificationService } from './ChannelVerificationService';
import { GiftsService } from './GiftsService';
import { WithdrawalProcessingService as WithdrawalService } from './withdrawal/withdrawal-processing.service';
import { TelegramUserService } from './TelegramUserService';
import { PurchaseService } from './purchase.service';

export class ServiceFactory {
  private prisma: PrismaClient;
  private services: {
    blockchainMonitor?: BlockchainMonitorService;
    user?: UserService;
    marketplace?: MarketplaceService;
    channelVerification?: ChannelVerificationService;
    gifts?: GiftsService;
    withdrawal?: WithdrawalService;
    telegramUser?: TelegramUserService;
    purchase?: PurchaseService;
  } = {};

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  getBlockchainMonitorService(): BlockchainMonitorService {
    if (!this.services.blockchainMonitor) {
      this.services.blockchainMonitor = new BlockchainMonitorService(this.prisma);
    }
    return this.services.blockchainMonitor;
  }

  getUserService(): UserService {
    if (!this.services.user) {
      this.services.user = new UserService(this.prisma);
    }
    return this.services.user;
  }

  getMarketplaceService(): MarketplaceService {
    if (!this.services.marketplace) {
      this.services.marketplace = new MarketplaceService(this.prisma);
    }
    return this.services.marketplace;
  }

  getChannelVerificationService(): ChannelVerificationService {
    if (!this.services.channelVerification) {
      this.services.channelVerification = new ChannelVerificationService(this.prisma);
    }
    return this.services.channelVerification;
  }

  getGiftsService(): GiftsService {
    if (!this.services.gifts) {
      this.services.gifts = new GiftsService(this.prisma);
    }
    return this.services.gifts;
  }

  getWithdrawalService(): WithdrawalService {
    if (!this.services.withdrawal) {
      this.services.withdrawal = new WithdrawalService(this.prisma);
    }
    return this.services.withdrawal;
  }

  getTelegramUserService(): TelegramUserService {
    if (!this.services.telegramUser) {
      this.services.telegramUser = new TelegramUserService(this.prisma);
    }
    return this.services.telegramUser;
  }

  getPurchaseService(): PurchaseService {
    if (!this.services.purchase) {
      this.services.purchase = new PurchaseService(this.prisma);
    }
    return this.services.purchase;
  }

  // Convenience method to get all services
  getAllServices() {
    return {
      blockchainMonitor: this.getBlockchainMonitorService(),
      user: this.getUserService(),
      marketplace: this.getMarketplaceService(),
      channelVerification: this.getChannelVerificationService(),
      gifts: this.getGiftsService(),
      withdrawal: this.getWithdrawalService(),
      telegramUser: this.getTelegramUserService(),
      purchase: this.getPurchaseService(),
    };
  }
}

// Export all services for direct import if needed
export {
  BlockchainMonitorService,
  UserService,
  MarketplaceService,
  ChannelVerificationService,
  GiftsService,
  WithdrawalService,
  TelegramUserService,
  PurchaseService,
};
