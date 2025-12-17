/**
 * Listings Routes
 * Handle marketplace listing operations
 */

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

const app = new Hono();
const prisma = new PrismaClient();

/**
 * GET /api/listings
 * List all listings (test endpoint)
 */
app.get('/', async (c) => {
  console.log('[Listings] GET / endpoint called');
  return c.json({
    success: true,
    message: 'Listings endpoint is working'
  });
});

/**
 * POST /api/listings/:listingId/cancel
 * Cancel a channel listing
 */
app.post('/:listingId/cancel', async (c) => {
  try {
    const listingId = c.req.param('listingId');
    let body = {};
    
    try {
      body = await c.req.json();
    } catch (e) {
      // Empty body is ok
    }
    
    console.log(`[Cancel Listing] Request to cancel listing ${listingId}`);
    
    // Find the channel (listing)
    const channel = await prisma.channel.findUnique({
      where: { id: parseInt(listingId) }
    });
    
    if (!channel) {
      console.warn(`[Cancel Listing] ❌ Listing not found: ${listingId}`);
      return c.json({
        success: false,
        error: 'Listing not found'
      }, 404);
    }
    
    // Verify user owns the channel
    const userId = (body as any).seller_id || (body as any).user_id;
    let isOwner = channel.userId === userId;
    
    if (!isOwner && userId) {
      // Try to find user by telegram ID
      const user = await prisma.user.findUnique({
        where: { telegramId: userId.toString() }
      });
      
      if (user && user.id === channel.userId) {
        isOwner = true;
      }
    }
    
    if (!isOwner) {
      console.warn(`[Cancel Listing] ❌ User ${userId} does not own listing ${listingId}`);
      return c.json({
        success: false,
        error: 'You do not own this listing'
      }, 403);
    }
    
    // Remove from marketplace by setting askingPrice to null
    const updatedChannel = await prisma.channel.update({
      where: { id: parseInt(listingId) },
      data: {
        askingPrice: null,
        status: 'verified' // Change status back to verified
      }
    });
    
    console.log(`[Cancel Listing] ✅ Successfully cancelled listing ${listingId}`);
    
    return c.json({
      success: true,
      message: 'Listing cancelled successfully',
      data: {
        listing_id: updatedChannel.id,
        channel_id: updatedChannel.id,
        channel_username: updatedChannel.username,
        status: updatedChannel.status,
        cancelled_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Cancel Listing] Error:', error);
    
    return c.json({
      success: false,
      error: 'Failed to cancel listing'
    }, 500);
  }
});

export default app;
