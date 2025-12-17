import { PrismaClient } from '@prisma/client';
import { env } from '../config';
import { BlockchainService } from './blockchain.service';

export class BlockchainMonitorService {
  private prisma: PrismaClient;
  private blockchainService: BlockchainService;
  private lastLogicalTime: bigint = 0n;
  private isMonitoring: boolean = false;
  private monitorInterval: Timer | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.blockchainService = new BlockchainService();
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Blockchain monitor already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🔍 Starting blockchain monitor...');

    // Load last logical time from system status
    const status = await this.prisma.systemStatus.findFirst();
    if (status?.lastLogicalTime) {
      this.lastLogicalTime = BigInt(status.lastLogicalTime);
    }

    // Start monitoring loop
    this.monitoringLoop();
  }

  private async monitoringLoop() {
    if (!this.isMonitoring) return;

    try {
      await this.checkDeposits();
    } catch (error) {
      console.error('❌ Monitoring error:', error);
    } finally {
      // Schedule next check
      if (this.isMonitoring) {
        this.monitorInterval = setTimeout(() => this.monitoringLoop(), env.checkInterval);
      }
    }
  }

  async checkDeposits() {
    try {
      console.log(`🔍 Checking for deposits to ${env.websiteWallet}...`);

      const transactions = await this.blockchainService.getAccountTransactions(env.websiteWallet);
      let newDeposits = 0;
      const totalTxs = transactions.length;

      for (const tx of transactions) {
        // Check if transaction has incoming internal message
        if (tx.inMessage && tx.inMessage.info.type === 'internal') {
          const logicalTime = BigInt(tx.lt.toString());

          if (logicalTime > this.lastLogicalTime) {
            const processed = await this.processDeposit(tx);
            if (processed) {
              newDeposits++;
              if (logicalTime > this.lastLogicalTime) {
                this.lastLogicalTime = logicalTime;
              }
            }
          }
        }
      }

      if (newDeposits > 0) {
        console.log(`✅ Processed ${newDeposits} new deposits (scanned ${totalTxs} total transactions)`);
      } else if (totalTxs > 0) {
        console.log(`ℹ️ Scanned ${totalTxs} transactions, no new deposits`);
      }

      // Update system status
      await this.prisma.systemStatus.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          lastBlockCheck: new Date(),
          lastLogicalTime: Number(this.lastLogicalTime),
          isMonitoring: true,
        },
        update: {
          lastBlockCheck: new Date(),
          lastLogicalTime: Number(this.lastLogicalTime),
        },
      });

    } catch (error) {
      console.error('❌ Error checking deposits:', error);
    }
  }

  private async processDeposit(tx: any): Promise<boolean> {
    try {
      // Handle @ton/ton Transaction object
      const info = tx.inMessage?.info;
      if (!info || info.type !== 'internal') return false;

      const senderAddress = info.src.toString();
      const amount = Number(info.value.coins) / 1e9; // Convert from nanotons to TON
      const txHash = tx.hash.toString('hex');
      const logicalTime = BigInt(tx.lt.toString());

      // Check if transaction already exists
      const existingTx = await this.prisma.transaction.findUnique({
        where: { txHash },
      });

      if (existingTx) {
        return false; // Already processed
      }

      // Find user by wallet address or variants
      // Use findFirst because walletAddress is not unique in schema
      let user = await this.prisma.user.findFirst({
        where: { walletAddress: senderAddress },
      });

      if (!user) {
        // Try to find by address variants
        const users = await this.prisma.user.findMany();
        for (const u of users) {
          try {
            const variants = JSON.parse(u.walletAddressVariants || '[]');
            if (variants.includes(senderAddress)) {
              user = u;
              break;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      if (user) {
        // Create transaction record
        await this.prisma.transaction.create({
          data: {
            userId: user.id,
            amount,
            type: 'deposit',
            status: 'completed',
            txHash,
            logicalTime,
          },
        });

        // Update user balance
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            balance: {
              increment: amount, // This assumes balance is float/int compatible with amount
            },
          },
        });

        console.log(`💰 Deposit processed: ${amount} TON for user ${user.telegramId}`);
        return true;
      } else {
        console.log(`⚠️ Unknown wallet address: ${senderAddress}`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error processing deposit:', error);
      return false;
    }
  }

  async stopMonitoring() {
    this.isMonitoring = false;
    if (this.monitorInterval) {
      clearTimeout(this.monitorInterval);
      this.monitorInterval = null;
    }
    console.log('⏹️  Blockchain monitor stopped');
  }

  async getStatus() {
    const status = await this.prisma.systemStatus.findFirst();
    return {
      isMonitoring: this.isMonitoring,
      lastLogicalTime: this.lastLogicalTime.toString(),
      lastBlockCheck: status?.lastBlockCheck,
      totalDeposits: status?.totalDeposits || 0,
      totalUsers: await this.prisma.user.count(),
    };
  }
}
