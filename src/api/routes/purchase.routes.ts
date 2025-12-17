/**
 * Purchase Routes
 * Handle purchase verification, escrow, and anti-fraud
 */

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { PurchaseService } from '../../services/purchase.service';
import { FINANCIAL } from '../../shared/constants/financial.constants';

const app = new Hono();
const prisma = new PrismaClient();
const purchaseService = new PurchaseService(prisma);

/**
 * POST /api/purchases/create
 * Create a purchase with held funds (escrow)
 */
app.post('/create', async (c) => {
  try {
    const body = await c.req.json();
    const { listing_id, channel_id, buyer_telegram_id, seller_telegram_id, price } = body;

    if (!channel_id || !buyer_telegram_id || !seller_telegram_id || !price) {
      return c.json({
        success: false,
        error: 'Missing required fields: channel_id, buyer_telegram_id, seller_telegram_id, price'
      }, 400);
    }

    console.log(`[Purchase Create] Channel ${channel_id}, Buyer ${buyer_telegram_id}, Price ${price}`);

    // Resolve internal User IDs from Telegram IDs
    const [buyer, seller] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId: buyer_telegram_id.toString() } }),
      prisma.user.findUnique({ where: { telegramId: seller_telegram_id.toString() } })
    ]);

    if (!buyer) {
      return c.json({ success: false, error: 'Buyer not found' }, 404);
    }

    if (!seller) {
      return c.json({ success: false, error: 'Seller not found' }, 404);
    }

    const result = await purchaseService.createPurchase(
      parseInt(channel_id),
      buyer.id,
      seller.id,
      parseFloat(price)
    );

    if (!result.success) {
      return c.json(result, 400);
    }

    return c.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('[Purchase Create] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to create purchase'
    }, 500);
  }
});

/**
 * POST /api/purchases/:purchaseId/confirm
 * Seller confirms channel transfer and triggers auto-verification
 */
app.post('/:purchaseId/confirm', async (c) => {
  try {
    const purchaseId = parseInt(c.req.param('purchaseId'));
    const body = await c.req.json();
    const { seller_telegram_id } = body;

    if (!seller_telegram_id) {
      return c.json({ success: false, error: 'seller_telegram_id is required' }, 400);
    }

    // Get purchase
    const purchase = await (prisma as any).purchase.findUnique({
      where: { id: purchaseId }
    });

    if (!purchase) return c.json({ success: false, error: 'Purchase not found' }, 404);

    // Verify seller
    const seller = await prisma.user.findUnique({
      where: { telegramId: seller_telegram_id.toString() }
    });

    if (!seller || seller.id !== purchase.sellerId) {
      return c.json({ success: false, error: 'Unauthorized: You are not the seller' }, 403);
    }

    // Update purchase with seller confirmation
    let updatedPurchase = await (prisma as any).purchase.update({
      where: { id: purchaseId },
      data: {
        metadata: JSON.stringify({
          ...JSON.parse(purchase.metadata || '{}'),
          sellerConfirmedAt: new Date().toISOString()
        })
      }
    });

    // AUTO-VERIFICATION via Bot
    let successMessage = 'Confirmation received. Verifying ownership transfer via bot...';
    let verified = false;

    try {
      const { TelegramService } = await import('../../services/telegram.service');
      // Use token provided by user or fallback to env
      const token = process.env.TELEGRAM_BOT_TOKEN || '8394677908:AAGXC3vcNPCwTheDnqGKAI5LQl7FEf6LXCc';
      const telegramService = new TelegramService(token);

      const buyer = await prisma.user.findUnique({ where: { id: purchase.buyerId } });
      const metadata = JSON.parse(purchase.metadata || '{}');
      const channelUsername = metadata.channelUsername;

      if (buyer && buyer.telegramId && channelUsername) {
        console.log(`[Auto-Verify] Verifying transfer of @${channelUsername} to buyer ${buyer.telegramId}`);

        // Check if Buyer is now CREATOR
        const result = await telegramService.verifyChannelOwnership(channelUsername, parseInt(buyer.telegramId), true);

        if (result.isOwner) {
          console.log(`[Auto-Verify] ✅ Verification Successful! Completing purchase.`);

          // COMPLETE PURCHASE
          updatedPurchase = await (prisma as any).purchase.update({
            where: { id: purchaseId },
            data: {
              status: 'verified',
              ownershipVerified: true,
              verifiedAt: new Date(),
              metadata: JSON.stringify({
                ...metadata,
                sellerConfirmedAt: new Date().toISOString(),
                botVerifiedAt: new Date().toISOString()
              })
            }
          });

          // Release funds to seller
          // Calculate fee
          const feePercent = FINANCIAL.DEFAULT_PLATFORM_FEE_PERCENT / 100;
          const fee = Math.floor(purchase.price * feePercent);
          const releaseAmount = purchase.price - fee;

          await prisma.user.update({
            where: { id: seller.id },
            data: { balance: { increment: releaseAmount } }
          });

          verified = true;
          successMessage = 'Ownership verified successfully! Transaction completed and funds released.';
        } else {
          console.warn(`[Auto-Verify] ❌ Verification Failed: Buyer is not creator yet.`);
          successMessage = 'Confirmation received. However, the bot detected that the buyer is NOT the owner yet. Please transfer ownership to verify.';
        }
      }
    } catch (e) {
      console.error('[Auto-Verify] Error:', e);
    }

    return c.json({
      success: true,
      message: successMessage,
      data: {
        purchase_id: updatedPurchase.id,
        status: updatedPurchase.status,
        seller_confirmed_at: new Date().toISOString(),
        verified
      }
    });
  } catch (error) {
    console.error('[Purchase Confirm] Error:', error);
    return c.json({ success: false, error: 'Failed to confirm purchase' }, 500);
  }
});
/**
 * POST /api/purchases/:purchaseId/verify
 * Verify purchase ownership and gifts
 */
app.post('/:purchaseId/verify', async (c) => {
  try {
    const purchaseId = parseInt(c.req.param('purchaseId'));
    const body = await c.req.json();
    const { verification_token } = body;

    if (!verification_token) {
      return c.json({
        success: false,
        error: 'verification_token is required'
      }, 400);
    }

    console.log(`[Purchase Verify] Purchase ${purchaseId}`);

    const result = await purchaseService.verifyPurchase(purchaseId, verification_token);

    if (!result.success) {
      return c.json(result, 400);
    }

    return c.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('[Purchase Verify] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to verify purchase'
    }, 500);
  }
});

/**
 * POST /api/purchases/:purchaseId/refund
 * Refund purchase and release held funds
 */
app.post('/:purchaseId/refund', async (c) => {
  try {
    const purchaseId = parseInt(c.req.param('purchaseId'));
    const body = await c.req.json();
    const { reason } = body;

    if (!reason) {
      return c.json({
        success: false,
        error: 'reason is required'
      }, 400);
    }

    console.log(`[Purchase Refund] Purchase ${purchaseId}, Reason: ${reason}`);

    const result = await purchaseService.refundPurchase(purchaseId, reason);

    if (!result.success) {
      return c.json(result, 400);
    }

    return c.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('[Purchase Refund] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to refund purchase'
    }, 500);
  }
});

/**
 * GET /api/users/:userId/warnings
 * Get user warnings and ban status
 */
app.get('/users/:userId/warnings', async (c) => {
  try {
    const userId = parseInt(c.req.param('userId'));

    console.log(`[User Warnings] Fetching warnings for user ${userId}`);

    const result = await purchaseService.getUserWarnings(userId);

    if (!result.success) {
      return c.json(result, 400);
    }

    return c.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('[User Warnings] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch warnings'
    }, 500);
  }
});

export default app;
