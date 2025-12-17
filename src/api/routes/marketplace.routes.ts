import { Hono } from 'hono';
import type { Context } from 'hono';
import { PrismaClient } from '@prisma/client';
import { MarketplaceController } from '../controllers/marketplace/marketplace.controller';
import { MarketplaceListingService } from '../../services/marketplace/marketplace-listing.service';
import { MarketplacePurchaseService } from '../../services/marketplace/marketplace-purchase.service';
import { MarketplaceStatsService } from '../../services/marketplace/marketplace-stats.service';
import { MarketplaceTransactionService } from '../../services/marketplace/marketplace-transaction.service';

/**
 * Refactored Marketplace Routes
 * Delegates all business logic to specialized services
 * Follows SOLID principles and separation of concerns
 */
export class MarketplaceRoutes {
  private router: Hono;
  private prisma: PrismaClient;
  private marketplaceController: MarketplaceController;
  private listingService: MarketplaceListingService;
  private purchaseService: MarketplacePurchaseService;
  private statsService: MarketplaceStatsService;
  private transactionService: MarketplaceTransactionService;

  constructor() {
    this.router = new Hono();
    this.prisma = new PrismaClient();

    // Initialize services
    this.marketplaceController = new MarketplaceController(this.prisma);
    this.listingService = new MarketplaceListingService(this.prisma);
    this.purchaseService = new MarketplacePurchaseService(this.prisma);
    this.statsService = new MarketplaceStatsService(this.prisma);
    this.transactionService = new MarketplaceTransactionService(this.prisma);

    this.setupRoutes();
  }

  private setupRoutes() {
    // Mount controller routes
    this.router.route('/filter', this.marketplaceController.getRouter());

    // Listing endpoints
    this.router.post('/listings', this.createListing.bind(this));
    this.router.put('/listings/:id', this.updateListing.bind(this));
    this.router.delete('/listings/:id', this.removeListing.bind(this));
    this.router.get('/listings/user/:userId', this.getUserListings.bind(this));

    // Purchase endpoints
    this.router.post('/purchase', this.createPurchase.bind(this));
    this.router.post('/purchase/:id/verify', this.verifyPurchase.bind(this));
    this.router.post('/purchase/:id/refund', this.refundPurchase.bind(this));
    this.router.get('/purchases', this.getPurchases.bind(this));

    // Stats endpoints
    this.router.get('/stats', this.getMarketplaceStats.bind(this));
    this.router.get('/stats/user/:userId', this.getUserStats.bind(this));

    // Transaction endpoints
    this.router.get('/transactions/:userId', this.getTransactionHistory.bind(this));
  }

  private async createListing(c: Context) {
    try {
      const body = await c.req.json();
      const result = await this.listingService.createListing(body);

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }

      return c.json({ success: true, data: result.details });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to create listing'
      }, 500);
    }
  }

  private async updateListing(c: Context) {
    try {
      const channelId = parseInt(c.req.param('id'));
      const body = await c.req.json();
      const { userId, askingPrice } = body;

      const result = await this.listingService.updateListing(
        channelId,
        userId,
        askingPrice
      );

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }

      return c.json({ success: true, data: result.details });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to update listing'
      }, 500);
    }
  }

  private async removeListing(c: Context) {
    try {
      const channelId = parseInt(c.req.param('id'));
      const { userId } = await c.req.json();

      const result = await this.listingService.removeListing(channelId, userId);

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }

      return c.json({ success: true, data: result.details });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to remove listing'
      }, 500);
    }
  }

  private async getUserListings(c: Context) {
    try {
      const userId = parseInt(c.req.param('userId'));
      const listings = await this.listingService.getUserListings(userId);

      return c.json({ success: true, data: listings });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get user listings'
      }, 500);
    }
  }

  private async createPurchase(c: Context) {
    try {
      const body = await c.req.json();
      const result: any = await this.purchaseService.createPurchase(body);

      // result is the data returned from service (purchase object) if success, 
      // or service throws error.
      if (!result) {
        return c.json({ success: false, error: 'Failed to create purchase' }, 400);
      }

      return c.json({ success: true, data: result });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to process purchase'
      }, 500);
    }
  }

  private async verifyPurchase(c: Context) {
    try {
      const purchaseId = parseInt(c.req.param('id'));
      const { token } = await c.req.json();

      const success = await this.purchaseService.verifyPurchase(purchaseId, token);

      return c.json({ success, verified: success });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to verify purchase'
      }, 500);
    }
  }

  private async refundPurchase(c: Context) {
    try {
      const purchaseId = parseInt(c.req.param('id'));
      const result = await this.transactionService.refundTransaction(purchaseId);

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }

      return c.json({ success: true, data: result.details });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to process refund'
      }, 500);
    }
  }

  private async getPurchases(c: Context) {
    try {
      const telegramId = c.req.query('telegram_id');

      if (!telegramId) {
        return c.json({ success: false, error: 'telegram_id is required' }, 400);
      }

      const purchases = await this.purchaseService.getUserPurchases(telegramId);
      return c.json({ success: true, data: purchases });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return c.json({ success: false, error: 'User not found' }, 404);
      }
      return c.json({
        success: false,
        error: error.message || 'Failed to get purchases'
      }, 500);
    }
  }

  private async getMarketplaceStats(c: Context) {
    try {
      const stats = await this.statsService.getOverallStats();

      return c.json({ success: true, data: stats });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get marketplace stats'
      }, 500);
    }
  }

  private async getUserStats(c: Context) {
    try {
      const userId = parseInt(c.req.param('userId'));
      const stats = await this.statsService.getUserStats(userId);

      return c.json({ success: true, data: stats });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get user stats'
      }, 500);
    }
  }

  private async getTransactionHistory(c: Context) {
    try {
      const userId = parseInt(c.req.param('userId'));
      const limit = parseInt(c.req.query('limit') || '10');

      const transactions = await this.transactionService.getTransactionHistory(
        userId,
        limit
      );

      return c.json({ success: true, data: transactions });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get transaction history'
      }, 500);
    }
  }

  getRouter(): Hono {
    return this.router;
  }
}

// Export initialized routes
const marketplaceRoutes = new MarketplaceRoutes();
export default marketplaceRoutes.getRouter();
