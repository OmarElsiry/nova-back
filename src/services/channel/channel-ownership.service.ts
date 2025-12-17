import { env } from '../../config';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export class OwnershipVerificationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'OwnershipVerificationError';
    this.statusCode = statusCode;
  }
}

interface TelegramChatMember {
  status: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class ChannelOwnershipService {
  private botToken: string | undefined;

  constructor() {
    this.botToken = env.telegramBotToken;
  }

  async verifyOwnership(channelUsername: string, userTelegramId: string): Promise<void> {
    if (!this.botToken) {
      throw new OwnershipVerificationError(
        'Ownership verification is not configured. Set TELEGRAM_BOT_TOKEN in the backend environment.',
        500
      );
    }

    const chatId = channelUsername.startsWith('@') ? channelUsername : `@${channelUsername}`;
    const payload = {
      chat_id: chatId,
      user_id: userTelegramId,
    };

    const response = await fetch(`${TELEGRAM_API_BASE}/bot${this.botToken}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as TelegramApiResponse<TelegramChatMember>;
    if (!response.ok || !data?.ok) {
      const description = data?.description || 'Unable to verify ownership via Telegram';
      throw new OwnershipVerificationError(description);
    }

    const userStatus = data.result?.status;
    const isOwnerOrAdmin = userStatus === 'creator' || userStatus === 'administrator';

    if (!isOwnerOrAdmin) {
      throw new OwnershipVerificationError(
        `User ${userTelegramId} is not an owner or administrator of channel ${channelUsername}`
      );
    }
  }
}
