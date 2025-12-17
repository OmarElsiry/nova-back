import { PrismaClient } from '@prisma/client';
import { NetworkService } from '../network/network.service';
import { API_ENDPOINTS } from '../../config/api-endpoints';

export interface BalanceInfo {
  userId?: number;
  walletAddress: string;
  balance: number;
  lastUpdated: Date;
  source: 'database' | 'blockchain';
}

export interface BalanceQueryResult {
  success: boolean;
  data?: BalanceInfo;
  error?: string;
}

export class BalanceQueryService {
  private networkService: NetworkService;

  constructor(private prisma: PrismaClient) {
    this.networkService = new NetworkService();
  }

  async getBalanceByWallet(
    walletAddress: string,
    refresh = false
  ): Promise<BalanceQueryResult> {
    try {
      // First try to get from database
      if (!refresh) {
        const user = await this.prisma.user.findFirst({
          where: { walletAddress }
        });

        if (user) {
          return {
            success: true,
            data: {
              userId: user.id,
              walletAddress: user.walletAddress!,
              balance: this.parseBalance(user.balance),
              lastUpdated: user.updatedAt,
              source: 'database'
            }
          };
        }
      }

      // If refresh or not found, query blockchain
      const blockchainBalance = await this.queryBlockchain(walletAddress);
      
      if (blockchainBalance !== null) {
        // Update database if user exists
        const user = await this.prisma.user.findFirst({
          where: { walletAddress }
        });

        if (user) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { balance: blockchainBalance }
          });
        }

        return {
          success: true,
          data: {
            userId: user?.id,
            walletAddress,
            balance: blockchainBalance,
            lastUpdated: new Date(),
            source: 'blockchain'
          }
        };
      }

      return {
        success: false,
        error: 'Failed to get balance'
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to query balance'
      };
    }
  }

  async getBalanceByUserId(userId: number): Promise<BalanceQueryResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        data: {
          userId: user.id,
          walletAddress: user.walletAddress!,
          balance: this.parseBalance(user.balance),
          lastUpdated: user.updatedAt,
          source: 'database'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to query balance'
      };
    }
  }

  async getTotalBalance(): Promise<number> {
    const result = await this.prisma.user.aggregate({
      _sum: { balance: true }
    });

    return result._sum.balance || 0;
  }

  async getTopBalances(limit = 10): Promise<BalanceInfo[]> {
    const users = await this.prisma.user.findMany({
      where: {
        balance: { gt: 0 }
      },
      orderBy: { balance: 'desc' },
      take: limit
    });

    return users.map(user => ({
      userId: user.id,
      walletAddress: user.walletAddress!,
      balance: this.parseBalance(user.balance),
      lastUpdated: user.updatedAt,
      source: 'database' as const
    }));
  }

  private async queryBlockchain(walletAddress: string): Promise<number | null> {
    try {
      // Query TON API for balance
      const endpoint = API_ENDPOINTS.ton.accounts.replace(':address', walletAddress);
      const result = await this.networkService.get<any>(
        `${API_ENDPOINTS.ton.base}${endpoint}`
      );

      if (result.success && result.data?.balance) {
        // Convert from nanotons to TON
        return parseFloat(result.data.balance) / 1e9;
      }

      return null;
    } catch (error) {
      console.error('Failed to query blockchain:', error);
      return null;
    }
  }

  private parseBalance(balance: any): number {
    if (typeof balance === 'string') {
      return parseFloat(balance);
    }
    if (typeof balance === 'number') {
      return balance;
    }
    return 0;
  }
}
