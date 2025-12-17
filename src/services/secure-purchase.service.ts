/**
 * Secure Purchase Service with Atomic Transactions
 * Handles all purchase operations with proper concurrency control
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { FINANCIAL } from '../shared/constants/financial.constants';
import * as crypto from 'crypto';
import { createLogger } from '../infrastructure/logging/logger';
import {
  parseBalance,
  hasSufficientBalance,
  subtractAmounts,
  calculatePercentage,
  serializeDecimal
} from '../shared/utils/financial.utils';

const logger = createLogger('secure-purchase-service');

export interface CreatePurchaseDto {
  buyerId: number;
  channelId: number;
  paymentMethod: 'balance' | 'ton_wallet';
  agreementAccepted: boolean;
}

export interface VerifyPurchaseDto {
  purchaseId: number;
  verificationToken: string;
  channelTransferred: boolean;
  giftsMatch: boolean;
}

export class SecurePurchaseService {
  constructor(private prisma: PrismaClient) { }

  /**
   * Create purchase with full atomicity and concurrency control
   */
  async createPurchase(dto: CreatePurchaseDto) {
    const startTime = Date.now();

    logger.info('Creating purchase', {
      buyerId: dto.buyerId,
      channelId: dto.channelId
    });

    try {
      // Use serializable isolation level to prevent race conditions
      const result = await this.prisma.$transaction(async (tx) => {
        // Step 1: Lock and validate buyer
        const buyer = await tx.user.findUnique({
          where: { id: dto.buyerId },
          select: {
            id: true,
            balance: true,
            telegramId: true,
            role: true,
            warnings: {
              where: {
                reason: 'banned',
                isBanned: true
              }
            }
          }
        });

        if (!buyer) {
          throw new Error('Buyer not found');
        }

        if (buyer.warnings.length > 0) {
          throw new Error('User is banned from making purchases');
        }

        // Step 2: Lock and validate channel
        const channel = await tx.channel.findUnique({
          where: {
            id: dto.channelId,
            status: 'listed' // Must be available
          },
          include: {
            user: {
              select: {
                id: true,
                telegramId: true
              }
            }
          }
        });

        if (!channel) {
          throw new Error('Channel not available for purchase');
        }

        if (channel.userId === dto.buyerId) {
          throw new Error('Cannot purchase your own channel');
        }

        const price = channel.askingPrice || 0;

        // Step 3: Check and deduct balance atomically
        // This uses a WHERE clause to ensure balance hasn't changed
        const updatedBuyer = await tx.user.update({
          where: {
            id: dto.buyerId,
            balance: { gte: price } // Atomic balance check
          },
          data: {
            balance: {
              decrement: price
            }
          }
        }).catch((error) => {
          if (error.code === 'P2025') {
            throw new Error('Insufficient funds or balance changed');
          }
          throw error;
        });

        // Step 4: Create purchase record with escrow
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const purchase = await tx.purchase.create({
          data: {
            // id is autoincrement
            buyerId: dto.buyerId,
            sellerId: channel.userId,
            channelId: dto.channelId,
            price: price,
            heldAmount: price,
            status: 'held', // Funds held in escrow
            verificationToken,
            verificationDeadline,
            ownershipVerified: false,
            giftsVerified: false,
            metadata: JSON.stringify({
              paymentMethod: dto.paymentMethod,
              agreementAccepted: dto.agreementAccepted,
              channelSnapshot: {
                username: channel.username,
                giftsCount: channel.giftsCount,
                featuredGiftImageUrl: channel.featuredGiftImageUrl
              },
              timestamp: new Date().toISOString()
            })
          }
        });

        // Step 5: Update channel status atomically
        await tx.channel.update({
          where: {
            id: dto.channelId,
            status: 'listed' // Double-check status hasn't changed
          },
          data: {
            status: 'pending_transfer'
          }
        }).catch((error) => {
          if (error.code === 'P2025') {
            throw new Error('Channel status changed during purchase');
          }
          throw error;
        });

        // Step 6: Create transaction log for audit
        await tx.transaction.create({
          data: {
            userId: dto.buyerId,
            amount: -price,
            type: 'withdrawal',
            status: 'completed',
            txHash: `purchase_${purchase.id}`
          }
        });

        // Step 7: Create seller notification (but don't credit yet)
        // Calculate seller amount after platform fee (3%)
        const priceDecimal = parseBalance(price);
        const platformFee = calculatePercentage(priceDecimal, FINANCIAL.DEFAULT_PLATFORM_FEE_PERCENT);
        const sellerAmount = subtractAmounts(priceDecimal, platformFee);

        await tx.transaction.create({
          data: {
            userId: channel.userId,
            amount: parseFloat(serializeDecimal(sellerAmount)), // Convert back for Prisma
            type: 'deposit',
            status: 'pending', // Will complete after verification
            txHash: `sale_${purchase.id}`
          }
        });

        logger.info('Purchase created successfully', {
          purchaseId: purchase.id,
          buyerId: dto.buyerId,
          sellerId: channel.userId,
          price: price,
          duration: Date.now() - startTime
        });

        return purchase;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000
      });

      return result;
    } catch (error) {
      logger.error('Purchase creation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        buyerId: dto.buyerId,
        channelId: dto.channelId,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Verify purchase and release funds from escrow
   */
  async verifyPurchase(dto: VerifyPurchaseDto) {
    logger.info('Verifying purchase', { purchaseId: dto.purchaseId });

    return await this.prisma.$transaction(async (tx) => {
      // Find and lock purchase
      const purchase = await tx.purchase.findUnique({
        where: {
          id: dto.purchaseId,
          status: 'held'
        },
        include: {
          channel: true,
          seller: true,
          buyer: true
        }
      });

      if (!purchase) {
        throw new Error('Purchase not found or already processed');
      }

      // Validate verification token
      if (purchase.verificationToken !== dto.verificationToken) {
        // Log potential fraud attempt
        logger.warn('Invalid verification token', {
          purchaseId: dto.purchaseId,
          buyerId: purchase.buyerId
        });
        throw new Error('Invalid verification token');
      }

      // Check deadline
      if (new Date() > purchase.verificationDeadline) {
        throw new Error('Verification deadline expired');
      }

      // Verify conditions
      if (!dto.channelTransferred || !dto.giftsMatch) {
        // Refund buyer
        await tx.user.update({
          where: { id: purchase.buyerId },
          data: {
            balance: { increment: purchase.price }
          }
        });

        // Mark purchase as failed
        await tx.purchase.update({
          where: { id: dto.purchaseId },
          data: {
            status: 'refunded',
            refundedAt: new Date(),
            metadata: JSON.stringify({
              ...JSON.parse(purchase.metadata || '{}'),
              refundReason: !dto.channelTransferred
                ? 'Channel not transferred'
                : 'Gifts do not match'
            })
          }
        });

        // Add warning to seller if fraud
        if (!dto.channelTransferred) {
          await tx.userWarning.create({
            data: {
              userId: purchase.sellerId,
              reason: 'fraud',
              description: 'Failed to transfer channel after sale',
              isBanned: true
            }
          });
        }

        throw new Error('Purchase verification failed - refund issued');
      }

      // Verification successful - release funds to seller
      await tx.user.update({
        where: { id: purchase.sellerId },
        data: {
          balance: {
            increment: purchase.price - Math.floor(purchase.price * (FINANCIAL.DEFAULT_PLATFORM_FEE_PERCENT / 100))
          }
        }
      });

      // Update purchase status
      await tx.purchase.update({
        where: { id: dto.purchaseId },
        data: {
          status: 'completed',
          ownershipVerified: true,
          giftsVerified: true,
          verifiedAt: new Date()
        }
      });

      // Update channel ownership
      await tx.channel.update({
        where: { id: purchase.channelId },
        data: {
          userId: purchase.buyerId,
          status: 'verified'
        }
      });

      // Complete pending transactions
      await tx.transaction.updateMany({
        where: {
          txHash: `sale_${purchase.id}`,
          status: 'pending'
        },
        data: {
          status: 'completed'
        }
      });

      logger.info('Purchase verified successfully', {
        purchaseId: dto.purchaseId,
        price: purchase.price
      });

      return purchase;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000
    });
  }

  /**
   * Handle automatic refund if verification fails
   */
  async processExpiredPurchases() {
    const expiredPurchases = await this.prisma.purchase.findMany({
      where: {
        status: 'held',
        verificationDeadline: {
          lt: new Date()
        }
      }
    });

    for (const purchase of expiredPurchases) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Refund buyer
          await tx.user.update({
            where: { id: purchase.buyerId },
            data: {
              balance: { increment: purchase.price }
            }
          });

          // Update purchase status
          await tx.purchase.update({
            where: { id: purchase.id },
            data: {
              status: 'refunded',
              refundedAt: new Date(),
              metadata: JSON.stringify({
                ...JSON.parse(purchase.metadata || '{}'),
                refundReason: 'Verification deadline expired'
              })
            }
          });

          // Reset channel status
          await tx.channel.update({
            where: { id: purchase.channelId },
            data: { status: 'listed' }
          });

          logger.info('Expired purchase refunded', {
            purchaseId: purchase.id,
            price: purchase.price
          });
        });
      } catch (error) {
        logger.error('Failed to process expired purchase', {
          purchaseId: purchase.id,
          error
        });
      }
    }
  }
}
