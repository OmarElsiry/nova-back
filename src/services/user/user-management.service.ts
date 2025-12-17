import { PrismaClient } from '@prisma/client';

export interface UserProfile {
  id: number;
  telegramId: string;
  walletAddress: string | null;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserUpdateData {
  walletAddress?: string;
  balance?: number;
}

export interface UserResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
}

export class UserManagementService {
  constructor(private prisma: PrismaClient) {}

  async getUserById(userId: number): Promise<UserResult> {
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
        user: this.formatUser(user)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get user'
      };
    }
  }

  async getUserByTelegramId(telegramId: string): Promise<UserResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { telegramId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        user: this.formatUser(user)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get user'
      };
    }
  }

  async updateUser(userId: number, data: UserUpdateData): Promise<UserResult> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          walletAddress: data.walletAddress,
          balance: data.balance
        }
      });

      return {
        success: true,
        user: this.formatUser(user)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update user'
      };
    }
  }

  async deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.prisma.user.delete({
        where: { id: userId }
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete user'
      };
    }
  }

  async getUserCount(): Promise<number> {
    return this.prisma.user.count();
  }

  async getActiveUsers(days: number = 7): Promise<UserProfile[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const users = await this.prisma.user.findMany({
      where: {
        updatedAt: {
          gte: since
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return users.map(u => this.formatUser(u));
  }

  async getUsersByBalanceRange(min: number, max: number): Promise<UserProfile[]> {
    const users = await this.prisma.user.findMany({
      where: {
        balance: {
          gte: min,
          lte: max
        }
      },
      orderBy: {
        balance: 'desc'
      }
    });

    return users.map(u => this.formatUser(u));
  }

  private formatUser(user: any): UserProfile {
    return {
      id: user.id,
      telegramId: user.telegramId,
      walletAddress: user.walletAddress,
      balance: typeof user.balance === 'string' 
        ? parseFloat(user.balance) 
        : user.balance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}
