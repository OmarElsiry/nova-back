import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { VariantService } from './variant.service';
import { BlockchainService } from './blockchain.service';
import type { DepositParams, DepositResponse, DepositMetadata } from '../types/deposit.types';

/**
 * Service for processing and managing deposits
 * Handles idempotency, confirmation tracking, and user identification
 */
export class DepositService {
  private prisma: PrismaClient;
  private variantService: VariantService;
  private blockchainService: BlockchainService;

  constructor(
    prisma?: PrismaClient,
    variantService?: VariantService,
    blockchainService?: BlockchainService
  ) {
    this.prisma = prisma || new PrismaClient();
    this.variantService = variantService || new VariantService();
    this.blockchainService = blockchainService || new BlockchainService();
  }

  /**
   * Compute idempotency hash for deposit
   * Ensures same deposit is never processed twice
   * @private
   */
  private computeIdempotencyHash(
    txHash: string,
    canonical: string,
    amountNano: string,
    bounceFlag: boolean
  ): string {
    const data = `${txHash}:${canonical}:${amountNano}:${bounceFlag}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Process incoming deposit
   * Validates address, checks confirmations, and stores in database
   */
  async processDeposit(params: DepositParams): Promise<DepositResponse | null> {
    try {
      // Step 1: Normalize address
      const normalizedAddress = this.blockchainService.normalizeAddress(params.address);

      // Step 2: Resolve to canonical (if variant provided)
      let canonical = normalizedAddress;
      if (normalizedAddress.includes(':')) {
        // It's a variant
        const extracted = this.variantService.extractCanonical(normalizedAddress);
        if (!extracted) {
          throw new Error('Invalid variant address');
        }
        canonical = extracted;
      }

      // Step 3: Find canonical address record
      const addressRecord = await this.prisma.canonicalAddress.findUnique({
        where: { address: canonical },
        include: { user: true }
      });

      if (!addressRecord) {
        throw new Error('Address not registered in system');
      }

      // Step 4: Check confirmations
      const hasConfirmations = await this.blockchainService.hasConfirmations(params.blockSeqno);

      // Step 5: Compute idempotency hash
      const idempotencyHash = this.computeIdempotencyHash(
        params.txHash,
        canonical,
        params.amountNano,
        params.bounceFlag
      );

      // Step 6: Insert deposit (idempotent)
      try {
        const metadata: DepositMetadata = {
          blockSeqno: params.blockSeqno,
          bounceFlag: params.bounceFlag
        };

        const deposit = await this.prisma.deposit.create({
          data: {
            idempotencyHash,
            txHash: params.txHash,
            canonicalId: addressRecord.id,
            userId: addressRecord.userId,
            amountNano: params.amountNano,
            status: hasConfirmations ? 'confirmed' : 'pending',
            confirmationDepth: hasConfirmations ? 10 : 0,
            reorgSafe: hasConfirmations,
            metadata: JSON.stringify(metadata)
          }
        });

        console.log(`✅ Deposit processed: ${deposit.id}`);
        return this.formatDepositResponse(deposit);
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Unique constraint violation - already processed
          console.log(`⏭️  Deposit already processed: ${params.txHash}`);
          return null;
        }
        throw error;
      }
    } catch (error) {
      console.error('Error processing deposit:', error);
      throw error;
    }
  }

  /**
   * Get user deposits
   */
  async getUserDeposits(userId: number): Promise<DepositResponse[]> {
    const deposits = await this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        canonical: true
      }
    });

    return deposits.map(d => this.formatDepositResponse(d));
  }

  /**
   * Get deposits by address
   */
  async getDepositsByAddress(address: string): Promise<DepositResponse[]> {
    const canonical = this.blockchainService.normalizeAddress(address);

    const addressRecord = await this.prisma.canonicalAddress.findUnique({
      where: { address: canonical }
    });

    if (!addressRecord) {
      return [];
    }

    const deposits = await this.prisma.deposit.findMany({
      where: { canonicalId: addressRecord.id },
      orderBy: { createdAt: 'desc' },
      include: {
        canonical: true
      }
    });

    return deposits.map(d => this.formatDepositResponse(d));
  }

  /**
   * Get deposit by ID
   */
  async getDepositById(depositId: string): Promise<DepositResponse | null> {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: {
        canonical: true
      }
    });

    if (!deposit) return null;
    return this.formatDepositResponse(deposit);
  }

  /**
   * Update deposit status
   */
  async updateDepositStatus(
    depositId: string,
    status: 'pending' | 'confirmed' | 'failed',
    confirmationDepth?: number
  ): Promise<DepositResponse> {
    const deposit = await this.prisma.deposit.update({
      where: { id: depositId },
      data: {
        status,
        confirmationDepth: confirmationDepth ?? undefined,
        reorgSafe: status === 'confirmed' && confirmationDepth ? confirmationDepth >= 10 : false,
        confirmedAt: status === 'confirmed' ? new Date() : undefined
      },
      include: {
        canonical: true
      }
    });

    return this.formatDepositResponse(deposit);
  }

  /**
   * Get total deposits for user
   */
  async getUserTotalDeposits(userId: number): Promise<string> {
    const deposits = await this.prisma.deposit.findMany({
      where: {
        userId,
        status: 'confirmed'
      },
      select: {
        amountNano: true
      }
    });

    const sum = deposits.reduce((acc, curr) => acc + BigInt(curr.amountNano), BigInt(0));
    return sum.toString();
  }

  /**
   * Format deposit record for API response
   * @private
   */
  private formatDepositResponse(deposit: any): DepositResponse {
    return {
      id: deposit.id,
      txHash: deposit.txHash,
      amount: deposit.amountNano,
      status: deposit.status,
      address: deposit.canonical.address,
      createdAt: deposit.createdAt.toISOString(),
      confirmedAt: deposit.confirmedAt?.toISOString(),
      confirmationDepth: deposit.confirmationDepth,
      reorgSafe: deposit.reorgSafe
    };
  }
}
