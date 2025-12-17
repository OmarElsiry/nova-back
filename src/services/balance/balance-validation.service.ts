import { z } from 'zod';

export const balanceRequestSchema = z.object({
  walletAddress: z.string().min(1),
  refresh: z.boolean().optional()
});

export const balanceUpdateSchema = z.object({
  userId: z.number(),
  amount: z.number(),
  operation: z.enum(['add', 'deduct', 'set'])
});

export interface BalanceRequest {
  walletAddress: string;
  refresh?: boolean;
}

export interface BalanceUpdate {
  userId: number;
  amount: number;
  operation: 'add' | 'deduct' | 'set';
}

export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: string[];
}

export class BalanceValidationService {
  private readonly MIN_AMOUNT = 0.001;
  private readonly MAX_AMOUNT = 1000000;

  validateBalanceRequest(data: any): ValidationResult<BalanceRequest> {
    try {
      const parsed = balanceRequestSchema.parse(data);
      
      if (!this.isValidWalletAddress(parsed.walletAddress)) {
        return {
          isValid: false,
          errors: ['Invalid wallet address format']
        };
      }
      
      return {
        isValid: true,
        data: parsed
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
        errors: ['Invalid balance request data']
      };
    }
  }

  validateBalanceUpdate(data: any): ValidationResult<BalanceUpdate> {
    try {
      const parsed = balanceUpdateSchema.parse(data);
      
      // Validate amount based on operation
      if (parsed.operation !== 'set' && parsed.amount <= 0) {
        return {
          isValid: false,
          errors: ['Amount must be positive for add/deduct operations']
        };
      }
      
      if (parsed.amount < 0) {
        return {
          isValid: false,
          errors: ['Amount cannot be negative']
        };
      }
      
      if (parsed.amount > this.MAX_AMOUNT) {
        return {
          isValid: false,
          errors: [`Maximum amount is ${this.MAX_AMOUNT}`]
        };
      }
      
      return {
        isValid: true,
        data: parsed
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
        errors: ['Invalid balance update data']
      };
    }
  }

  validateAmount(amount: number): ValidationResult<number> {
    if (amount < this.MIN_AMOUNT) {
      return {
        isValid: false,
        errors: [`Minimum amount is ${this.MIN_AMOUNT}`]
      };
    }
    
    if (amount > this.MAX_AMOUNT) {
      return {
        isValid: false,
        errors: [`Maximum amount is ${this.MAX_AMOUNT}`]
      };
    }
    
    if (!isFinite(amount)) {
      return {
        isValid: false,
        errors: ['Amount must be a finite number']
      };
    }
    
    return {
      isValid: true,
      data: amount
    };
  }

  private isValidWalletAddress(address: string): boolean {
    // Basic TON address validation
    return address.length === 48 || 
           address.startsWith('EQ') || 
           address.startsWith('UQ');
  }
}
