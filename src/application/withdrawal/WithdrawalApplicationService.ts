/**
 * Withdrawal Application Service
 * Orchestrates withdrawal use cases following clean architecture
 */

import { WithdrawalAggregate } from '../../domain/withdrawal/WithdrawalAggregate';
import { WithdrawalAmount, TONAddress } from '../../domain/withdrawal/WithdrawalValueObjects';
import type { IWithdrawalRepository } from '../../domain/withdrawal/IWithdrawalRepository';
import type { IUserRepository } from '../../domain/user/IUserRepository';
import type { IFraudDetectionService } from '../../domain/services/IFraudDetectionService';
import type { IBlockchainService } from '../../domain/services/IBlockchainService';
import type { IEventBus } from '../../infrastructure/services/IEventBus';

export interface CreateWithdrawalCommand {
  userId: number;
  destinationAddress: string;
  amountNano: bigint;
  message?: string;
}

export interface WithdrawalResult {
  success: boolean;
  withdrawalId?: string;
  txHash?: string;
  error?: string;
}

export class WithdrawalApplicationService {
  constructor(
    private readonly withdrawalRepo: IWithdrawalRepository,
    private readonly userRepo: IUserRepository,
    private readonly fraudService: IFraudDetectionService,
    private readonly blockchainService: IBlockchainService,
    private readonly eventBus: IEventBus
  ) {}

  /**
   * Create and process withdrawal request
   * Following single responsibility - only orchestration
   */
  async createWithdrawal(command: CreateWithdrawalCommand): Promise<WithdrawalResult> {
    try {
      // 1. Validate user exists and has balance
      const user = await this.userRepo.findById(command.userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const amount = WithdrawalAmount.fromNano(command.amountNano);
      if (!user.hasSufficientBalance(command.amountNano)) {
        return { success: false, error: 'Insufficient balance' };
      }

      // 2. Check withdrawal limits (handled in withdrawal service)
      // Limit checks are performed in SecureWithdrawalService

      // 3. Create withdrawal aggregate
      const withdrawal = WithdrawalAggregate.create(
        command.userId,
        command.destinationAddress,
        command.amountNano,
        command.message
      );

      // 4. Perform fraud check (delegated to service)
      const fraudCheck = await this.fraudService.assessRisk({
        userId: command.userId,
        amount: amount,
        destination: new TONAddress(command.destinationAddress)
      });
      
      withdrawal.setRiskScore(fraudCheck.score);

      // 5. Check if auto-approval is allowed
      if (withdrawal.canProcess()) {
        // Process withdrawal automatically
        const txHash = await this.processWithdrawal(withdrawal);
        withdrawal.approve(txHash);
      }

      // 6. Save withdrawal
      await this.withdrawalRepo.save(withdrawal);

      // 7. Publish domain events
      const events = withdrawal.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }
      withdrawal.markEventsAsCommitted();

      return {
        success: true,
        withdrawalId: withdrawal.id.toString(),
        txHash: withdrawal.txHash?.toString() || undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process approved withdrawal on blockchain
   */
  private async processWithdrawal(withdrawal: WithdrawalAggregate): Promise<string> {
    const result = await this.blockchainService.sendTransaction({
      to: withdrawal.destinationAddress,
      amountNano: withdrawal.amountNano,
      message: withdrawal.message
    });

    if (!result.success) {
      throw new Error(`Blockchain transaction failed: ${result.error}`);
    }

    return result.txHash!;
  }

  /**
   * Manually approve pending withdrawal (admin action)
   */
  async approveWithdrawal(withdrawalId: string): Promise<WithdrawalResult> {
    try {
      const withdrawal = await this.withdrawalRepo.findById(withdrawalId);
      if (!withdrawal) {
        return { success: false, error: 'Withdrawal not found' };
      }

      if (!withdrawal.canProcess()) {
        return { success: false, error: 'Withdrawal cannot be processed' };
      }

      const txHash = await this.processWithdrawal(withdrawal);
      withdrawal.approve(txHash);

      await this.withdrawalRepo.save(withdrawal);

      // Publish events
      const events = withdrawal.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }
      withdrawal.markEventsAsCommitted();

      return {
        success: true,
        withdrawalId: withdrawal.id.toString(),
        txHash: withdrawal.txHash?.toString() || undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Reject pending withdrawal (admin action)
   */
  async rejectWithdrawal(withdrawalId: string, reason: string): Promise<WithdrawalResult> {
    try {
      const withdrawal = await this.withdrawalRepo.findById(withdrawalId);
      if (!withdrawal) {
        return { success: false, error: 'Withdrawal not found' };
      }

      withdrawal.reject(reason);
      await this.withdrawalRepo.save(withdrawal);

      // Refund user balance
      const user = await this.userRepo.findById(withdrawal.userId);
      if (user) {
        user.addBalance(withdrawal.amountNano);
        await this.userRepo.save(user);
      }

      // Publish events
      const events = withdrawal.getUncommittedEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }
      withdrawal.markEventsAsCommitted();

      return {
        success: true,
        withdrawalId: withdrawal.id.toString()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
