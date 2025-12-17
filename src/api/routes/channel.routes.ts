/**
 * Channel Routes
 * Handle channel trading operations
 */
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import TelegramService from '../../services/telegram.service';
import type { AuthenticatedUser } from '../middleware/telegram-auth.middleware';
import { calculateGiftFlags } from '../../utils/giftUtils';

const app = new Hono();
const prisma = new PrismaClient();
const telegramService = new TelegramService();

/**
 * GET /api/channels
 * List available channels for trading
 */
app.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const channels = await prisma.channel.findMany({
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.channel.count();

    return c.json({
      success: true,
      data: {
        channels,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    });
  } catch (error) {
    console.error('List channels error:', error);
    return c.json({ success: false, error: 'Failed to list channels' }, 500);
  }
});

/**
 * POST /api/channels/:id/sync
 * Manually sync gifts for a channel from external API
 */
app.post('/:id/sync', async (c) => {
  try {
    const channelId = parseInt(c.req.param('id'));
    if (isNaN(channelId)) return c.json({ success: false, error: 'Invalid ID' }, 400);

    const { MarketplaceSearchService } = await import('../../services/marketplace/marketplace-search.service');
    const searchService = new MarketplaceSearchService(prisma);

    await searchService.syncChannelGifts(channelId);

    return c.json({ success: true, message: 'Sync started' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

/**
 * GET /api/channels/my-channels
 * Get user's channels by telegram ID
 */
app.get('/my-channels', async (c) => {
  try {
    const telegramId = c.req.query('telegram_id');

    if (!telegramId) {
      return c.json({
        success: false,
        error: 'telegram_id is required'
      }, 400);
    }

    // Find user by telegram ID
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        channels: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }

    // Add channel_username field for frontend compatibility and calculate value
    const formattedChannels = (user.channels || []).map(channel => {
      let gifts: any[] = [];
      let totalValueTon = 0;
      let totalValueUsd = 0;

      try {
        if (channel.giftsJson) {
          const parsedGifts = JSON.parse(channel.giftsJson);

          // Handle both array and object structure (legacy vs new)
          if (Array.isArray(parsedGifts)) {
            gifts = parsedGifts;
          } else if (parsedGifts && typeof parsedGifts === 'object') {
            // Handle structure like { nfts: [...], regular_gifts: [...] }
            const nfts = Array.isArray(parsedGifts.nfts) ? parsedGifts.nfts : [];
            const regular = Array.isArray(parsedGifts.regular_gifts) ? parsedGifts.regular_gifts : [];
            const giftList = Array.isArray(parsedGifts.gifts) ? parsedGifts.gifts : [];

            gifts = [...nfts, ...regular, ...giftList];
          }

          if (gifts.length > 0) {
            // Calculate total value from gifts - handle potential string/number mismatches
            totalValueTon = gifts.reduce((acc: number, gift: any) => {
              const price = parseFloat(gift.price_ton || gift.value || 0);
              return acc + (isNaN(price) ? 0 : price);
            }, 0);

            totalValueUsd = gifts.reduce((acc: number, gift: any) => {
              const price = parseFloat(gift.price_usd || 0);
              return acc + (isNaN(price) ? 0 : price);
            }, 0);
          }
        }
      } catch (e) {
        console.error(`Error parsing gifts for channel ${channel.username}:`, e);
      }

      return {
        ...channel,
        channel_username: channel.username, // Frontend expects channel_username
        gifts: gifts,
        gifts_count: gifts.length, // Ensure count is accurate
        total_value_ton: parseFloat(totalValueTon.toFixed(2)),
        total_value_usd: parseFloat(totalValueUsd.toFixed(2))
      };
    });

    return c.json({
      success: true,
      data: {
        channels: formattedChannels,
        total: formattedChannels.length
      }
    });
  } catch (error) {
    console.error('[GET /my-channels] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch channels'
    }, 500);
  }
});

/**
 * GET /api/channels/listings
 * Get channel listings for a specific user
 */
app.get('/listings', async (c) => {
  try {
    const telegramId = c.req.query('telegram_id');

    if (!telegramId) {
      return c.json({
        success: false,
        error: 'telegram_id is required'
      }, 400);
    }

    console.log('[Channel Listings] Request for telegram_id:', telegramId);

    // Find user first
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }

    // Get user's channels that are listed for sale
    const listings = await prisma.channel.findMany({
      where: {
        userId: user.id,
        askingPrice: { not: null }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true
          }
        },
        reviews: {
          select: {
            rating: true
          }
        }
      }
    });

    const formattedListings = listings.map((listing: any) => {
      const avgRating = listing.reviews.length > 0
        ? listing.reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / listing.reviews.length
        : 0;

      return {
        id: listing.id,
        channel_id: listing.id,
        username: listing.username,
        channel_username: listing.username,
        status: listing.status,
        asking_price: listing.askingPrice,
        askingPrice: listing.askingPrice,
        price: listing.askingPrice,
        featuredGiftImageUrl: listing.featuredGiftImageUrl,
        giftsCount: listing.giftsCount,
        gifts_count: listing.giftsCount,
        giftsJson: JSON.parse(listing.giftsJson || '[]'),
        gifts: (() => {
          try {
            const parsed = JSON.parse(listing.giftsJson || '[]');
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === 'object') {
              const nfts = Array.isArray(parsed.nfts) ? parsed.nfts : [];
              const regular = Array.isArray(parsed.regular_gifts) ? parsed.regular_gifts : [];
              const gl = Array.isArray(parsed.gifts) ? parsed.gifts : [];
              return [...nfts, ...regular, ...gl];
            }
            return [];
          } catch { return []; }
        })(),
        createdAt: listing.createdAt,
        created_at: listing.createdAt,
        updatedAt: listing.updatedAt,
        is_verified: listing.status === 'verified',
        has_pending_transaction: false, // TODO: Check for pending transactions
        pending_transaction_id: null,
        channel: {
          id: listing.id,
          channel_id: listing.id,
          channel_username: listing.username,
          is_verified: listing.status === 'verified',
          created_at: listing.createdAt
        },
        seller: {
          id: listing.user.id,
          telegramId: listing.user.telegramId
        },
        rating: {
          average: Math.round(avgRating * 10) / 10,
          count: listing.reviews.length
        }
      };
    });

    console.log(`[Channel Listings] Found ${formattedListings.length} listings for user ${telegramId}`);

    return c.json({
      success: true,
      listings: formattedListings,
      count: formattedListings.length
    });
  } catch (error) {
    console.error('[Channel Listings] Error:', error);

    return c.json({
      success: false,
      error: 'Failed to fetch channel listings'
    }, 500);
  }
});

/**
 * DELETE /api/channels/delete/:id
 * Delete a channel by ID
 */
app.delete('/delete/:id', async (c) => {
  try {
    const channelId = parseInt(c.req.param('id'));

    if (!channelId || isNaN(channelId)) {
      return c.json({
        success: false,
        error: 'Invalid channel ID'
      }, 400);
    }

    console.log('[Channel Delete] Deleting channel:', channelId);

    // Find the channel first
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { user: true }
    });

    if (!channel) {
      return c.json({
        success: false,
        error: 'Channel not found'
      }, 404);
    }

    // Check if channel is held in escrow (has active purchase)
    const activePurchase = await (prisma as any).purchase.findFirst({
      where: {
        channelId: channelId,
        status: 'held'
      }
    });

    if (activePurchase) {
      return c.json({
        success: false,
        error: 'Cannot delete channel: Channel is currently held in escrow due to an active purchase'
      }, 403);
    }

    // Authorization check
    const user = c.get('telegramUser') as AuthenticatedUser;
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    if (channel.userId !== user.dbId) {
      // Also allow admins to delete channels
      if (user.role !== 'admin' && user.role !== 'superadmin') {
        return c.json({
          success: false,
          error: 'Unauthorized: You do not own this channel'
        }, 403);
      }
    }

    // Delete the channel (cascade will handle related records)
    await prisma.channel.delete({
      where: { id: channelId }
    });

    console.log('[Channel Delete] Successfully deleted channel:', channelId);

    return c.json({
      success: true,
      message: 'Channel deleted successfully',
      deletedChannel: {
        id: channel.id,
        username: channel.username
      }
    });
  } catch (error) {
    console.error('[Channel Delete] Error:', error);

    return c.json({
      success: false,
      error: 'Failed to delete channel'
    }, 500);
  }
});

/**
 * POST /api/channels/verify-with-gifts
 * Verify a channel and extract gifts data
 */
app.post('/verify-with-gifts', async (c) => {
  try {
    const body = await c.req.json();
    const { channel_username, owner_username, owner_telegram_id } = body;

    if (!channel_username || !owner_telegram_id) {
      return c.json({
        success: false,
        error: 'channel_username and owner_telegram_id are required'
      }, 400);
    }

    console.log('[Channel Verification] Verifying channel:', channel_username, 'for user:', owner_telegram_id);

    // Basic validation for channel username
    // Telegram channel usernames must:
    // - Be at least 5 characters long
    // - Start with a letter
    // - Contain only letters, numbers, and underscores
    const channelRegex = /^[a-zA-Z][a-zA-Z0-9_]{4,}$/;

    if (!channelRegex.test(channel_username)) {
      return c.json({
        success: false,
        error: 'Invalid channel username. Must be at least 5 characters, start with a letter, and contain only letters, numbers, and underscores.'
      }, 400);
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { telegramId: owner_telegram_id.toString() }
    });

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 404);
    }

    // Check if channel already exists
    const existingChannel = await prisma.channel.findFirst({
      where: {
        username: channel_username,
        userId: user.id
      }
    });

    if (existingChannel) {
      return c.json({
        success: true,
        channel: {
          id: existingChannel.id,
          username: existingChannel.username,
          channel_username: existingChannel.username, // Frontend expects this
          status: existingChannel.status,
          gifts: JSON.parse(existingChannel.giftsJson || '[]'),
          giftsCount: existingChannel.giftsCount
        },
        message: 'Channel already verified'
      });
    }

    // CRITICAL: Verify channel ownership using Telegram Bot API
    console.log('[Channel Verification] Verifying ownership via Telegram Bot API...');
    const verificationResult = await telegramService.verifyChannelOwnership(
      channel_username,
      owner_telegram_id
    );

    if (!verificationResult.isOwner) {
      console.warn('[Channel Verification] User is NOT the owner of channel @' + channel_username);
      return c.json({
        success: false,
        error: `You are not an admin/owner of the channel @${channel_username}. Only channel owners can add their channels to Nova.`
      }, 403);
    }

    console.log('[Channel Verification] ✅ Ownership verified for @' + channel_username);
    console.log('[Channel Verification] Channel owner username:', verificationResult.ownerUsername);

    // Fetch REAL gifts from the Gifts API - NO MOCK DATA!
    let finalGifts: any[] = [];
    const giftsApiUrl = process.env.GIFTS_API_URL || 'https://channelsseller.site';

    if (giftsApiUrl) {
      try {
        console.log('[Channel Verification] 🎁 Fetching REAL gifts from Gifts API:', giftsApiUrl, 'for channel:', channel_username);

        // Call the real Gifts API endpoint: GET /user/:username/nfts
        const giftsResponse = await fetch(`${giftsApiUrl}/user/${channel_username}/nfts`, {
          headers: {
            'X-Admin-Password': process.env.GIFTS_API_ADMIN_PASSWORD || 'nova_admin_2024'
          }
        });

        if (giftsResponse.ok) {
          const giftsData = await giftsResponse.json() as any;
          console.log('[Channel Verification] ✅ Gifts API response received:', JSON.stringify(giftsData, null, 2));

          // Extract gifts from new API structure: nfts (upgraded) and regular_gifts
          const allGifts: any[] = [];

          // Add NFTs (upgraded gifts)
          if (giftsData.data && giftsData.data.nfts && Array.isArray(giftsData.data.nfts)) {
            console.log(`[Channel Verification] Found ${giftsData.data.nfts.length} NFTs`);
            allGifts.push(...giftsData.data.nfts.map((gift: any) => ({
              id: gift.id,
              name: gift.gift_name,
              model: gift.model,
              backdrop: gift.backdrop,
              rarity: gift.rarity,
              mint: gift.mint,
              image_path: gift.image,
              price_ton: gift.price_ton,
              price_usd: gift.price_usd,
              category: 'upgraded'
            })));
          }

          // Add regular gifts
          if (giftsData.data && giftsData.data.regular_gifts && Array.isArray(giftsData.data.regular_gifts)) {
            console.log(`[Channel Verification] Found ${giftsData.data.regular_gifts.length} regular gifts`);
            allGifts.push(...giftsData.data.regular_gifts.map((gift: any) => ({
              id: gift.id,
              name: gift.short_name || gift.full_name,
              supply: gift.supply,
              image_url: gift.image_url,
              price_ton: gift.price_ton,
              price_usd: gift.price_usd,
              total_ton: gift.total_ton,
              total_usd: gift.total_usd,
              multiplier: gift.multiplier,
              change_24h: gift.change_24h,
              category: 'regular'
            })));
          }

          finalGifts = allGifts;
          console.log(`[Channel Verification] ✅ Extracted ${finalGifts.length} REAL gifts from API for @${channel_username}`);

          if (giftsData.data) {
            console.log(`[Channel Verification] 💰 Total Value: ${giftsData.data.total_value_ton} TON ($${giftsData.data.total_value_usd})`);
          }

        } else {
          console.warn('[Channel Verification] ⚠️ Gifts API returned status:', giftsResponse.status);
          console.warn('[Channel Verification] ⚠️ No gifts found for channel @' + channel_username);
        }
      } catch (error) {
        console.error('[Channel Verification] ❌ Error fetching gifts from API:', error);
        console.error('[Channel Verification] ❌ Make sure GIFTS_API_URL is correct and accessible');
      }
    } else {
      console.warn('[Channel Verification] ⚠️ GIFTS_API_URL not configured - cannot fetch real gifts');
    }

    // IMPORTANT: Use REAL gifts from API - NO FALLBACK TO MOCK DATA
    if (finalGifts.length === 0) {
      console.warn('[Channel Verification] ⚠️ WARNING: No gifts found from API for @' + channel_username);
      console.warn('[Channel Verification] ⚠️ Channel will be created with ZERO gifts');
    }

    // Create new channel
    const newChannel = await prisma.channel.create({
      data: {
        userId: user.id,
        username: channel_username,
        status: 'verified',
        giftsJson: JSON.stringify(finalGifts),
        giftsCount: finalGifts.length,
        askingPrice: null, // Not listed for sale initially
        ...calculateGiftFlags(JSON.stringify(finalGifts))
      }
    });

    console.log('[Channel Verification] Channel verified successfully:', newChannel.username, 'with', finalGifts.length, 'gifts');

    return c.json({
      success: true,
      channel: {
        id: newChannel.id,
        username: newChannel.username,
        channel_username: newChannel.username, // Frontend expects this
        status: newChannel.status,
        gifts: finalGifts,
        giftsCount: finalGifts.length
      },
      message: 'Channel verified successfully'
    });
  } catch (error) {
    console.error('[Channel Verification] Error:', error);

    return c.json({
      success: false,
      error: 'Failed to verify channel'
    }, 500);
  }
});

/**
 * GET /api/channels/marketplace-listings
 * Get marketplace channel listings with filtering
 */
app.get('/marketplace-listings', async (c) => {
  try {
    const type = c.req.query('type');
    const category = c.req.query('category');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    console.log('[Channel Marketplace Listings] Request:', { type, category, limit, offset });

    // Build where clause
    const where: any = {
      status: { in: ['verified', 'listed'] },
      askingPrice: { not: null }
    };

    // Add type filtering (auction, fixed-price, etc.)
    if (type) {
      // For now, we'll treat all as general listings
      // In the future, you can add a 'listingType' field to the Channel model
      console.log(`[Channel Marketplace Listings] Filtering by type: ${type}`);
    }

    const [channels, total] = await Promise.all([
      prisma.channel.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              telegramId: true
            }
          },
          reviews: {
            select: {
              rating: true
            }
          }
        }
      }),
      prisma.channel.count({ where })
    ]);

    const formattedChannels = channels.map(channel => {
      // Parse gifts JSON if it exists
      let gifts = [];
      if (channel.giftsJson) {
        try {
          gifts = JSON.parse(channel.giftsJson);
        } catch (e) {
          console.error('Error parsing gifts JSON:', e);
        }
      }

      // Calculate average rating
      const avgRating = channel.reviews.length > 0
        ? channel.reviews.reduce((sum, r) => sum + r.rating, 0) / channel.reviews.length
        : 0;

      return {
        ...channel,
        channel_username: channel.username, // Add frontend-expected field
        gifts: gifts,
        updatedAt: channel.updatedAt,
        listingType: type || 'general', // Default listing type
        seller: {
          id: channel.user.id,
          telegramId: channel.user.telegramId
        },
        rating: {
          average: Math.round(avgRating * 10) / 10,
          count: channel.reviews.length
        }
      };
    });

    console.log(`[Channel Marketplace Listings] Found ${formattedChannels.length} of ${total} channels`);

    return c.json({
      success: true,
      data: {
        channels: formattedChannels,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + formattedChannels.length < total,
          totalPages: Math.ceil(total / limit),
          currentPage: Math.floor(offset / limit) + 1
        },
        filters: {
          type,
          category
        }
      }
    });
  } catch (error) {
    console.error('[Channel Marketplace Listings] Error:', error);

    return c.json({
      success: false,
      error: 'Failed to fetch channel marketplace listings'
    }, 500);
  }
});

/**
 * POST /api/channels/create-listing
 * Create a channel listing for sale
 */
app.post('/create-listing', async (c) => {
  try {
    const body = await c.req.json();
    console.log('[Create Listing] Received body:', body);

    let { channel_id, seller_id, price } = body;

    // Type conversion
    if (channel_id) channel_id = parseInt(channel_id);
    if (price) price = parseFloat(price);
    // seller_id might be string (telegramId) or int (dbId), keep as is for now but handle in logic

    if (!channel_id || !seller_id || price === undefined) {
      console.error('[Create Listing] Missing required fields:', { channel_id, seller_id, price });
      return c.json({
        success: false,
        error: 'channel_id, seller_id, and price are required'
      }, 400);
    }

    console.log(`[Create Listing] Creating listing for channel ${channel_id} at price ${price}`);

    // Find the channel
    const channel = await prisma.channel.findUnique({
      where: { id: channel_id }
    });

    if (!channel) {
      return c.json({
        success: false,
        error: 'Channel not found'
      }, 404);
    }

    // Verify seller owns the channel
    // seller_id can be either user ID or telegram ID, so check both
    let isOwner = channel.userId === seller_id;

    // Also verify against the authenticated user context
    const authUser = c.get('telegramUser') as AuthenticatedUser;
    if (!authUser) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    // If seller_id is provided, it must match the authenticated user
    // We support both DB ID and Telegram ID for seller_id
    if (seller_id !== authUser.dbId && seller_id.toString() !== authUser.id.toString()) {
      return c.json({
        success: false,
        error: 'Unauthorized: You cannot create a listing for another user'
      }, 403);
    }

    // Verify the channel belongs to the authenticated user
    if (channel.userId !== authUser.dbId) {
      return c.json({
        success: false,
        error: 'Unauthorized: You do not own this channel'
      }, 403);
    }

    // Redundant check but kept for logic consistency with original code structure
    if (authUser.dbId === channel.userId) {
      isOwner = true;
    }

    if (!isOwner) {
      console.warn(`[Create Listing] ❌ User ${seller_id} does not own channel ${channel_id}`);
      return c.json({
        success: false,
        error: 'You do not own this channel'
      }, 403);
    }

    console.log(`[Create Listing] ✅ Verified ownership for channel ${channel_id}`);

    console.log(`[Create Listing] ✅ Verified ownership for channel ${channel_id}`);

    // Check if gifts are missing and fetch them
    if (!channel.giftsCount || channel.giftsCount === 0) {
      console.log(`[Create Listing] ⚠️ Channel ${channel.username} has 0 gifts. Attempting to fetch from external API...`);
      const giftsApiUrl = process.env.GIFTS_API_URL || 'https://channelsseller.site';

      try {
        const giftsResponse = await fetch(`${giftsApiUrl}/api/user/${channel.username}/nfts`, {
          headers: {
            'X-Admin-Password': process.env.GIFTS_API_ADMIN_PASSWORD || 'nova_admin_2024',
            'Accept': 'application/json'
          }
        });

        if (giftsResponse.ok) {
          const giftsData = await giftsResponse.json() as any;

          if (giftsData.data) {
            const allGifts: any[] = [];

            // Add NFTs (upgraded gifts)
            if (giftsData.data.nfts && Array.isArray(giftsData.data.nfts)) {
              allGifts.push(...giftsData.data.nfts.map((gift: any) => ({
                id: gift.id,
                name: gift.gift_name,
                model: gift.model,
                backdrop: gift.backdrop,
                rarity: gift.rarity,
                mint: gift.mint,
                image_path: gift.image,
                price_ton: gift.price_ton,
                price_usd: gift.price_usd,
                category: 'upgraded'
              })));
            }

            // Add regular gifts
            if (giftsData.data.regular_gifts && Array.isArray(giftsData.data.regular_gifts)) {
              allGifts.push(...giftsData.data.regular_gifts.map((gift: any) => ({
                id: gift.id,
                name: gift.short_name || gift.full_name,
                supply: gift.supply,
                image_url: gift.image_url,
                price_ton: gift.price_ton,
                price_usd: gift.price_usd,
                total_ton: gift.total_ton,
                total_usd: gift.total_usd,
                multiplier: gift.multiplier,
                change_24h: gift.change_24h,
                category: 'regular'
              })));
            }

            if (allGifts.length > 0) {
              console.log(`[Create Listing] ✅ Fetched ${allGifts.length} gifts. Updating channel records.`);
              await prisma.channel.update({
                where: { id: channel_id },
                data: {
                  giftsJson: JSON.stringify(allGifts),
                  giftsCount: allGifts.length,
                  ...calculateGiftFlags(JSON.stringify(allGifts))
                } as any // cast for stale types
              });
            }
          }
        }
      } catch (err) {
        console.error(`[Create Listing] Failed to auto-fetch gifts:`, err);
      }
    }

    // Check if already listed
    if (channel.askingPrice !== null && channel.status === 'listed') {
      // If already listed, we allow updating the price
      console.log(`[Create Listing] Channel ${channel_id} is already listed. Updating price.`);
    }

    // Validate price
    if (price < 0.1 || price > 10000) {
      console.error(`[Create Listing] Invalid price: ${price}`);
      return c.json({
        success: false,
        error: 'Price must be between 0.1 and 10000 TON'
      }, 400);
    }

    // Update channel with listing price
    const updatedChannel = await prisma.channel.update({
      where: { id: channel_id },
      data: {
        askingPrice: price,
        status: 'listed'
      },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            walletAddress: true
          }
        }
      }
    });

    console.log(`[Create Listing] ✅ Listing created/updated for channel ${channel_id} at ${price} TON`);

    return c.json({
      success: true,
      data: {
        listing_id: updatedChannel.id,
        channel_id: updatedChannel.id,
        channel_username: updatedChannel.username,
        price: updatedChannel.askingPrice,
        status: updatedChannel.status,
        seller_id: updatedChannel.userId,
        created_at: updatedChannel.createdAt
      }
    });
  } catch (error) {
    console.error('[Create Listing] Error:', error);

    return c.json({
      success: false,
      error: 'Failed to create listing'
    }, 500);
  }
});

export default app;
