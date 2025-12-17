/**
 * Withdrawal Processing Application Service
 * Orchestrates withdrawal business logic using domain services
 * NO BUSINESS LOGIC HERE - only orchestration
 */

import type { IWithdrawalRepository } from '../../domain/withdrawal/IWithdrawalRepository';
import type { IUserRepository } from '../../domain/user/IUserRepository';
import type { IBlockchainService } from '../../domain/services/IBlockchainService';
import type { IEventBus } from '../../domain/events/IEventBus';
import type { ILogger } from '../../infrastructure/logging/ILogger';

import { WithdrawalAggregate } from '../../domain/withdrawal/WithdrawalAggregate';
import { WithdrawalValidationService } from '../../domain/withdrawal/WithdrawalValidation';
import { WithdrawalFraudDetectionService } from '../../domain/withdrawal/WithdrawalFraudDetection';
import { WithdrawalAmount, TONAddress } from '../../domain/withdrawal/WithdrawalValueObjects';
import { WithdrawalCreatedEvent, WithdrawalCompletedEvent, WithdrawalFailedEvent } from '../../domain/withdrawal/WithdrawalEvents';
import { createHash } from 'crypto';

export interface ProcessWithdrawalCommand {
  userId: string;
  destinationAddress: string;
  amountNano: bigint;
  message?: string;
  twoFactorCode?: string;
}

export interface WithdrawalResult {
  success: boolean;
  withdrawalId?: string;
  txHash?: string;
  error?: string;
}

export class WithdrawalProcessingService {
  private readonly processingLocks = new Map<string, boolean>();
  
  constructor(
    private readonly withdrawalRepository: IWithdrawalRepository,
    private readonly userRepository: IUserRepository,
    private readonly blockchainService: IBlockchainService,
    private readonly validationService: WithdrawalValidationService,
    private readonly fraudService: WithdrawalFraudDetectionService,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  /**
   * Process withdrawal request - orchestration only
   */
  async processWithdrawal(command: ProcessWithdrawalCommand): Promise<WithdrawalResult> {
    const withdrawalId = this.generateWithdrawalId(command);
    
    // Prevent duplicate processing
    if (this.processingLocks.get(withdrawalId)) {
      return { 
        success: false, 
        error: 'Withdrawal already being processed' 
      };
    }

    this.processingLocks.set(withdrawalId, true);
    
    try {
      // Step 1: Validation
      const validationResult = this.validationService.validateRequest(
        command.destinationAddress,
        command.amountNano,
        command.twoFactorCode
      );

      if (!validationResult.isValid) {
        throw new Error(validationResult.errors.join(', '));
      }

      // Step 2: Load user and check balance
      const user = await this.userRepository.findById(command.userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.hasSufficientBalance(Number(command.amountNano))) {
        throw new Error('Insufficient balance');
      }

      // Step 3: Check daily limits
      const dailyTotal = await this.withdrawalRepository.getDailyTotalForUser(
        command.userId,
        new Date()
      );

      const dailyValidation = this.validationService.validateDailyLimit(
        dailyTotal,
        command.amountNano
      );

      if (!dailyValidation.isValid) {
        throw new Error(dailyValidation.errors.join(', '));
      }

      // Step 4: Fraud detection
      const withdrawalPattern = await this.buildWithdrawalPattern(
        command.userId,
        command.destinationAddress
      );

      const fraudResult = this.fraudService.assessRisk(
        withdrawalPattern,
        command.amountNano,
        command.destinationAddress
      );

      if (!fraudResult.passed) {
        const fraudEvent = this.fraudService.generateFraudEvent(
          command.userId,
          withdrawalId,
          fraudResult
        );
        
        if (fraudEvent) {
          await this.eventBus.publish(fraudEvent);
        }

        if (fraudResult.requiresManualReview) {
          // Create pending withdrawal for manual review
          const withdrawal = WithdrawalAggregate.createPendingForReview(
            withdrawalId,
            command.userId,
            new TONAddress(command.destinationAddress),
            new WithdrawalAmount(command.amountNano),
            fraudResult.reasons.join('; ')
          );
          
          await this.withdrawalRepository.save(withdrawal);
          throw new Error('Withdrawal requires manual review');
        }

        throw new Error(fraudResult.reasons[0] || 'Security check failed');
      }

      // Step 5: Create withdrawal aggregate
      const withdrawal = WithdrawalAggregate.create(
        withdrawalId,
        command.userId,
        new TONAddress(command.destinationAddress),
        new WithdrawalAmount(command.amountNano),
        command.message
      );

      // Step 6: Process withdrawal transaction
      await this.userRepository.beginTransaction(async () => {
        // Deduct balance
        user.deductBalance(Number(command.amountNano));
        await this.userRepository.save(user);

        // Save withdrawal
        await this.withdrawalRepository.save(withdrawal);

        // Broadcast to blockchain
        const txHash = await this.blockchainService.sendTransaction(
          command.destinationAddress,
          command.amountNano,
          command.message
        );

        // Mark as completed
        withdrawal.markAsCompleted(txHash);
        await this.withdrawalRepository.save(withdrawal);

        // Publish events
        await this.eventBus.publish(new WithdrawalCreatedEvent(
          withdrawalId,
          command.userId,
          command.amountNano.toString(),
          command.destinationAddress
        ));

        await this.eventBus.publish(new WithdrawalCompletedEvent(
          withdrawalId,
          command.userId,
          txHash
        ));

        return txHash;
      });

      return {
        success: true,
        withdrawalId,
        txHash: withdrawal.getTxHash()
      };

    } catch (error) {
      this.logger.error('Withdrawal processing failed', error);
      
      // Publish failure event
      await this.eventBus.publish(new WithdrawalFailedEvent(
        withdrawalId,
        command.userId,
        error instanceof Error ? error.message : 'Unknown error'
      ));

      return {
        success: false,
        withdrawalId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.processingLocks.delete(withdrawalId);
    }
  }

  /**
   * Build withdrawal pattern for fraud detection
   */
  private async buildWithdrawalPattern(
    userId: string,
    destinationAddress: string
  ): Promise<any> {
    const [
      recentWithdrawals,
      hourlyWithdrawals,
      dailyTotal,
      uniqueAddresses,
      isNewAddress,
      user
    ] = await Promise.all([
      this.withdrawalRepository.getRecentWithdrawals(userId, 24),
      this.withdrawalRepository.getRecentWithdrawals(userId, 1),
      this.withdrawalRepository.getDailyTotalForUser(userId, new Date()),
      this.withdrawalRepository.getUniqueAddressCount(userId),
      this.withdrawalRepository.isNewAddress(userId, destinationAddress),
      this.userRepository.findById(userId)
    ]);

    const accountAgeInDays = user 
      ? Math.floor((Date.now() - user.getCreatedAt().getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      userId,
      recentWithdrawalCount: recentWithdrawals.length,
      hourlyWithdrawalCount: hourlyWithdrawals.length,
      dailyTotalNano: dailyTotal,
      uniqueAddressesUsed: uniqueAddresses,
      isNewAddress,
      accountAgeInDays
    };
  }

  /**
   * Generate deterministic withdrawal ID
   */
  private generateWithdrawalId(command: ProcessWithdrawalCommand): string {
    const hash = createHash('sha256');
    hash.update(command.userId);
    hash.update(command.destinationAddress);
    hash.update(command.amountNano.toString());
    hash.update(Date.now().toString());
    return `wd_${hash.digest('hex').substring(0, 16)}`;
  }
}
