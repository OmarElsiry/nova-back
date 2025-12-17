/**
 * Fraud Detection Service Interface
 * Domain service for assessing withdrawal risk
 */

import { WithdrawalAmount, TONAddress } from '../withdrawal/WithdrawalValueObjects';

export interface FraudAssessmentRequest {
  userId: number;
  amount: WithdrawalAmount;
  destination: TONAddress;
}

export interface FraudAssessmentResult {
  score: number; // 0-1, where 1 is highest risk
  factors: string[];
  requiresManualReview: boolean;
}

export interface IFraudDetectionService {
  assessRisk(request: FraudAssessmentRequest): Promise<FraudAssessmentResult>;
}
