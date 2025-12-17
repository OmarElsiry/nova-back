/**
 * User Repository Interface
 * Domain layer interface for user persistence
 */

import { UserEntity } from './UserEntity';

export interface IUserRepository {
  findById(id: number): Promise<UserEntity | null>;
  findByTelegramId(telegramId: string): Promise<UserEntity | null>;
  findByWalletAddress(walletAddress: string): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<void>;
  delete(id: number): Promise<void>;
}
