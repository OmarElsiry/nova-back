import { z } from 'zod';

export const withdrawalRequestSchema = z.object({
  userId: z.number(),
  amount: z.number().min(0.1),
  walletAddress: z.string().min(1),
  memo: z.string().optional()
});

export const withdrawalStatusSchema = z.object({
  withdrawalId: z.number(),
  status: z.enum(['approved', 'rejected', 'completed', 'failed'])
});

export interface WithdrawalRequest {
  userId: number;
  amount: number;
  walletAddress: string;
  memo?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  sanitizedData?: WithdrawalRequest;
}

export class WithdrawalValidationService {
  private readonly MIN_WITHDRAWAL = 0.1;
  private readonly MAX_WITHDRAWAL = 10000;
  private readonly WALLET_ADDRESS_REGEX = /^[A-Za-z0-9_-]{48}$/;

  validateRequest(data: any): ValidationResult {
    try {
      // Parse with Zod
      const parsed = withdrawalRequestSchema.parse(data);
      
      // Additional validations
      const errors: string[] = [];
      
      if (parsed.amount < this.MIN_WITHDRAWAL) {
        errors.push(`Minimum withdrawal is ${this.MIN_WITHDRAWAL} TON`);
      }
      
      if (parsed.amount > this.MAX_WITHDRAWAL) {
        errors.push(`Maximum withdrawal is ${this.MAX_WITHDRAWAL} TON`);
      }
      
      if (!this.isValidWalletAddress(parsed.walletAddress)) {
        errors.push('Invalid wallet address format');
      }
      
      if (errors.length > 0) {
        return {
          isValid: false,
          errors
        };
      }
      
      return {
        isValid: true,
        sanitizedData: parsed
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(e => e.message)
        };
      }
      
      return {
        isValid: false,
        errors: ['Invalid withdrawal request data']
      };
    }
  }

  private isValidWalletAddress(address: string): boolean {
    // Basic TON address validation
    return this.WALLET_ADDRESS_REGEX.test(address) || 
           address.startsWith('EQ') || 
           address.startsWith('UQ');
  }

  sanitizeWalletAddress(address: string): string {
    // Remove any whitespace and validate format
    return address.trim();
  }

  validateWithdrawalAmount(amount: number, balance: number): ValidationResult {
    const errors: string[] = [];
    
    if (amount <= 0) {
      errors.push('Amount must be positive');
    }
    
    if (amount > balance) {
      errors.push('Insufficient balance');
    }
    
    if (amount < this.MIN_WITHDRAWAL) {
      errors.push(`Minimum withdrawal is ${this.MIN_WITHDRAWAL} TON`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
