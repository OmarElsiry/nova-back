import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { env } from '../config';

/**
 * Service for blockchain operations
 * Handles address normalization and transaction verification
 */
export class BlockchainService {
  private client: TonClient;
  private fallbackClient: TonClient | null = null;
  private readonly CONFIRMATION_DEPTH = 10;

  constructor() {
    this.client = new TonClient({
      endpoint: env.tonRpcPrimary,
      apiKey: env.tonApiKey
    });

    if (env.tonRpcFallback) {
      this.fallbackClient = new TonClient({
        endpoint: env.tonRpcFallback,
        apiKey: env.tonApiKey
      });
    }
  }

  /**
   * Normalize TON address to canonical format
   * Handles various address formats and returns standardized version
   */
  normalizeAddress(input: string): string {
    try {
      const addr = Address.parse(input);
      return addr.toString({
        bounceable: true,
        testOnly: false,
        urlSafe: true
      });
    } catch (error) {
      throw new Error(`Invalid TON address: ${input}`);
    }
  }

  /**
   * Get all address variants for a canonical address
   * Returns bounceable/non-bounceable and base64/base64url variants
   */
  getAddressVariants(canonicalAddress: string): string[] {
    try {
      const addr = Address.parse(canonicalAddress);
      const variants = [
        // Bounceable variants
        addr.toString({ bounceable: true, testOnly: false, urlSafe: false }),
        addr.toString({ bounceable: true, testOnly: false, urlSafe: true }),
        // Non-bounceable variants
        addr.toString({ bounceable: false, testOnly: false, urlSafe: false }),
        addr.toString({ bounceable: false, testOnly: false, urlSafe: true })
      ];

      // Remove duplicates
      return [...new Set(variants)];
    } catch (error) {
      throw new Error(`Failed to generate address variants: ${error}`);
    }
  }

  /**
   * Verify address format is valid
   */
  isValidAddress(address: string): boolean {
    try {
      Address.parse(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if transaction has sufficient confirmations
   * Note: This is a placeholder - actual implementation requires
   * access to TON blockchain data
   */
  async hasConfirmations(txSeqno: number): Promise<boolean> {
    try {
      // Placeholder: In production, query TON blockchain for current seqno
      // For now, assume confirmed after a short delay
      return true;
    } catch (error) {
      console.error('Error checking confirmations:', error);
      return false;
    }
  }

  /**
   * Get current block height
   */
  async getCurrentBlockHeight(): Promise<number> {
    try {
      // Placeholder: In production, query TON blockchain for current block
      return Math.floor(Date.now() / 1000);
    } catch (error) {
      console.error('Error getting current block height:', error);
      throw new Error('Failed to get current block height');
    }
  }

  /**
   * Execute with fallback retry
   */
  private async withFallback<T>(operation: (client: TonClient) => Promise<T>): Promise<T> {
    try {
      return await operation(this.client);
    } catch (error) {
      if (this.fallbackClient) {
        console.warn('Primary RPC failed, trying fallback...', error instanceof Error ? error.message : String(error));
        try {
          return await operation(this.fallbackClient);
        } catch (fallbackError) {
          console.error('Fallback RPC also failed:', fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(address: string): Promise<string> {
    try {
      const addr = Address.parse(address);
      return await this.withFallback(async (client) => {
        const state = await client.getContractState(addr);
        return state.state === 'active' ? state.balance.toString() : '0';
      });
    } catch (error) {
      console.error('Error getting account balance:', error);
      throw new Error('Failed to get account balance');
    }
  }

  /**
   * Get account transactions
   */
  async getAccountTransactions(address: string, limit = 100) {
    try {
      const addr = Address.parse(address);
      return await this.withFallback(async (client) => {
        return await client.getTransactions(addr, { limit });
      });
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw new Error('Failed to get transactions');
    }
  }
}
