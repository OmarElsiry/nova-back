/**
 * Seed Manager
 * Manages database seeding with initial data
 */

import { PrismaClient } from '@prisma/client';
import type { ILogger } from '../logging/ILogger';

export interface SeedData {
  users?: Array<any>;
  channels?: Array<any>;
  purchases?: Array<any>;
  withdrawals?: Array<any>;
  deposits?: Array<any>;
}

export class SeedManager {
  private prisma: PrismaClient;
  private logger: ILogger;

  constructor(prisma: PrismaClient, logger: ILogger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Seed database with initial data
   */
  async seed(data: SeedData): Promise<void> {
    this.logger.info('Starting database seeding');

    try {
      // Seed users
      if (data.users && data.users.length > 0) {
        await this.seedUsers(data.users);
      }

      // Seed channels
      if (data.channels && data.channels.length > 0) {
        await this.seedChannels(data.channels);
      }

      // Seed purchases
      if (data.purchases && data.purchases.length > 0) {
        await this.seedPurchases(data.purchases);
      }

      // Seed withdrawals
      if (data.withdrawals && data.withdrawals.length > 0) {
        await this.seedWithdrawals(data.withdrawals);
      }

      // Seed deposits
      if (data.deposits && data.deposits.length > 0) {
        await this.seedDeposits(data.deposits);
      }

      this.logger.info('Database seeding completed successfully');
    } catch (error) {
      this.logger.error('Database seeding failed', error);
      throw error;
    }
  }

  /**
   * Seed users table
   */
  private async seedUsers(users: Array<any>): Promise<void> {
    this.logger.info('Seeding users', { count: users.length });

    try {
      for (const user of users) {
        await this.prisma.user.upsert({
          where: { telegramId: user.telegramId },
          update: user,
          create: user
        });
      }

      this.logger.info('Users seeded successfully', { count: users.length });
    } catch (error) {
      this.logger.error('Failed to seed users', error);
      throw error;
    }
  }

  /**
   * Seed channels table
   */
  private async seedChannels(channels: Array<any>): Promise<void> {
    this.logger.info('Seeding channels', { count: channels.length });

    try {
      for (const channel of channels) {
        await this.prisma.channel.upsert({
          where: { id: channel.id },
          update: channel,
          create: channel
        });
      }

      this.logger.info('Channels seeded successfully', { count: channels.length });
    } catch (error) {
      this.logger.error('Failed to seed channels', error);
      throw error;
    }
  }

  /**
   * Seed purchases table
   */
  private async seedPurchases(purchases: Array<any>): Promise<void> {
    this.logger.info('Seeding purchases', { count: purchases.length });

    try {
      for (const purchase of purchases) {
        await this.prisma.purchase.upsert({
          where: { id: purchase.id },
          update: purchase,
          create: purchase
        });
      }

      this.logger.info('Purchases seeded successfully', { count: purchases.length });
    } catch (error) {
      this.logger.error('Failed to seed purchases', error);
      throw error;
    }
  }

  /**
   * Seed withdrawals table
   */
  private async seedWithdrawals(withdrawals: Array<any>): Promise<void> {
    this.logger.info('Seeding withdrawals', { count: withdrawals.length });

    try {
      for (const withdrawal of withdrawals) {
        await this.prisma.withdrawal.upsert({
          where: { id: withdrawal.id },
          update: withdrawal,
          create: withdrawal
        });
      }

      this.logger.info('Withdrawals seeded successfully', { count: withdrawals.length });
    } catch (error) {
      this.logger.error('Failed to seed withdrawals', error);
      throw error;
    }
  }

  /**
   * Seed deposits table
   */
  private async seedDeposits(deposits: Array<any>): Promise<void> {
    this.logger.info('Seeding deposits', { count: deposits.length });

    try {
      for (const deposit of deposits) {
        await this.prisma.deposit.upsert({
          where: { id: deposit.id },
          update: deposit,
          create: deposit
        });
      }

      this.logger.info('Deposits seeded successfully', { count: deposits.length });
    } catch (error) {
      this.logger.error('Failed to seed deposits', error);
      throw error;
    }
  }

  /**
   * Clear all data from database
   */
  async clearDatabase(): Promise<void> {
    this.logger.warn('Clearing all data from database');

    try {
      await this.prisma.deposit.deleteMany({});
      await this.prisma.withdrawal.deleteMany({});
      await this.prisma.purchase.deleteMany({});
      await this.prisma.channel.deleteMany({});
      await this.prisma.user.deleteMany({});

      this.logger.info('Database cleared successfully');
    } catch (error) {
      this.logger.error('Failed to clear database', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStatistics(): Promise<{
    users: number;
    channels: number;
    purchases: number;
    withdrawals: number;
    deposits: number;
  }> {
    try {
      const [users, channels, purchases, withdrawals, deposits] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.channel.count(),
        this.prisma.purchase.count(),
        this.prisma.withdrawal.count(),
        this.prisma.deposit.count()
      ]);

      return { users, channels, purchases, withdrawals, deposits };
    } catch (error) {
      this.logger.error('Failed to get database statistics', error);
      throw error;
    }
  }
}
