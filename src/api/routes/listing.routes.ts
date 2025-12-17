/**
 * Listing Routes
 * Handle direct listing operations (cancel, price update)
 * Mounted at /api/listings
 */

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import type { Context } from 'hono';

const app = new Hono();
const prisma = new PrismaClient();

// Helper to get authenticated user from Telegram auth context
const getAuthenticatedUserId = async (c: Context): Promise<number | null> => {
  // The Telegram auth middleware sets the telegramId in the context
  const telegramId = c.get ? c.get('telegramId') : null;
  
  if (!telegramId) {
    return null;
  }

  // Look up the actual user ID from the database
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() }
    });
    
    return user ? user.id : null;
  } catch (error) {
    console.error('[getAuthenticatedUserId] Error looking up user:', error);
    return null;
  }
};

/**
 * POST /api/listings/:listingId/cancel
 * Cancel a marketplace listing
 */
app.post('/:listingId/cancel', async (c) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const listingId = c.req.param('listingId');
    
    // Get authenticated user ID from Telegram auth (set by auth middleware)
    const authenticatedUserId = await getAuthenticatedUserId(c);
    
    if (!authenticatedUserId) {
      console.warn(`[Cancel Listing] ❌ No authenticated user found`);
      return c.json({
        success: false,
        error: 'Authentication required'
      }, 401);
    }
    
    console.log(`[Cancel Listing] Request to cancel listing ${listingId} by user ${authenticatedUserId}`);
    
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
    
    // Verify user owns the channel using authenticated user ID
    const isOwner = channel.userId === authenticatedUserId;
    
    if (!isOwner) {
      console.warn(`[Cancel Listing] ❌ User ${authenticatedUserId} does not own listing ${listingId}`);
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

/**
 * PUT /api/listings/:listingId/price
 * Update listing price
 */
app.put('/:listingId/price', async (c) => {
  try {
    const listingId = c.req.param('listingId');
    const { price } = await c.req.json();
    
    if (!price || price <= 0) {
      return c.json({
        success: false,
        error: 'Valid price is required'
      }, 400);
    }
    
    console.log('[Update Listing Price] Request for listing:', listingId, 'new price:', price);
    
    // Find the channel (listing)
    const channel = await prisma.channel.findUnique({
      where: { id: parseInt(listingId) }
    });
    
    if (!channel) {
      return c.json({
        success: false,
        error: 'Listing not found'
      }, 404);
    }
    
    // Update the price
    await prisma.channel.update({
      where: { id: parseInt(listingId) },
      data: {
        askingPrice: price
      }
    });
    
    console.log(`[Update Listing Price] Successfully updated listing ${listingId} to price ${price}`);
    
    return c.json({
      success: true,
      message: 'Price updated successfully',
      data: {
        id: listingId,
        price: price
      }
    });
  } catch (error) {
    console.error('[Update Listing Price] Error:', error);
    
    return c.json({
      success: false,
      error: 'Failed to update price'
    }, 500);
  }
});

export default app;
