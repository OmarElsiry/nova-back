import { PrismaClient, type User as PrismaUser } from '@prisma/client';
import type { IRepository, ICriteria, IPaginatedResult } from '../../core/domain/repositories/IRepository';
import { injectable } from 'tsyringe';
import type { ICacheService } from '../services/ICacheService';

export interface IUserRepository extends IRepository<PrismaUser> {
  findByTelegramId(telegramId: string): Promise<PrismaUser | null>;
  findByWalletAddress(walletAddress: string): Promise<PrismaUser | null>;
  updateBalance(userId: number, amount: number): Promise<PrismaUser>;
  findWithTransactions(userId: number, limit?: number): Promise<PrismaUser | null>;
  searchUsers(query: string, limit?: number): Promise<PrismaUser[]>;
  getPaginatedUsers(page: number, pageSize: number): Promise<IPaginatedResult<PrismaUser>>;
}

@injectable()
export class UserRepository implements IUserRepository {
  private readonly CACHE_PREFIX = 'user:';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache?: ICacheService
  ) { }

  async findById(id: string): Promise<PrismaUser | null> {
    const cacheKey = `${this.CACHE_PREFIX}id:${id}`;

    // Check cache first
    const cached = await this.cache?.get<PrismaUser>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (user) {
      await this.cache?.set(cacheKey, user, this.CACHE_TTL);
    }

    return user;
  }

  async findByTelegramId(telegramId: string): Promise<PrismaUser | null> {
    const cacheKey = `${this.CACHE_PREFIX}telegram:${telegramId}`;

    const cached = await this.cache?.get<PrismaUser>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { telegramId }
    });

    if (user) {
      await this.cache?.set(cacheKey, user, this.CACHE_TTL);
    }

    return user;
  }

  async findByWalletAddress(walletAddress: string): Promise<PrismaUser | null> {
    const cacheKey = `${this.CACHE_PREFIX}wallet:${walletAddress}`;

    const cached = await this.cache?.get<PrismaUser>(cacheKey);
    if (cached) return cached;

    // Direct match
    let user = await this.prisma.user.findFirst({
      where: { walletAddress }
    });

    // Check wallet variants
    if (!user) {
      const users = await this.prisma.user.findMany();
      for (const u of users) {
        try {
          const variants = JSON.parse(u.walletAddressVariants || '[]');
          if (variants.includes(walletAddress)) {
            user = u;
            break;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    if (user) {
      await this.cache?.set(cacheKey, user, this.CACHE_TTL);
    }

    return user;
  }

  async findAll(criteria?: ICriteria): Promise<PrismaUser[]> {
    return await this.prisma.user.findMany({
      where: criteria?.where,
      orderBy: criteria?.orderBy,
      take: criteria?.limit,
      skip: criteria?.offset,
    });
  }

  async save(entity: PrismaUser): Promise<PrismaUser> {
    const user = await this.prisma.user.create({
      data: entity as any
    });

    // Invalidate cache
    await this.invalidateUserCache(user);

    return user;
  }

  async update(id: string, entity: Partial<PrismaUser>): Promise<PrismaUser> {
    const user = await this.prisma.user.update({
      where: { id: parseInt(id) },
      data: entity
    });

    // Invalidate cache
    await this.invalidateUserCache(user);

    return user;
  }

  async updateBalance(userId: number, amount: number): Promise<PrismaUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: amount
        }
      }
    });

    // Invalidate cache
    await this.invalidateUserCache(user);

    return user;
  }

  async delete(id: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: parseInt(id) }
      });

      if (user) {
        await this.invalidateUserCache(user);
        await this.prisma.user.delete({
          where: { id: parseInt(id) }
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { id: parseInt(id) }
    });
    return count > 0;
  }

  async findWithTransactions(userId: number, limit: number = 10): Promise<PrismaUser | null> {
    return await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: limit
        },
        channels: true
      }
    });
  }

  async searchUsers(query: string, limit: number = 20): Promise<PrismaUser[]> {
    return await this.prisma.user.findMany({
      where: {
        OR: [
          { telegramId: { contains: query } },
          { walletAddress: { contains: query } }
        ]
      },
      take: limit
    });
  }

  async getPaginatedUsers(page: number, pageSize: number): Promise<IPaginatedResult<PrismaUser>> {
    const offset = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: offset,
        take: pageSize,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.user.count()
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  private async invalidateUserCache(user: PrismaUser): Promise<void> {
    if (!this.cache) return;

    const keysToInvalidate = [
      `${this.CACHE_PREFIX}id:${user.id}`,
      `${this.CACHE_PREFIX}telegram:${user.telegramId}`,
      `${this.CACHE_PREFIX}wallet:${user.walletAddress}`
    ];

    await Promise.all(keysToInvalidate.map(key => this.cache!.delete(key)));
  }
}
