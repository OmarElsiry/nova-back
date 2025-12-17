import { PrismaClient } from '@prisma/client';

export class ChannelVerificationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async verifyChannel(channelUsername: string, userId: number) {
    try {
      // Find the channel
      const channel = await this.prisma.channel.findUnique({
        where: { username: channelUsername },
      });

      if (!channel) {
        throw new Error('Channel not found');
      }

      if (channel.userId !== userId) {
        throw new Error('You are not the owner of this channel');
      }

      // Update channel status to verified
      const updatedChannel = await this.prisma.channel.update({
        where: { id: channel.id },
        data: { 
          status: 'verified',
          updatedAt: new Date(),
        },
        include: {
          user: true,
        },
      });

      console.log(`✅ Channel ${channelUsername} verified for user ${userId}`);
      return updatedChannel;

    } catch (error) {
      console.error('❌ Verification error:', error);
      throw error;
    }
  }

  async getVerificationStatus(channelId: number) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        username: true,
        status: true,
        userId: true,
        updatedAt: true,
      },
    });

    if (!channel) {
      return {
        channelId,
        status: 'unknown',
        verified: false,
        exists: false,
      };
    }

    return {
      channelId: channel.id,
      username: channel.username,
      status: channel.status,
      verified: channel.status === 'verified',
      exists: true,
      lastUpdated: channel.updatedAt,
    };
  }

  async getVerifiedChannels() {
    return await this.prisma.channel.findMany({
      where: { status: 'verified' },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            walletAddress: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getChannelsPendingVerification() {
    return await this.prisma.channel.findMany({
      where: {
        status: {
          in: ['listed', 'pending'],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            walletAddress: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async rejectVerification(channelId: number, reason?: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    return await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        status: 'rejected',
        updatedAt: new Date(),
      },
    });
  }

  async requestVerification(channelUsername: string, userId: number) {
    const channel = await this.prisma.channel.findUnique({
      where: { username: channelUsername },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.userId !== userId) {
      throw new Error('You are not the owner of this channel');
    }

    if (channel.status === 'verified') {
      throw new Error('Channel is already verified');
    }

    return await this.prisma.channel.update({
      where: { id: channel.id },
      data: {
        status: 'pending',
        updatedAt: new Date(),
      },
    });
  }
}
