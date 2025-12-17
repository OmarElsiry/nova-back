/**
 * Purchase Repository Interface
 * Domain layer abstraction for purchase persistence
 */

import type { PurchaseAggregate, PurchaseStatus } from './PurchaseAggregate';

export interface IPurchaseRepository {
  /**
   * Save a purchase aggregate
   */
  save(purchase: PurchaseAggregate): Promise<void>;
  
  /**
   * Find a purchase by ID
   */
  findById(id: string): Promise<PurchaseAggregate | null>;
  
  /**
   * Find purchases by buyer
   */
  findByBuyerId(buyerId: number): Promise<PurchaseAggregate[]>;
  
  /**
   * Find purchases by seller
   */
  findBySellerId(sellerId: number): Promise<PurchaseAggregate[]>;
  
  /**
   * Find purchases by channel
   */
  findByChannelId(channelId: number): Promise<PurchaseAggregate[]>;
  
  /**
   * Find active purchase for channel
   */
  findActivePurchaseForChannel(channelId: number): Promise<PurchaseAggregate | null>;
  
  /**
   * Find purchases by status
   */
  findByStatus(status: PurchaseStatus): Promise<PurchaseAggregate[]>;
  
  /**
   * Find expired purchases
   */
  findExpiredPurchases(currentTime: Date): Promise<PurchaseAggregate[]>;
  
  /**
   * Check if channel has active purchase
   */
  hasActivePurchase(channelId: number): Promise<boolean>;
}
