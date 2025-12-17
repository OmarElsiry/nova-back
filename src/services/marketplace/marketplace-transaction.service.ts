import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const transactionSchema = z.object({
  channelId: z.number(),
  buyerId: z.number(),
  sellerId: z.number(),
  amount: z.number().min(0),
  type: z.enum(['purchase', 'refund', 'escrow_hold', 'escrow_release'])
});

export interface TransactionData {
  channelId: number;
  buyerId: number;
  sellerId: number;
  amount: number;
  type: 'purchase' | 'refund' | 'escrow_hold' | 'escrow_release';
}

export interface TransactionResult {
  success: boolean;
  transactionId?: number;
  error?: string;
  details?: any;
}

export class MarketplaceTransactionService {
  constructor(private prisma: PrismaClient) {}

  async processTransaction(data: TransactionData): Promise<TransactionResult> {
    try {
      // Start a transaction for data consistency
      const result = await this.prisma.$transaction(async (tx) => {
        // Check buyer balance
        const buyer = await tx.user.findUnique({
          where: { id: data.buyerId }
        });

        if (!buyer) {
          throw new Error('Buyer not found');
        }

        const buyerBalance = typeof buyer.balance === 'string' 
          ? parseFloat(buyer.balance) 
          : buyer.balance;
        if (buyerBalance < data.amount) {
          throw new Error('Insufficient balance');
        }

        // Deduct from buyer
        await tx.user.update({
          where: { id: data.buyerId },
          data: {
            balance: buyerBalance - data.amount
          }
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId: data.buyerId,
            type: data.type === 'purchase' ? 'deposit' : 'withdrawal',
            amount: data.amount,
            status: 'completed',
            txHash: `marketplace_${data.type}_${data.channelId}_${Date.now()}`
          }
        });

        // Update channel status if purchase
        if (data.type === 'purchase') {
          await tx.channel.update({
            where: { id: data.channelId },
            data: { status: 'sold' }
          });
        }

        return transaction;
      });

      return {
        success: true,
        transactionId: result.id,
        details: result
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Transaction failed'
      };
    }
  }

  async refundTransaction(purchaseId: number): Promise<TransactionResult> {
    try {
      const purchase = await this.prisma.purchase.findUnique({
        where: { id: purchaseId }
      });

      if (!purchase) {
        throw new Error('Purchase not found');
      }

      if (purchase.status !== 'held') {
        throw new Error('Can only refund held purchases');
      }

      // Refund the held amount
      await this.prisma.$transaction(async (tx) => {
        // Return funds to buyer
        const buyer = await tx.user.findUnique({
          where: { id: purchase.buyerId }
        });

        if (buyer) {
          const currentBalance = typeof buyer.balance === 'string' 
            ? parseFloat(buyer.balance) 
            : buyer.balance;
          const newBalance = currentBalance + purchase.heldAmount;
          await tx.user.update({
            where: { id: purchase.buyerId },
            data: { balance: newBalance }
          });
        }

        // Update purchase status
        await tx.purchase.update({
          where: { id: purchaseId },
          data: {
            status: 'refunded',
            refundedAt: new Date()
          }
        });

        // Create refund transaction record
        await tx.transaction.create({
          data: {
            userId: purchase.buyerId,
            type: 'withdrawal',
            amount: purchase.heldAmount,
            status: 'completed',
            txHash: `refund_purchase_${purchaseId}_${Date.now()}`
          }
        });
      });

      return {
        success: true,
        details: { purchaseId, refunded: true }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Refund failed'
      };
    }
  }

  async getTransactionHistory(userId: number, limit = 10): Promise<any[]> {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}
