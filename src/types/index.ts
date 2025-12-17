export interface CreateUserInput {
  telegram_id: string;
  wallet_address: string;
}

export interface ChannelVerificationInput {
  channel_username: string;
  telegram_id: number;
  user_id: number;
}

export interface PurchaseChannelInput {
  buyer_id: number;
}

export interface GetChannelsFilters {
  status?: string;
  min_price?: number;
  max_price?: number;
  limit?: number;
  offset?: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}
