/**
 * Channel Repository Interface
 * Domain layer abstraction for channel persistence
 */

export interface Channel {
  id: number;
  userId: number;
  username: string;
  status: string;
  askingPrice: number | null;
  featuredGiftImageUrl?: string;
  giftsCount: number;
  giftsJson?: string;
  gifts?: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IChannelRepository {
  /**
   * Find channel by ID
   */
  findById(id: number): Promise<Channel | null>;
  
  /**
   * Find channels by user ID
   */
  findByUserId(userId: number): Promise<Channel[]>;
  
  /**
   * Find listed channels by user
   */
  findListedByUserId(userId: number): Promise<Channel[]>;
  
  /**
   * Find all listed channels
   */
  findAllListed(): Promise<Channel[]>;
  
  /**
   * Save a channel
   */
  save(channel: Channel): Promise<void>;
  
  /**
   * Update channel status
   */
  updateStatus(id: number, status: string): Promise<void>;
  
  /**
   * Update channel owner
   */
  updateOwner(id: number, newUserId: number): Promise<void>;
  
  /**
   * Check if channel exists
   */
  exists(username: string): Promise<boolean>;
}
