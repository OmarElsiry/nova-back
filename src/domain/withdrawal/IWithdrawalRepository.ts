/**
 * Withdrawal Repository Interface
 * Domain layer interface - implementation details in infrastructure layer
 */

import { WithdrawalAggregate } from './WithdrawalAggregate';
import { WithdrawalStatus } from './WithdrawalValueObjects';

export interface IWithdrawalRepository {
  findById(id: string): Promise<WithdrawalAggregate | null>;
  findByUserId(userId: string): Promise<WithdrawalAggregate[]>;
  findByStatus(status: WithdrawalStatus): Promise<WithdrawalAggregate[]>;
  save(withdrawal: WithdrawalAggregate): Promise<void>;
  delete(id: string): Promise<void>;
  
  // Query methods
  getRecentWithdrawals(userId: string, hoursAgo: number): Promise<WithdrawalAggregate[]>;
  getDailyTotalForUser(userId: string, date: Date): Promise<bigint>;
  getUniqueAddressCount(userId: string): Promise<number>;
  isNewAddress(userId: string, address: string): Promise<boolean>;
  getUserDailyTotal(userId: number, date: Date): Promise<bigint>;
  getPendingCount(userId: number): Promise<number>;
  getRecentWithdrawals(userId: number, limit: number): Promise<WithdrawalAggregate[]>;
}
