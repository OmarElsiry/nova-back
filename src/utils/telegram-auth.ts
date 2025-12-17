import { validate, parse } from '@telegram-apps/init-data-node';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
}

/**
 * Validate Telegram initData
 * @param initData Raw initData string from Telegram WebApp
 * @returns Parsed data if valid, null if invalid
 */
export const validateTelegramData = (initData: string) => {
  try {
    // Validate the signature
    validate(initData, BOT_TOKEN, {
      expiresIn: 24 * 60 * 60 // 24 hours
    });

    // Parse the data
    const data = parse(initData);
    return data;
  } catch (error) {
    console.error('[Telegram Validation] Failed:', error);
    return null;
  }
};

/**
 * Extract user from initData or fallback to direct ID
 * @param initData Optional initData string
 * @param telegramId Optional fallback telegram ID
 * @returns Validated telegram ID or null
 */
export const getValidatedTelegramId = (initData?: string, telegramId?: string): string | null => {
  // 1. Try to validate initData if present
  if (initData) {
    const data = validateTelegramData(initData);
    if (data && data.user && data.user.id) {
      console.log('[Telegram Auth] ✅ Validated signature for user:', data.user.id);
      return data.user.id.toString();
    }
    console.warn('[Telegram Auth] ⚠️ Invalid initData signature provided');
  }

  // 2. Fallback to direct ID (Development/Fallback mode)
  if (telegramId) {
    console.log('[Telegram Auth] ⚠️ Using unverified Telegram ID (Dev/Fallback):', telegramId);
    return telegramId;
  }

  return null;
};
