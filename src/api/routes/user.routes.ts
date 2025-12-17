import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { UserService } from '../../services/UserService';
import { TelegramUserService } from '../../services/TelegramUserService';
import { validate, parse } from '@telegram-apps/init-data-node';
import { generateWallet } from '../../services/wallet.service';
import { getUserFromContext } from '../../utils/auth-helpers';

const app = new Hono();
const prisma = new PrismaClient();
const userService = new UserService(prisma);
const telegramUserService = new TelegramUserService(prisma);

// Validation schemas
const updateWalletSchema = z.object({
  walletAddress: z.string().min(1)
});

/**
 * POST /api/users/register-telegram
 * Register or login user with Telegram initData
 * (Uses robust validation from HEAD)
 */
app.post('/register-telegram', async (c) => {
  try {
    const body = await c.req.json();
    const { init_data } = body;

    if (!init_data) {
      return c.json({
        success: false,
        error: 'init_data is required'
      }, 400);
    }

    console.log('[TelegramAuth] Received init_data payload', {
      preview: init_data.slice(0, 150) + '...',
      length: init_data.length
    });

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return c.json({
        success: false,
        error: 'Server configuration error'
      }, 500);
    }

    // Validate initData signature
    try {
      validate(init_data, BOT_TOKEN, {
        expiresIn: 7 * 24 * 60 * 60 // 7 days
      });
    } catch (error) {
      return c.json({
        success: false,
        error: 'Invalid or expired Telegram authentication'
      }, 401);
    }

    // Parse verified data
    const parsed = parse(init_data);
    if (!parsed.user) {
      return c.json({
        success: false,
        error: 'No user data in initData'
      }, 401);
    }

    const startParam = parsed.start_param;
    const telegramId = parsed.user.id.toString();

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      const wallet = generateWallet();

      let referrerId: number | null = null;
      if (startParam && startParam.startsWith('ref_')) {
        const refId = parseInt(startParam.replace('ref_', ''), 10);
        if (!isNaN(refId) && refId.toString() !== telegramId) {
          const referrer = await prisma.user.findUnique({ where: { telegramId: refId.toString() } });
          if (referrer) referrerId = referrer.id;
        }
      }

      user = await prisma.user.create({
        data: {
          telegramId,
          username: (parsed.user as any).username,
          firstName: (parsed.user as any).firstName,
          lastName: (parsed.user as any).lastName,
          languageCode: (parsed.user as any).languageCode,
          photoUrl: (parsed.user as any).photoUrl,
          walletAddress: wallet.address,
          walletAddressVariants: JSON.stringify(wallet.variants),
          balance: 0,
          role: 'user',
          referrerId
        }
      });
      console.log('✅ New user created:', user.id);
    } else {
      // Sync latest profile info
      await prisma.user.update({
        where: { id: user.id },
        data: {
          username: (parsed.user as any).username,
          firstName: (parsed.user as any).firstName,
          lastName: (parsed.user as any).lastName,
          languageCode: (parsed.user as any).languageCode,
          photoUrl: (parsed.user as any).photoUrl
        }
      });
    }

    return c.json({
      success: true,
      data: {
        initData: init_data,
        user: {
          id: user.id,
          telegramId: user.telegramId,
          username: user.username,
          walletAddress: user.walletAddress,
          balance: user.balance,
          role: user.role,
          photoUrl: user.photoUrl
        }
      }
    });
  } catch (error) {
    console.error('Error in register-telegram:', error);
    return c.json({
      success: false,
      error: 'Registration failed'
    }, 500);
  }
});

/**
 * GET /api/users/profile/:telegramId
 * Get public user profile
 */
app.get('/profile/:telegramId', async (c) => {
  try {
    const telegramId = c.req.param('telegramId');
    const user = await userService.getUserByTelegramId(telegramId);

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    // Sanitize user data for public view
    return c.json({
      success: true,
      data: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        photoUrl: user.photoUrl,
        createdAt: user.createdAt,
        channelCount: user.channels.length,
        transactionCount: user.transactions.length
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({ success: false, error: 'Failed to get profile' }, 500);
  }
});

/**
 * POST /api/users/link-wallet
 * Link TON wallet to user account
 */
app.post('/link-wallet', async (c) => {
  try {
    // Support both middleware contexts
    const telegramUser = c.get('telegramUser');
    let userId: number;

    if (telegramUser) {
      userId = telegramUser.id;
    } else {
      // Fallback to manual auth if middleware didn't populate
      const user = await getUserFromContext(c, prisma);
      userId = user.id;
    }

    const body = await c.req.json();
    const validation = updateWalletSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ success: false, error: 'Invalid wallet address' }, 400);
    }

    const { walletAddress } = validation.data;
    const updated = await userService.updateUserWallet(userId, walletAddress);

    return c.json({
      success: true,
      data: {
        userId: updated.id,
        walletAddress: updated.walletAddress
      }
    });
  } catch (error) {
    console.error('Link wallet error:', error);
    return c.json({ success: false, error: 'Failed to link wallet' }, 500);
  }
});

/**
 * GET /api/users/stats
 * Get current user stats
 */
app.get('/stats', async (c) => {
  try {
    const telegramUser = c.get('telegramUser');
    let userId: number;

    if (telegramUser) {
      userId = telegramUser.id;
    } else {
      const user = await getUserFromContext(c, prisma);
      userId = user.id;
    }

    const stats = await userService.getUserStats(userId);

    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    return c.json({ success: false, error: 'Failed to get stats' }, 500);
  }
});

/**
 * GET /api/users/top-traders
 * Get top traders
 */
app.get('/top-traders', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const traders = await userService.getTopTraders(limit);
    return c.json({ success: true, data: traders });
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch top traders' }, 500);
  }
});

export default app;
