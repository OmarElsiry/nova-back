/**
 * Shared types for deposit system
 * Used by both frontend and backend
 */

export interface DepositParams {
  txHash: string;
  address: string; // Can be canonical or variant
  amountNano: string;
  bounceFlag: boolean;
  blockSeqno: number;
}

export interface DepositResponse {
  id: string;
  txHash: string;
  amount: string;
  status: 'pending' | 'confirmed' | 'failed';
  address: string;
  createdAt: string;
  confirmedAt?: string;
  confirmationDepth: number;
  reorgSafe: boolean;
}

export interface AddressGenerationParams {
  userId: string;
  rawAddress: string;
}

export interface AddressGenerationResponse {
  canonical: string;
  variant: string;
  qrCodeUrl: string;
}

export interface AddressValidationResponse {
  valid: boolean;
  canonical: string | null;
}

export interface UserDepositsResponse {
  deposits: DepositResponse[];
  total: string;
  count: number;
}

export interface DepositMetadata {
  blockSeqno: number;
  bounceFlag: boolean;
  [key: string]: any;
}

export interface CanonicalAddressRecord {
  id: string;
  userId: string;
  address: string;
  network: string;
  createdAt: string;
}

export interface AddressVariantRecord {
  id: string;
  canonicalId: string;
  variant: string;
  version: number;
  status: 'active' | 'deprecated';
  createdAt: string;
}
