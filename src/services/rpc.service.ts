/**
 * RPC Service for TON Blockchain
 * Implements primary (Orbs) and fallback (OnFinality) RPC endpoints
 */

import { TonClient, Address } from '@ton/ton';
import { toNano, fromNano } from '@ton/core';
import type { Transaction } from '@ton/ton';
import { getHttpEndpoint } from '@orbs-network/ton-access';

interface RpcConfig {
  name: string;
  endpoint: string;
  apiKey?: string;
  priority: number;
}

interface TransactionInfo {
  hash: string;
  from: string;
  to: string;
  amount: bigint;
  message?: string;
  timestamp: number;
  confirmations: number;
}

export class RpcService {
  private static instance: RpcService;
  private clients: Map<string, TonClient> = new Map();
  private currentClient: TonClient | null = null;
  private currentEndpoint: string = '';

  private readonly configs: RpcConfig[] = [
    {
      name: 'Orbs',
      endpoint: 'https://ton.access.orbs.network/v2/mainnet',
      priority: 1
    },
    {
      name: 'OnFinality',
      endpoint: 'https://ton.api.onfinality.io/rpc',
      // SECURITY: API key must be set via environment variable
      apiKey: process.env.ONFINALITY_API_KEY,
      priority: process.env.ONFINALITY_API_KEY ? 2 : 99 // Deprioritize if no API key
    }
  ];

  private constructor() { }

  static getInstance(): RpcService {
    if (!RpcService.instance) {
      RpcService.instance = new RpcService();
    }
    return RpcService.instance;
  }

  /**
   * Initialize RPC clients with automatic fallback
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing RPC clients...');

    // Try Orbs first (using ton-access for automatic endpoint discovery)
    try {
      console.log('Connecting to Orbs RPC (via ton-access)...');
      const orbsEndpoint = await getHttpEndpoint({ network: 'mainnet' });
      console.log(`   Orbs endpoint: ${orbsEndpoint}`);

      const orbsClient = new TonClient({ endpoint: orbsEndpoint });

      // Test connection
      const testAddr = Address.parse('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');
      await orbsClient.getBalance(testAddr);

      this.clients.set('Orbs', orbsClient);
      this.currentClient = orbsClient;
      this.currentEndpoint = 'Orbs';
      console.log(`✅ Primary RPC connected: Orbs`);
    } catch (error) {
      console.error(`❌ Failed to connect to Orbs:`, error);
    }

    // Try OnFinality as fallback
    try {
      const onFinalityConfig = this.configs.find(c => c.name === 'OnFinality');
      if (onFinalityConfig) {
        console.log('Connecting to OnFinality RPC...');
        const endpoint = onFinalityConfig.apiKey
          ? `${onFinalityConfig.endpoint}?apikey=${onFinalityConfig.apiKey}`
          : onFinalityConfig.endpoint;

        const client = new TonClient({ endpoint });

        // Test connection
        const testAddr = Address.parse('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');
        await client.getBalance(testAddr);

        this.clients.set('OnFinality', client);

        if (!this.currentClient) {
          this.currentClient = client;
          this.currentEndpoint = 'OnFinality';
          console.log(`✅ Primary RPC connected: OnFinality`);
        } else {
          console.log(`✅ Fallback RPC ready: OnFinality`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to connect to OnFinality:`, error);
    }

    if (!this.currentClient) {
      throw new Error('Failed to connect to any RPC endpoint');
    }
  }

  /**
   * Get current active client with automatic fallback
   */
  private async getClient(): Promise<TonClient> {
    if (!this.currentClient) {
      await this.initialize();
    }

    // Test current client health
    try {
      const testAddr = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
      await this.currentClient!.getBalance(testAddr);
      return this.currentClient!;
    } catch (error) {
      console.warn(`Current RPC (${this.currentEndpoint}) failed, attempting fallback...`);

      // Try fallback clients
      for (const [name, client] of this.clients) {
        if (name !== this.currentEndpoint) {
          try {
            const testAddr = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
            await client.getBalance(testAddr);
            this.currentClient = client;
            this.currentEndpoint = name;
            console.log(`✅ Switched to fallback RPC: ${name}`);
            return client;
          } catch (err) {
            console.warn(`Fallback ${name} also failed`);
          }
        }
      }

      // If all fail, reinitialize
      await this.initialize();
      return this.currentClient!;
    }
  }

  /**
   * Get wallet balance with automatic RPC fallback
   */
  async getBalance(address: string): Promise<bigint> {
    const client = await this.getClient();
    const addr = Address.parse(address);
    const balance = await client.getBalance(addr);

    console.log(`Balance check via ${this.currentEndpoint}: ${address} = ${balance}`);
    return balance;
  }

  /**
   * Get transactions for an address
   */
  async getTransactions(
    address: string,
    limit: number = 20,
    lt?: bigint,
    hash?: Buffer,
    archival: boolean = true
  ): Promise<Transaction[]> {
    const client = await this.getClient();
    const addr = Address.parse(address);

    const transactions = await client.getTransactions(addr, {
      limit,
      lt: lt?.toString(),
      hash: hash?.toString('base64'),
      archival
    });

    console.log(`Fetched ${transactions.length} transactions via ${this.currentEndpoint}`);
    return transactions;
  }

  /**
   * Monitor incoming deposits to an address
   */
  async monitorDeposits(
    address: string,
    onDeposit: (tx: TransactionInfo) => Promise<void>,
    lastLt?: bigint
  ): Promise<void> {
    console.log(`🔍 Monitoring deposits to ${address}`);

    const checkInterval = 10000; // 10 seconds
    let currentLt = lastLt;

    const check = async () => {
      try {
        // Fetch latest transactions (non-archival for speed and stability)
        // We do NOT pass currentLt here because we want the LATEST transactions,
        // not transactions older than currentLt.
        const transactions = await this.getTransactions(address, 50, undefined, undefined, false);

        // Sort by lt ascending (oldest first) to process in order
        const sortedTx = transactions.sort((a, b) => {
          if (a.lt < b.lt) return -1;
          if (a.lt > b.lt) return 1;
          return 0;
        });

        for (const tx of sortedTx) {
          // Skip if we've seen this transaction
          if (currentLt && tx.lt <= currentLt) continue;

          // Process incoming transactions only
          if (tx.inMessage) {
            // @ts-ignore - Type definitions are incomplete for transaction structure
            const value = tx.inMessage.info?.value?.coins || tx.inMessage.value;
            if (value) {
              const txInfo: TransactionInfo = {
                hash: tx.hash().toString('hex'),
                // @ts-ignore - Type definitions incomplete
                from: tx.inMessage.info?.src?.toString() || tx.inMessage.src?.toString() || 'unknown',
                to: address,
                amount: BigInt(value),
                message: undefined, // Message parsing is complex, skip for now
                timestamp: tx.now,
                confirmations: 1 // Will be calculated based on block height
              };

              await onDeposit(txInfo);
            }
          }

          // Update last processed lt
          if (!currentLt || tx.lt > currentLt) {
            currentLt = tx.lt;
          }
        }
      } catch (error: any) {
        const errorMessage = String(error?.response?.data?.error || error?.message || 'Unknown error');

        // Handle case where wallet history is too old for non-archival node
        // This is expected for inactive wallets until a new transaction occurs
        if (
          errorMessage.includes('lt not in db') ||
          errorMessage.includes('cannot locate transaction') ||
          errorMessage.includes('cannot find block')
        ) {
          console.warn(`⚠️  Wallet history on RPC node is incomplete (common for inactive wallets). Waiting for new active transactions...`);
          return;
        }

        console.error('Error checking deposits:', errorMessage);
        // Will retry with potentially different RPC on next interval
      }
    };

    // Initial check
    await check();

    // Set up periodic monitoring
    setInterval(check, checkInterval);
  }

  /**
   * Send TON transaction (for withdrawals)
   */
  async sendTransaction(
    from: string,
    to: string,
    amount: bigint,
    message?: string
  ): Promise<string> {
    const client = await this.getClient();

    // Note: This requires wallet keys to be configured
    // Implementation depends on wallet setup

    console.log(`Sending ${amount} TON from ${from} to ${to} via ${this.currentEndpoint}`);

    // Placeholder for actual transaction sending
    throw new Error('Transaction sending requires wallet configuration');
  }

  /**
   * Get current RPC status
   */
  getStatus(): { primary: string; fallbacks: string[]; current: string } {
    const fallbacks = Array.from(this.clients.keys()).filter(name => name !== this.currentEndpoint);

    return {
      primary: this.configs.find(c => c.priority === 1)?.name || 'Unknown',
      fallbacks,
      current: this.currentEndpoint
    };
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    endpoints: Array<{ name: string; status: 'online' | 'offline' }>;
  }> {
    const endpoints = [];

    for (const [name, client] of this.clients) {
      try {
        const testAddr = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
        await client.getBalance(testAddr);
        endpoints.push({ name, status: 'online' as const });
      } catch {
        endpoints.push({ name, status: 'offline' as const });
      }
    }

    return {
      healthy: endpoints.some(e => e.status === 'online'),
      endpoints
    };
  }
}
