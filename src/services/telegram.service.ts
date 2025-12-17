/**
 * Telegram Bot Service
 * Verifies channel ownership and retrieves channel information using Telegram Bot API
 */

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChatMember {
  user: TelegramUser;
  status: string;
  is_member?: boolean;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export class TelegramService {
  private botToken: string;
  private apiUrl = 'https://api.telegram.org';

  constructor(botToken?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
    }
  }

  /**
   * Get chat information by username
   */
  async getChat(channelUsername: string): Promise<TelegramChat | null> {
    try {
      const response = await fetch(
        `${this.apiUrl}/bot${this.botToken}/getChat?chat_id=@${channelUsername}`
      );

      if (!response.ok) {
        console.warn(`[Telegram] Failed to get chat info for @${channelUsername}:`, response.status);
        return null;
      }

      const data = await response.json() as any;

      if (data.ok && data.result) {
        console.log(`[Telegram] Got chat info for @${channelUsername}:`, {
          id: data.result.id,
          type: data.result.type,
          title: data.result.title,
          username: data.result.username
        });
        return data.result;
      }

      return null;
    } catch (error) {
      console.error(`[Telegram] Error getting chat info for @${channelUsername}:`, error);
      return null;
    }
  }

  /**
   * Get chat administrators to verify ownership
   */
  async getChatAdministrators(channelUsername: string): Promise<TelegramChatMember[]> {
    try {
      const response = await fetch(
        `${this.apiUrl}/bot${this.botToken}/getChatAdministrators?chat_id=@${channelUsername}`
      );

      if (!response.ok) {
        console.warn(`[Telegram] Failed to get administrators for @${channelUsername}:`, response.status);
        return [];
      }

      const data = await response.json() as any;

      if (data.ok && Array.isArray(data.result)) {
        console.log(`[Telegram] Got ${data.result.length} administrators for @${channelUsername}`);
        return data.result;
      }

      return [];
    } catch (error) {
      console.error(`[Telegram] Error getting administrators for @${channelUsername}:`, error);
      return [];
    }
  }

  /**
   * Verify if a user is an admin/owner of a channel
   */
  async verifyChannelOwnership(
    channelUsername: string,
    telegramUserId: number,
    requireCreator: boolean = false
  ): Promise<{ isOwner: boolean; isAdmin: boolean; status?: string; ownerUsername?: string; chatInfo?: TelegramChat }> {
    try {
      console.log(`[Telegram] Verifying ownership of @${channelUsername} for user ${telegramUserId} (requireCreator: ${requireCreator})`);

      // Get channel info
      const chatInfo = await this.getChat(channelUsername);
      if (!chatInfo) {
        console.warn(`[Telegram] Channel @${channelUsername} not found`);
        return { isOwner: false, isAdmin: false };
      }

      // Get administrators
      const admins = await this.getChatAdministrators(channelUsername);
      if (admins.length === 0) {
        console.warn(`[Telegram] Could not retrieve administrators for @${channelUsername}`);
        return { isOwner: false, isAdmin: false, chatInfo };
      }

      // Check if user is an admin
      const userAdmin = admins.find(admin => admin.user.id === telegramUserId);

      if (userAdmin) {
        console.log(`[Telegram] User ${telegramUserId} is admin of @${channelUsername} with status: ${userAdmin.status}`);

        // HEAD Logic: Get owner username
        let ownerUsername;
        const ownerAdmin = admins[0];
        if (ownerAdmin) {
          ownerUsername = ownerAdmin.user.username || `user_${ownerAdmin.user.id}`;
        }

        const isCreator = userAdmin.status === 'creator';

        if (requireCreator && !isCreator) {
          return { isOwner: false, isAdmin: true, status: userAdmin.status, ownerUsername, chatInfo };
        }

        return {
          isOwner: true, // Treated as owner if passes check (either just admin or creator if required)
          isAdmin: true,
          status: userAdmin.status,
          ownerUsername,
          chatInfo
        };
      }

      console.warn(`[Telegram] User ${telegramUserId} is NOT admin of @${channelUsername}`);
      return { isOwner: false, isAdmin: false, chatInfo };
    } catch (error) {
      console.error(`[Telegram] Error verifying ownership:`, error);
      return { isOwner: false, isAdmin: false };
    }
  }

  /**
   * Get channel member count
   */
  async getChatMemberCount(channelUsername: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.apiUrl}/bot${this.botToken}/getChatMemberCount?chat_id=@${channelUsername}`
      );

      if (!response.ok) {
        return 0;
      }

      const data = await response.json() as any;
      return data.ok ? data.result : 0;
    } catch (error) {
      console.error(`[Telegram] Error getting member count:`, error);
      return 0;
    }
  }

  /**
   * Send a message to a user or chat
   */
  async sendMessage(
    chatId: number | string,
    text: string,
    options: {
      parse_mode?: 'Markdown' | 'HTML';
      reply_markup?: any;
    } = {}
  ): Promise<boolean> {
    try {
      const body = {
        chat_id: chatId,
        text: text,
        ...options
      };

      const response = await fetch(`${this.apiUrl}/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[Telegram] Failed to send message to ${chatId}:`, errorData);
        return false;
      }

      const data = await response.json() as any;
      return data.ok;
    } catch (error) {
      console.error(`[Telegram] Error sending message to ${chatId}:`, error);
      return false;
    }
  }
}

export default TelegramService;
