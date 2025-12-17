/**
 * Secure Deposit Service
 * Implements the secure deposit handling algorithm with RPC failover
 */

import { PrismaClient } from '@prisma/client';
import { RpcService } from './rpc.service';
import { DepositService } from './deposit.service';
import { FINANCIAL } from '../shared/constants/financial.constants';
import { createHash } from 'crypto';

interface DepositConfig {
  requiredConfirmations: number;
  pollIntervalMs: number;
  depositWalletAddress: string;
  fraudCheckEnabled: boolean;
  maxDepositAmount?: bigint;
  minDepositAmount?: bigint;
}

interface ProcessedDeposit {
  txHash: string;
  from: string;
  to: string;
  amount: bigint;
  timestamp: number;
  confirmations: number;
  status: 'pending' | 'confirmed' | 'failed';
  rpcEndpoint: string;
}

export class SecureDepositService {
  private static instance: SecureDepositService;
  private prisma: PrismaClient;
  private rpcService: RpcService;
  private depositService: DepositService;
  private config: DepositConfig;
  private isMonitoring: boolean = false;
  private lastProcessedLt?: bigint;

  private constructor(config: Partial<DepositConfig> = {}) {
    this.prisma = new PrismaClient();
    this.rpcService = RpcService.getInstance();
    this.depositService = new DepositService(this.prisma);

    this.config = {
      requiredConfirmations: config.requiredConfirmations || 3,
      pollIntervalMs: config.pollIntervalMs || 10000,
      depositWalletAddress: config.depositWalletAddress || process.env.DEPOSIT_WALLET_ADDRESS || '',
      fraudCheckEnabled: config.fraudCheckEnabled !== false,
      maxDepositAmount: config.maxDepositAmount,
      minDepositAmount: config.minDepositAmount || BigInt(Math.floor(FINANCIAL.MIN_DEPOSIT_TON * FINANCIAL.NANO_PER_TON))
    };
  }

  static getInstance(config?: Partial<DepositConfig>): SecureDepositService {
    if (!SecureDepositService.instance) {
      SecureDepositService.instance = new SecureDepositService(config);
    }
    return SecureDepositService.instance;
  }

  /**
   * Initialize the deposit service
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Secure Deposit Service...');

    // Initialize RPC service
    await this.rpcService.initialize();

    // Validate deposit wallet address
    if (!this.config.depositWalletAddress) {
      throw new Error('Deposit wallet address not configured');
    }

    // Load last processed logical time from database
    await this.loadLastProcessedLt();

    console.log('✅ Secure Deposit Service initialized');
    console.log(`📍 Monitoring deposits to: ${this.config.depositWalletAddress}`);
    console.log(`⏱️  Required confirmations: ${this.config.requiredConfirmations}`);
  }

  /**
   * Start monitoring for deposits
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️  Already monitoring deposits');
      return;
    }

    this.isMonitoring = true;
    console.log('👁️  Starting deposit monitoring...');

    // Set up monitoring with RPC service
    await this.rpcService.monitorDeposits(
      this.config.depositWalletAddress,
      async (tx) => await this.processIncomingDeposit(tx),
      this.lastProcessedLt
    );
  }

  /**
   * Stop monitoring for deposits
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('🛑 Stopped deposit monitoring');
  }

  /**
   * Process an incoming deposit transaction
   */
  private async processIncomingDeposit(tx: any): Promise<void> {
    const txHash = tx.hash;

    try {
      console.log(`\n🔍 Processing deposit: ${txHash}`);
      console.log(`   From: ${tx.from}`);
      console.log(`   Amount: ${tx.amount} nanoTON`);

      // Step 1: Validate transaction
      const validationResult = await this.validateDeposit(tx);
      if (!validationResult.valid) {
        console.warn(`❌ Deposit validation failed: ${validationResult.reason}`);
        await this.logFailedDeposit(tx, validationResult.reason || 'Unknown validation error');
        return;
      }

      // Step 2: Check if already processed (idempotency)
      const isProcessed = await this.isDepositProcessed(txHash);
      if (isProcessed) {
        console.log(`⏭️  Deposit already processed: ${txHash}`);
        return;
      }

      // Step 3: Fraud checks
      if (this.config.fraudCheckEnabled) {
        const fraudCheck = await this.performFraudCheck(tx);
        if (!fraudCheck.passed) {
          console.warn(`🚨 Fraud check failed: ${fraudCheck.reason}`);
          await this.logSuspiciousDeposit(tx, fraudCheck.reason || 'Failed fraud check');
          // Alert admin
          await this.alertAdmin('Suspicious deposit detected', tx);
          return;
        }
      }

      // Step 4: Begin atomic database transaction
      await this.prisma.$transaction(async (prisma) => {
        // Double-check idempotency within transaction
        const existingDeposit = await prisma.deposit.findFirst({
          where: { txHash }
        });

        if (existingDeposit) {
          console.log(`⏭️  Deposit already exists in transaction: ${txHash}`);
          return;
        }

        // Find user by sender address
        const user = await this.findUserByWallet(tx.from, prisma);
        if (!user) {
          console.warn(`⚠️  No user found for wallet: ${tx.from}`);
          // Store as orphaned deposit for manual review
          await this.storeOrphanedDeposit(tx, prisma);
          return;
        }

        // Credit user balance
        await prisma.user.update({
          where: { id: user.id },
          data: {
            balance: {
              increment: Number(tx.amount) // Convert to number for Prisma
            }
          }
        });

        // Store deposit record
        await prisma.deposit.create({
          data: {
            txHash: txHash,
            userId: user.id,
            amountNano: tx.amount.toString(),
            status: tx.confirmations >= this.config.requiredConfirmations ? 'confirmed' : 'pending',
            confirmationDepth: tx.confirmations,
            idempotencyHash: this.generateIdempotencyHash(tx),
            canonicalId: user.canonicalAddressId || 1, // Fallback to 1 if not set
            reorgSafe: tx.confirmations >= 10,
            metadata: JSON.stringify({
              from: tx.from,
              timestamp: tx.timestamp,
              message: tx.message,
              rpcEndpoint: this.rpcService.getStatus().current
            })
          }
        });

        console.log(`✅ Deposit credited to user ${user.id}: ${tx.amount} nanoTON`);
      });

      // Step 5: Update last processed lt
      await this.updateLastProcessedLt(tx.lt);

      // Step 6: Log success
      await this.logSuccessfulDeposit(tx);

      // Step 7: Notify user
      await this.notifyUser(tx);

    } catch (error) {
      console.error(`❌ Error processing deposit ${txHash}:`, error);
      await this.logFailedDeposit(tx, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Validate deposit transaction
   */
  private async validateDeposit(tx: any): Promise<{ valid: boolean; reason?: string }> {
    // Check minimum amount
    if (this.config.minDepositAmount && tx.amount < this.config.minDepositAmount) {
      return { valid: false, reason: `Below minimum amount: ${this.config.minDepositAmount}` };
    }

    // Check maximum amount
    if (this.config.maxDepositAmount && tx.amount > this.config.maxDepositAmount) {
      return { valid: false, reason: `Exceeds maximum amount: ${this.config.maxDepositAmount}` };
    }

    // Validate destination address
    if (tx.to !== this.config.depositWalletAddress) {
      return { valid: false, reason: 'Invalid destination address' };
    }

    // Check confirmations
    if (tx.confirmations < 1) {
      return { valid: false, reason: 'No confirmations yet' };
    }

    return { valid: true };
  }

  /**
   * Check if deposit has already been processed
   */
  private async isDepositProcessed(txHash: string): Promise<boolean> {
    const deposit = await this.prisma.deposit.findFirst({
      where: { txHash }
    });
    return !!deposit;
  }

  /**
   * Perform fraud checks on deposit
   */
  private async performFraudCheck(tx: any): Promise<{ passed: boolean; reason?: string }> {
    // Check for rapid repeated deposits from same address
    const recentDeposits = await this.prisma.deposit.findMany({
      where: {
        metadata: {
          contains: tx.from
        },
        createdAt: {
          gte: new Date(Date.now() - 60000) // Last minute
        }
      }
    });

    if (recentDeposits.length > 5) {
      return { passed: false, reason: 'Too many deposits in short time' };
    }

    // Check for unusual amount patterns
    if (tx.amount % BigInt(1000000000) === BigInt(0)) {
      // Exactly round TON amounts might be suspicious
      console.warn(`⚠️  Round amount detected: ${tx.amount}`);
    }

    return { passed: true };
  }

  /**
   * Find user by wallet address
   */
  private async findUserByWallet(walletAddress: string, prisma: any): Promise<any> {
    // Try to find user by wallet address
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { walletAddress: walletAddress },
          { walletAddress: walletAddress.replace('UQ', 'EQ') },
          { walletAddress: walletAddress.replace('EQ', 'UQ') }
        ]
      }
    });

    return user;
  }

  /**
   * Generate idempotency hash for deposit
   */
  private generateIdempotencyHash(tx: any): string {
    const data = `${tx.hash}:${tx.from}:${tx.to}:${tx.amount}:${tx.timestamp}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Store orphaned deposit for manual review
   */
  private async storeOrphanedDeposit(tx: any, prisma: any): Promise<void> {
    // Store in a separate table or with special flag
    console.warn(`📦 Storing orphaned deposit for manual review: ${tx.hash}`);
    // Implementation depends on your schema
  }

  /**
   * Load last processed logical time from database
   */
  private async loadLastProcessedLt(): Promise<void> {
    // Load from system status or dedicated table
    const status = await this.prisma.$queryRaw<any[]>`
      SELECT MAX(CAST(JSON_EXTRACT(metadata, '$.lt') AS INTEGER)) as lastLt 
      FROM "Deposit"
    `;

    if (status && status[0]?.lastLt) {
      this.lastProcessedLt = BigInt(status[0].lastLt);
      console.log(`📍 Resuming from lt: ${this.lastProcessedLt}`);
    }
  }

  /**
   * Update last processed logical time
   */
  private async updateLastProcessedLt(lt: bigint): Promise<void> {
    this.lastProcessedLt = lt;
    // Optionally store in database for persistence
  }

  /**
   * Log successful deposit
   */
  private async logSuccessfulDeposit(tx: any): Promise<void> {
    console.log(`
🎉 ========= NEW DEPOSIT DETECTED =========
📍 Transaction: ${tx.hash}
👤 From: ${tx.from}
💰 Amount: ${Number(tx.amount) / 1000000000} TON
⏰ Timestamp: ${new Date(tx.timestamp * 1000).toISOString()}
✅ Confirmations: ${tx.confirmations}
🌐 RPC: ${this.rpcService.getStatus().current}
==========================================
    `);
  }

  /**
   * Log failed deposit
   */
  private async logFailedDeposit(tx: any, reason: string): Promise<void> {
    console.error(`❌ Deposit failed: ${tx.hash} - ${reason}`);
    // Store in failed deposits table for review
  }

  /**
   * Log suspicious deposit
   */
  private async logSuspiciousDeposit(tx: any, reason: string): Promise<void> {
    console.warn(`🚨 Suspicious deposit: ${tx.hash} - ${reason}`);
    // Store in suspicious deposits table for review
  }

  /**
   * Alert admin about issues
   */
  private async alertAdmin(message: string, data: any): Promise<void> {
    console.error(`🚨 ADMIN ALERT: ${message}`, data);
    // Send notification via email/Telegram/etc
  }

  /**
   * Notify user about deposit
   */
  private async notifyUser(tx: any): Promise<void> {
    console.log(`📧 Notifying user about deposit: ${tx.hash}`);
    // Send notification via preferred channel
  }

  /**
   * Get deposit statistics
   */
  async getDepositStats(): Promise<{
    totalDeposits: number;
    totalAmount: string;
    pendingDeposits: number;
    confirmedDeposits: number;
    failedDeposits: number;
    rpcStatus: any;
  }> {
    const [total, pending, confirmed] = await Promise.all([
      this.prisma.deposit.count(),
      this.prisma.deposit.count({ where: { status: 'pending' } }),
      this.prisma.deposit.count({ where: { status: 'confirmed' } })
    ]);

    // Manual summation since amountNano is String
    const deposits = await this.prisma.deposit.findMany({
      where: { status: 'confirmed' },
      select: { amountNano: true }
    });

    const totalAmount = deposits.reduce(
      (acc, deposit) => acc + BigInt(deposit.amountNano),
      BigInt(0)
    ).toString();

    return {
      totalDeposits: total,
      totalAmount: totalAmount,
      pendingDeposits: pending,
      confirmedDeposits: confirmed,
      failedDeposits: total - pending - confirmed,
      rpcStatus: await this.rpcService.healthCheck()
    };
  }
}
