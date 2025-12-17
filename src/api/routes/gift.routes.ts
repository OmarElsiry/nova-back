/**
 * Gift Routes
 * Handle gift-related operations
 */
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

const app = new Hono();
const prisma = new PrismaClient();

/**
 * GET /api/gifts/stats
 * Get global gift statistics
 */
app.get('/stats', async (c) => {
  try {
    // Aggregate stats from local database
    const totalGifts = await prisma.channel.aggregate({
      _sum: {
        giftsCount: true
      },
      where: {
        status: { in: ['verified', 'listed', 'sold'] }
      }
    });

    return c.json({
      success: true,
      data: {
        total_gifts: totalGifts._sum.giftsCount || 0,
        total_volume_ton: 0, // Placeholder
        total_volume_usd: 0, // Placeholder
        top_gifts: [] // Placeholder
      }
    });
  } catch (error) {
    console.error('[Gifts Stats] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch gift stats'
    }, 500);
  }
});

/**
 * GET /api/gifts/:username
 * Get gift data by username (channel username)
 * Fetches REAL data from Gifts API: http://151.241.228.83:7085/v1/gifts/:username
 * NO MOCK DATA - ONLY REAL DATA FROM API
 */
app.get('/:username', async (c) => {
  try {
    const username = c.req.param('username');
    const forceRefresh = c.req.query('force_refresh') === 'true';

    console.log(`[Gifts] 🎁 Fetching REAL gifts for username: ${username}, force_refresh: ${forceRefresh}`);

    const giftsApiUrl = process.env.GIFTS_API_URL || 'https://channelsseller.site';

    try {
      // Call the real Gifts API
      // New format: https://channelsseller.site/api/user/:username/nfts
      const targetUrl = `${giftsApiUrl}/api/user/${username}/nfts`;

      console.log(`[Gifts] Calling Gifts API: ${targetUrl}`);
      const response = await fetch(targetUrl, {
        headers: {
          'X-Admin-Password': process.env.GIFTS_API_ADMIN_PASSWORD || 'nova_admin_2024',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[Gifts] ⚠️ User ${username} not found in Gifts API (404). Returning empty list.`);
          return c.json({
            success: true,
            data: {
              username: username,
              total_count: 0,
              total_unique: 0,
              totals_by_name: {},
              total_value_ton: 0,
              total_value_usd: 0,
              upgraded: [],
              unupgraded_can_upgrade: [],
              unupgraded: [],
              gifts: []
            }
          });
        }
        console.error(`[Gifts] ❌ Gifts API returned status ${response.status} for @${username}`);
        return c.json({
          error: `Failed to fetch gifts for @${username}`
        }, 500);
      }

      const apiData = await response.json() as any;
      console.log(`[Gifts] ✅ Received REAL gift data from API:`, JSON.stringify(apiData, null, 2));

      // Helper to transform a single NFT to our internal Gift format
      const transformGift = (nft: any, defaultCategory: string) => ({
        id: nft.id,
        name: nft.gift_name || nft.name,
        supply: nft.supply || 0,
        model: nft.model,
        pattern: nft.pattern || "Standard",
        backdrop: nft.backdrop,
        rarity: nft.rarity,
        mint: nft.mint,
        nft_link: nft.link || nft.nft_link,
        image_path: nft.image || nft.image_path,
        image_url: nft.image || nft.image_path,
        // Map price/value fields for frontend manual calculation fallback
        price_ton: nft.price_ton || nft.value_ton || nft.value || 0,
        price_usd: nft.price_usd || nft.value_usd || 0,
        category: defaultCategory
      });

      const nfts = apiData.data?.nfts || [];
      const regularGifts = apiData.data?.regular_gifts || [];

      // Categorize
      const upgraded = nfts.map((n: any) => transformGift(n, 'upgraded'));
      const unupgraded = regularGifts.map((n: any) => transformGift(n, 'unupgraded'));
      const unupgradedCanUpgrade: any[] = []; // Logic to detect upgradeable gifts if applicable

      // Stats
      const allGifts = [...upgraded, ...unupgraded];
      const totalCount = apiData.data?.total_nfts || allGifts.length;

      const uniqueNames = new Set(allGifts.map(g => g.name));
      const totalsByName: Record<string, number> = {};
      allGifts.forEach(g => {
        if (g.name) totalsByName[g.name] = (totalsByName[g.name] || 0) + 1;
      });

      return c.json({
        success: true,
        data: {
          username: apiData.data?.username || username,
          user_id: apiData.data?.user_id,
          total_count: totalCount,
          total_unique: uniqueNames.size,
          totals_by_name: totalsByName,
          // Pass through the calculated totals from the external API
          total_value_ton: apiData.data?.total_value_ton || 0,
          total_value_usd: apiData.data?.total_value_usd || 0,
          upgraded: upgraded,
          unupgraded_can_upgrade: unupgradedCanUpgrade,
          unupgraded: unupgraded,
          gifts: allGifts
        }
      });
    } catch (apiError) {
      console.error('[Gifts] ❌ Error calling Gifts API:', {
        error: apiError,
        message: apiError instanceof Error ? apiError.message : String(apiError),
        cause: apiError instanceof Error ? apiError.cause : undefined,
        url: `${giftsApiUrl}/v1/gifts/${username}`
      });
      return c.json({
        error: 'Failed to fetch gift data from API',
        details: apiError instanceof Error ? apiError.message : String(apiError)
      }, 500);
    }
  } catch (error) {
    console.error('[Gifts] Error:', error);

    return c.json({
      error: 'Failed to fetch gift data'
    }, 500);
  }
});

/**
 * GET /api/gifts/user/:telegramId
 * Get all gifts for a specific user by their Telegram ID
 * Fetches REAL data from Gifts API: http://151.241.228.83:7085/v1/gifts/user/:telegramId
 * NO MOCK DATA - ONLY REAL DATA FROM API
 */
app.get('/user/:telegramId', async (c) => {
  try {
    const telegramId = c.req.param('telegramId');

    if (!telegramId) {
      return c.json({
        success: false,
        error: 'Telegram ID is required'
      }, 400);
    }

    console.log(`[Gifts] 🎁 Fetching REAL gifts for Telegram user: ${telegramId}`);

    const giftsApiUrl = process.env.GIFTS_API_URL || 'https://channelsseller.site';

    // Fetch from real Gifts API
    try {
      const targetUrl = `${giftsApiUrl}/api/user/${telegramId}/nfts`;

      console.log(`[Gifts] Calling Gifts API: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        headers: {
          'X-Admin-Password': process.env.GIFTS_API_ADMIN_PASSWORD || 'nova_admin_2024',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[Gifts] ⚠️ User ${telegramId} not found in Gifts API (404). Returning empty list.`);
          return c.json({
            success: true,
            data: {
              username: null,
              user_id: telegramId,
              total: 0,
              total_value: 0,
              gifts: []
            }
          });
        }

        console.error(`[Gifts] ❌ Gifts API returned status ${response.status} for user ${telegramId}`);
        return c.json({
          success: false,
          error: `Failed to fetch gifts for user ${telegramId}`
        }, 500);
      }

      const apiData = await response.json() as any;
      console.log(`[Gifts] ✅ Received REAL gift data from API:`, JSON.stringify(apiData, null, 2));

      // Helper to transform a single NFT to our internal Gift format
      const transformGift = (nft: any, defaultCategory: string) => ({
        id: nft.id,
        name: nft.gift_name || nft.name,
        supply: nft.supply || 0,
        model: nft.model,
        pattern: nft.pattern || "Standard",
        backdrop: nft.backdrop,
        rarity: nft.rarity,
        mint: nft.mint,
        nft_link: nft.link || nft.nft_link,
        image_path: nft.image || nft.image_path,
        image_url: nft.image || nft.image_path,
        category: defaultCategory
      });

      const nfts = apiData.data?.nfts || [];
      const regularGifts = apiData.data?.regular_gifts || [];

      // Categorize
      const upgraded = nfts.map((n: any) => transformGift(n, 'upgraded'));
      const unupgraded = regularGifts.map((n: any) => transformGift(n, 'unupgraded'));
      const unupgradedCanUpgrade: any[] = [];

      // Stats
      const allGifts = [...upgraded, ...unupgraded];
      const totalCount = apiData.data?.total_nfts || allGifts.length;

      const uniqueNames = new Set(allGifts.map(g => g.name));
      const totalsByName: Record<string, number> = {};
      allGifts.forEach(g => {
        if (g.name) totalsByName[g.name] = (totalsByName[g.name] || 0) + 1;
      });

      return c.json({
        success: true,
        data: {
          username: apiData.data?.username,
          user_id: apiData.data?.user_id || telegramId,
          total: totalCount,
          total_value: apiData.data?.total_value_ton || 0, // Mapping total value
          gifts: allGifts // Return flat list for useUserGifts.ts
        }
      });
    } catch (apiError) {
      console.error(`[Gifts] ❌ Error calling Gifts API:`, apiError);

      return c.json({
        success: false,
        error: 'Failed to fetch user gifts from API'
      }, 500);
    }
  } catch (error) {
    console.error('[Gifts] Error fetching user gifts:', error);

    return c.json({
      success: false,
      error: 'Failed to fetch user gifts'
    }, 500);
  }
});

/**
 * POST /api/gifts/send
 * Send a gift to another user
 */
app.post('/send', async (c) => {
  try {
    const body = await c.req.json();
    const { from_user_id, to_user_id, gift_id, message } = body;

    if (!from_user_id || !to_user_id || !gift_id) {
      return c.json({
        success: false,
        error: 'from_user_id, to_user_id, and gift_id are required'
      }, 400);
    }

    console.log(`[Gifts] Sending gift ${gift_id} from user ${from_user_id} to user ${to_user_id}`);

    // In production, this would:
    // 1. Verify the sender owns the gift
    // 2. Transfer the gift to the recipient
    // 3. Create a transaction record
    // 4. Send notifications

    const giftTransfer = {
      id: Date.now(),
      from_user_id,
      to_user_id,
      gift_id,
      message: message || null,
      status: 'completed',
      transferred_at: new Date().toISOString()
    };

    return c.json({
      success: true,
      data: giftTransfer,
      message: 'Gift sent successfully'
    });
  } catch (error) {
    console.error('[Gifts] Error sending gift:', error);

    return c.json({
      success: false,
      error: 'Failed to send gift'
    }, 500);
  }
});

export default app;
