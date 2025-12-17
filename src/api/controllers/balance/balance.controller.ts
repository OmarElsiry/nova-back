import { Hono } from 'hono';
import type { Context } from 'hono';
import { PrismaClient } from '@prisma/client';
import { BalanceQueryService } from '../../../services/balance/balance-query.service';
import { BalanceHistoryService } from '../../../services/balance/balance-history.service';
import { BalanceValidationService } from '../../../services/balance/balance-validation.service';
import { UserBalanceService } from '../../../services/user/user-balance.service';

export class BalanceController {
  private router: Hono;
  private queryService: BalanceQueryService;
  private historyService: BalanceHistoryService;
  private validationService: BalanceValidationService;
  private userBalanceService: UserBalanceService;

  constructor(private prisma: PrismaClient) {
    this.router = new Hono();
    this.queryService = new BalanceQueryService(prisma);
    this.historyService = new BalanceHistoryService(prisma);
    this.validationService = new BalanceValidationService();
    this.userBalanceService = new UserBalanceService(prisma);
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.get('/wallet/:address', this.getBalanceByWallet.bind(this));
    this.router.get('/user/:userId', this.getBalanceByUser.bind(this));
    this.router.post('/wallet/:address/refresh', this.refreshBalance.bind(this));
    this.router.get('/user/:userId/history', this.getBalanceHistory.bind(this));
    this.router.get('/top', this.getTopBalances.bind(this));
    this.router.get('/total', this.getTotalBalance.bind(this));
  }

  private async getBalanceByWallet(c: Context) {
    try {
      const walletAddress = c.req.param('address');
      const result = await this.queryService.getBalanceByWallet(walletAddress);

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error
        }, 404);
      }

      return c.json({
        success: true,
        data: result.data
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get balance'
      }, 500);
    }
  }

  private async getBalanceByUser(c: Context) {
    try {
      const userIdParam = c.req.param('userId');
      
      // Validate input to prevent SQL injection
      if (!userIdParam || !/^\d+$/.test(userIdParam)) {
        return c.json({
          success: false,
          error: 'Invalid user ID format'
        }, 400);
      }
      
      const userId = parseInt(userIdParam, 10);
      
      if (isNaN(userId) || userId < 0 || userId > 2147483647) {
        return c.json({
          success: false,
          error: 'User ID out of valid range'
        }, 400);
      }
      
      const result = await this.queryService.getBalanceByUserId(userId);

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error
        }, 404);
      }

      return c.json({
        success: true,
        data: result.data
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get balance'
      }, 500);
    }
  }

  private async refreshBalance(c: Context) {
    try {
      const walletAddress = c.req.param('address');
      const result = await this.queryService.getBalanceByWallet(walletAddress, true);

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error
        }, 404);
      }

      return c.json({
        success: true,
        data: result.data
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to refresh balance'
      }, 500);
    }
  }

  private async getBalanceHistory(c: Context) {
    try {
      const userId = parseInt(c.req.param('userId'));
      const limit = parseInt(c.req.query('limit') || '50');
      
      const history = await this.historyService.getUserBalanceHistory(userId, limit);

      return c.json({
        success: true,
        data: history
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get balance history'
      }, 500);
    }
  }

  private async getTopBalances(c: Context) {
    try {
      const limit = parseInt(c.req.query('limit') || '10');
      const topBalances = await this.queryService.getTopBalances(limit);

      return c.json({
        success: true,
        data: topBalances
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get top balances'
      }, 500);
    }
  }

  private async getTotalBalance(c: Context) {
    try {
      const total = await this.queryService.getTotalBalance();

      return c.json({
        success: true,
        data: {
          totalBalance: total
        }
      });
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message || 'Failed to get total balance'
      }, 500);
    }
  }

  getRouter(): Hono {
    return this.router;
  }
}
