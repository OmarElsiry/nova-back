/**
 * Blockchain Service Interface
 * Domain service for blockchain operations
 */

export interface BlockchainTransaction {
  to: string;
  amountNano: bigint;
  message?: string;
}

export interface BlockchainResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface IBlockchainService {
  sendTransaction(tx: BlockchainTransaction): Promise<BlockchainResult>;
  getBalance(address: string): Promise<bigint>;
  validateAddress(address: string): boolean;
}
