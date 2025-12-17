import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { TelegramService } from './telegram.service';

const MAX_WARNINGS = 5;
const VERIFICATION_TIMEOUT_HOURS = 24;

export class PurchaseService {
  private prisma: PrismaClient;
  private telegramService: TelegramService;

  constructor(prisma: PrismaClient, telegramService?: TelegramService) {
    this.prisma = prisma;
    this.telegramService = telegramService || new TelegramService();
  }

  /**
   * Create a purchase with held funds
   */
  async createPurchase(
    channelId: number,
    buyerId: number,
    sellerId: number,
    price: number
  ) {
    try {
      // Check if buyer has enough balance
      const buyer = await this.prisma.user.findUnique({
        where: { id: buyerId }
      });

      if (!buyer) {
        return { success: false, error: 'Buyer not found' };
      }

      if (buyer.balance < price) {
        return { success: false, error: 'Insufficient balance' };
      }

      // Check if buyer is banned
      const buyerWarnings = await (this.prisma as any).userWarning.findFirst({
        where: { userId: buyerId, isBanned: true }
      });

      if (buyerWarnings) {
        return { success: false, error: 'User is banned from purchases' };
      }

      // Check if channel already has an active purchase (prevent double-buy)
      const existingPurchase = await (this.prisma as any).purchase.findFirst({
        where: {
          channelId,
          status: 'held'
        }
      });

      if (existingPurchase) {
        return { 
          success: false, 
          error: 'This channel is already being purchased by another buyer. Please try again later.' 
        };
      }

      // Create purchase record with held funds
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationDeadline = new Date(
        Date.now() + VERIFICATION_TIMEOUT_HOURS * 60 * 60 * 1000
      );

      const purchase = await (this.prisma as any).purchase.create({
        data: {
          channelId,
          buyerId,
          sellerId,
          price,
          heldAmount: price,
          status: 'held',
          verificationToken,
          verificationDeadline
        }
      });

      // Deduct from buyer's balance (hold the funds)
      await this.prisma.user.update({
        where: { id: buyerId },
        data: { balance: buyer.balance - price }
      });

      // Update channel status to sale_pending
      await this.prisma.channel.update({
        where: { id: channelId },
        data: { status: 'sale_pending' }
      });

      console.log(`[Purchase] Created purchase ${purchase.id} with held funds: ${price}`);

      return {
        success: true,
        data: {
          purchaseId: purchase.id,
          verificationToken,
          verificationDeadline,
          message: 'Purchase created. Funds held in escrow. Please confirm channel ownership within 24 hours.'
        }
      };
    } catch (error) {
      console.error('[Purchase Service] Error creating purchase:', error);
      return { success: false, error: 'Failed to create purchase' };
    }
  }

  /**
   * Confirm transfer by seller
   */
  async confirmTransfer(purchaseId: number, sellerId: number) {
    try {
      const purchase = await (this.prisma as any).purchase.findUnique({
        where: { id: purchaseId }
      });

      if (!purchase) {
        return { success: false, error: 'Purchase not found' };
      }

      if (purchase.sellerId !== sellerId) {
        return { success: false, error: 'Not authorized' };
      }

      // Update metadata with confirmation time
      const metadata = purchase.metadata ? JSON.parse(purchase.metadata) : {};
      metadata.sellerConfirmedAt = new Date().toISOString();

      await (this.prisma as any).purchase.update({
        where: { id: purchaseId },
        data: {
          metadata: JSON.stringify(metadata)
          // We might want to update status, but 'held' or 'sale_pending' is fine until verified.
          // Maybe add a flag 'sellerConfirmed' to the model if possible, but metadata is safer for now.
        }
      });

      return {
        success: true,
        message: 'Transfer confirmed. Verification window started (30 mins).',
        sellerConfirmedAt: metadata.sellerConfirmedAt
      };
    } catch (error) {
      console.error('[Purchase Service] Error confirming transfer:', error);
      return { success: false, error: 'Failed to confirm transfer' };
    }
  }

  /**
   * Verify purchase ownership and gifts
   */
  async verifyPurchase(
    purchaseId: number,
    verificationToken?: string, // Optional if verified by system/admin
    skipTokenCheck: boolean = false
  ) {
    try {
      const purchase = await (this.prisma as any).purchase.findUnique({
        where: { id: purchaseId },
        include: {
          buyer: true,
          seller: true
        }
      });

      if (!purchase) {
        return { success: false, error: 'Purchase not found' };
      }

      // Verify token if required
      if (!skipTokenCheck && verificationToken && purchase.verificationToken !== verificationToken) {
        return { success: false, error: 'Invalid verification token' };
      }

      // Check if deadline passed
      if (new Date() > purchase.verificationDeadline) {
        return {
          success: false,
          error: 'Verification deadline passed. Purchase cancelled and funds refunded.'
        };
      }

      // Check for seller confirmation grace period (30 minutes)
      // Parse metadata to check sellerConfirmedAt
      const metadata = purchase.metadata ? JSON.parse(purchase.metadata) : {};
      const sellerConfirmedAt = metadata.sellerConfirmedAt ? new Date(metadata.sellerConfirmedAt) : null;

      // If seller hasn't confirmed yet, we generally shouldn't be verifying unless it's an admin override
      // But if they HAVE confirmed, we must respect the 30-minute window if it hasn't passed
      if (sellerConfirmedAt) {
        const timeSinceConfirmation = Date.now() - sellerConfirmedAt.getTime();
        const gracePeriodMs = 30 * 60 * 1000; // 30 minutes

        if (timeSinceConfirmation < gracePeriodMs && !skipTokenCheck) {
           const minutesLeft = Math.ceil((gracePeriodMs - timeSinceConfirmation) / 60000);
           return {
             success: false,
             error: `Verification is locked for ${minutesLeft} more minutes to allow the seller time to complete the transfer.`,
             gracePeriodActive: true,
             minutesLeft
           };
        }
      }

      // Get channel
      const channel = await this.prisma.channel.findUnique({
        where: { id: purchase.channelId }
      });

      if (!channel) {
        return { success: false, error: 'Channel not found' };
      }

      // 1. CHECK REAL OWNERSHIP ON TELEGRAM
      // We need to verify if the BUYER is now the owner/admin of the channel
      console.log(`[Purchase Verification] Checking Telegram ownership for channel @${channel.username}...`);
      
      // The buyer's telegram ID
      const buyerTelegramId = parseInt(purchase.buyer.telegramId);
      
      const ownershipCheck = await this.telegramService.verifyChannelOwnership(
        channel.username, 
        buyerTelegramId
      );
      
      if (ownershipCheck.isOwner) {
        console.log(`[Purchase Verification] ✅ Telegram confirmed buyer ${buyerTelegramId} is now owner/admin!`);
        
        // Update Channel in DB to reflect new owner
        await this.prisma.channel.update({
          where: { id: channel.id },
          data: { userId: purchase.buyerId }
        });
        
        // Refresh channel object
        channel.userId = purchase.buyerId;
      } else {
        console.warn(`[Purchase Verification] ❌ Telegram check failed. Buyer ${buyerTelegramId} is NOT owner/admin yet.`);
        // We don't fail immediately, we check if DB matches (maybe manual update happened)
        // But if DB also mismatch, then we return error (not failure yet, just "not ready")
      }

      // Verify ownership changed to buyer (in DB)
      if (channel.userId !== purchase.buyerId) {
        console.warn(
          `[Purchase Verification] ❌ Ownership mismatch for purchase ${purchaseId}. Expected buyer ${purchase.buyerId}, got ${channel.userId}`
        );
        
        return {
          success: false,
          error: 'Channel ownership transfer not detected. Please make sure the seller has transferred the channel to you on Telegram.'
        };
      }

      // Verify gifts (parse and compare)
      let giftsVerified = true;
      try {
        const currentGifts = JSON.parse(channel.giftsJson || '[]');
        const originalGifts = purchase.metadata
          ? JSON.parse(purchase.metadata).originalGifts || []
          : [];

        // Check if gifts were modified
        if (originalGifts.length > 0) {
          const currentGiftIds = currentGifts.map((g: any) => g.id).sort();
          const originalGiftIds = originalGifts.map((g: any) => g.id).sort();

          if (JSON.stringify(currentGiftIds) !== JSON.stringify(originalGiftIds)) {
            giftsVerified = false;
            console.warn(
              `[Purchase Verification] ⚠️ Gifts mismatch for purchase ${purchaseId}. Cheating detected.`
            );

            // Add warning to seller
            const warningResult = await this.addWarning(
              purchase.sellerId,
              'cheat_gifts_modification',
              `Gifts were modified during active purchase ${purchaseId}. Transaction cancelled.`,
              purchaseId
            );

            // CANCEL PURCHASE AND REFUND BUYER
            const buyer = await this.prisma.user.findUnique({ where: { id: purchase.buyerId } });
            if (buyer) {
              await this.prisma.user.update({
                where: { id: purchase.buyerId },
                data: { balance: buyer.balance + purchase.heldAmount }
              });
            }

            // Mark purchase as cancelled/failed
            await (this.prisma as any).purchase.update({
              where: { id: purchaseId },
              data: {
                status: 'cancelled',
                verificationNote: 'Cancelled due to modification of channel gifts (Cheating detected). Funds refunded.',
                verifiedAt: new Date()
              }
            });

            // Reset channel status so it's not "sale_pending" anymore (or suspend it)
            await this.prisma.channel.update({
              where: { id: purchase.channelId },
              data: { status: 'suspended' } // Delist/Suspend channel
            });

            return {
              success: false,
              error: `Verification failed: Channel gifts were modified by seller. Purchase cancelled, funds refunded. Seller warned (${warningResult.remainingWarnings} warnings left).`
            };
          }
        }
      } catch (e) {
        console.error('[Purchase Verification] Error comparing gifts:', e);
      }

      // Complete purchase - Transfer funds to seller
      const seller = await this.prisma.user.findUnique({ where: { id: purchase.sellerId } });
      if (seller) {
        await this.prisma.user.update({
          where: { id: purchase.sellerId },
          data: { balance: seller.balance + purchase.heldAmount }
        });
      }

      // Update purchase status
      const updatedPurchase = await (this.prisma as any).purchase.update({
        where: { id: purchaseId },
        data: {
          status: 'completed', // Was 'verified'
          ownershipVerified: true,
          giftsVerified,
          verifiedAt: new Date()
        }
      });

      // Update channel status
      await this.prisma.channel.update({
        where: { id: purchase.channelId },
        data: { status: 'sold' } // Or 'verified' if new owner wants to keep it
      });

      console.log(`[Purchase Verification] ✅ Purchase ${purchaseId} verified successfully. Funds released.`);

      return {
        success: true,
        data: {
          purchaseId: updatedPurchase.id,
          ownershipVerified: updatedPurchase.ownershipVerified,
          giftsVerified: updatedPurchase.giftsVerified,
          message: 'Purchase verified successfully. Funds released to seller.'
        }
      };
    } catch (error) {
      console.error('[Purchase Service] Error verifying purchase:', error);
      return { success: false, error: 'Failed to verify purchase' };
    }
  }

  /**
   * Refund purchase and release held funds
   */
  async refundPurchase(purchaseId: number, reason: string) {
    try {
      const purchase = await (this.prisma as any).purchase.findUnique({
        where: { id: purchaseId }
      });

      if (!purchase) {
        return { success: false, error: 'Purchase not found' };
      }

      // Refund to buyer
      const buyer = await this.prisma.user.findUnique({
        where: { id: purchase.buyerId }
      });

      if (buyer) {
        await this.prisma.user.update({
          where: { id: purchase.buyerId },
          data: { balance: buyer.balance + purchase.heldAmount }
        });
      }

      // Update purchase status
      await (this.prisma as any).purchase.update({
        where: { id: purchaseId },
        data: {
          status: 'refunded',
          refundedAt: new Date(),
          metadata: JSON.stringify({ refundReason: reason })
        }
      });

      // Delist channel
      await this.prisma.channel.update({
        where: { id: purchase.channelId },
        data: {
          askingPrice: null,
          status: 'verified'
        }
      });

      console.log(`[Purchase Refund] ✅ Purchase ${purchaseId} refunded. Reason: ${reason}`);

      return { success: true, message: 'Purchase refunded and channel delisted' };
    } catch (error) {
      console.error('[Purchase Service] Error refunding purchase:', error);
      return { success: false, error: 'Failed to refund purchase' };
    }
  }

  /**
   * Add warning to user
   */
  async addWarning(
    userId: number,
    reason: string,
    description: string,
    purchaseId?: number
  ) {
    try {
      // Check existing warnings
      const existingWarning = await (this.prisma as any).userWarning.findFirst({
        where: { userId, reason }
      });

      let warningCount = 1;
      if (existingWarning) {
        warningCount = existingWarning.count + 1;
        await (this.prisma as any).userWarning.update({
          where: { id: existingWarning.id },
          data: { count: warningCount }
        });
      } else {
        await (this.prisma as any).userWarning.create({
          data: {
            userId,
            reason,
            description,
            relatedPurchaseId: purchaseId,
            count: 1
          }
        });
      }

      console.log(`[User Warning] User ${userId} warning count: ${warningCount}`);

      // Ban user after 5 warnings
      if (warningCount >= MAX_WARNINGS) {
        await (this.prisma as any).userWarning.updateMany({
          where: { userId },
          data: { isBanned: true, bannedAt: new Date() }
        });

        console.warn(`[User Ban] User ${userId} banned after ${MAX_WARNINGS} warnings`);

        return {
          success: true,
          banned: true,
          message: `User banned after ${MAX_WARNINGS} warnings`
        };
      }

      return {
        success: true,
        banned: false,
        warningCount,
        remainingWarnings: MAX_WARNINGS - warningCount
      };
    } catch (error) {
      console.error('[User Warning Service] Error adding warning:', error);
      return { success: false, error: 'Failed to add warning' };
    }
  }

  /**
   * Get user warnings
   */
  async getUserWarnings(userId: number) {
    try {
      const warnings = await (this.prisma as any).userWarning.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      const totalWarnings = warnings.reduce((sum: number, w: any) => sum + w.count, 0);
      const isBanned = warnings.some((w: any) => w.isBanned);

      return {
        success: true,
        data: {
          warnings,
          totalWarnings,
          isBanned,
          remainingWarnings: Math.max(0, MAX_WARNINGS - totalWarnings)
        }
      };
    } catch (error) {
      console.error('[User Warning Service] Error fetching warnings:', error);
      return { success: false, error: 'Failed to fetch warnings' };
    }
  }

  /**
   * Get purchases for a user (as buyer or seller)
   */
  async getUserPurchases(userId: number) {
    try {
      const purchases = await (this.prisma as any).purchase.findMany({
        where: {
          OR: [
            { buyerId: userId },
            { sellerId: userId }
          ]
        },
        include: {
          buyer: {
            select: { id: true, telegramId: true, walletAddress: true }
          },
          seller: {
            select: { id: true, telegramId: true, walletAddress: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Add channel info manually to avoid circular/complex include issues if Channel model is simple
      // Or just use simple join
      const channelIds = purchases.map((p: any) => p.channelId);
      const channels = await this.prisma.channel.findMany({
        where: { id: { in: channelIds } }
      });
      
      const channelMap = new Map(channels.map(c => [c.id, c]));

      return purchases.map((p: any) => ({
        ...p,
        channel: channelMap.get(p.channelId),
        role: p.buyerId === userId ? 'buyer' : 'seller'
      }));
      
    } catch (error) {
       console.error('[Purchase Service] Error fetching user purchases:', error);
       return [];
    }
  }
}

export default PurchaseService;
