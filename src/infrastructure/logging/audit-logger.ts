/**
 * Audit Logger for Financial Operations
 * Provides tamper-proof logging for all financial transactions
 */

import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

export interface AuditLogEntry {
  timestamp: Date;
  eventType: AuditEventType;
  userId?: number;
  telegramId?: string;
  action: string;
  amount?: bigint;
  destinationAddress?: string;
  sourceAddress?: string;
  transactionId?: string;
  channelId?: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  hash?: string;
  previousHash?: string;
}

export enum AuditEventType {
  // Financial events
  WITHDRAWAL_REQUESTED = 'WITHDRAWAL_REQUESTED',
  WITHDRAWAL_APPROVED = 'WITHDRAWAL_APPROVED',
  WITHDRAWAL_REJECTED = 'WITHDRAWAL_REJECTED',
  WITHDRAWAL_COMPLETED = 'WITHDRAWAL_COMPLETED',
  WITHDRAWAL_FAILED = 'WITHDRAWAL_FAILED',
  DEPOSIT_RECEIVED = 'DEPOSIT_RECEIVED',
  DEPOSIT_CREDITED = 'DEPOSIT_CREDITED',
  
  // Purchase events
  PURCHASE_INITIATED = 'PURCHASE_INITIATED',
  PURCHASE_COMPLETED = 'PURCHASE_COMPLETED',
  PURCHASE_REFUNDED = 'PURCHASE_REFUNDED',
  ESCROW_HELD = 'ESCROW_HELD',
  ESCROW_RELEASED = 'ESCROW_RELEASED',
  
  // Security events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  ADMIN_ACTION = 'ADMIN_ACTION',
  
  // System events
  SERVICE_STARTED = 'SERVICE_STARTED',
  SERVICE_STOPPED = 'SERVICE_STOPPED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  RPC_ERROR = 'RPC_ERROR',
}

export class AuditLogger {
  private static instance: AuditLogger;
  private prisma: PrismaClient;
  private logDir: string;
  private previousHash: string = '0';
  private readonly hashAlgorithm = 'sha256';
  
  private constructor(prisma: PrismaClient, logDir?: string) {
    this.prisma = prisma;
    this.logDir = logDir || join(process.cwd(), 'logs', 'audit');
    this.ensureLogDirectory();
    this.loadPreviousHash();
  }
  
  static getInstance(prisma: PrismaClient, logDir?: string): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger(prisma, logDir);
    }
    return AuditLogger.instance;
  }
  
  private ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  private async loadPreviousHash(): Promise<void> {
    try {
      // Get the last audit log from database to maintain chain
      const lastLog = await this.prisma.$queryRaw<{hash: string}[]>`
        SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1
      `;
      if (lastLog && lastLog[0]) {
        this.previousHash = lastLog[0].hash;
      }
    } catch (error) {
      // Table might not exist yet
      console.error('Could not load previous hash:', error);
    }
  }
  
  private calculateHash(entry: Omit<AuditLogEntry, 'hash'>): string {
    const data = {
      ...entry,
      previousHash: this.previousHash,
    };
    const jsonString = JSON.stringify(data, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    return createHash(this.hashAlgorithm).update(jsonString).digest('hex');
  }
  
  async log(entry: Omit<AuditLogEntry, 'hash' | 'previousHash' | 'timestamp'>): Promise<void> {
    const timestamp = new Date();
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp,
      previousHash: this.previousHash,
    };
    
    // Calculate hash for tamper detection
    const hash = this.calculateHash(fullEntry);
    fullEntry.hash = hash;
    
    try {
      // Write to database for queryability
      await this.writeToDatabase(fullEntry);
      
      // Write to file for immutability
      this.writeToFile(fullEntry);
      
      // Update previous hash for chain
      this.previousHash = hash;
    } catch (error) {
      // Critical: If audit logging fails, system should not proceed with financial operations
      console.error('CRITICAL: Audit logging failed', error);
      throw new Error('Audit logging failed - operation aborted for security');
    }
  }
  
  private async writeToDatabase(entry: AuditLogEntry): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO audit_logs (
        timestamp, event_type, user_id, telegram_id, action,
        amount, destination_address, source_address, transaction_id,
        channel_id, ip_address, user_agent, metadata, hash, previous_hash
      ) VALUES (
        ${entry.timestamp}, ${entry.eventType}, ${entry.userId || null},
        ${entry.telegramId || null}, ${entry.action},
        ${entry.amount?.toString() || null}, ${entry.destinationAddress || null},
        ${entry.sourceAddress || null}, ${entry.transactionId || null},
        ${entry.channelId || null}, ${entry.ipAddress || null},
        ${entry.userAgent || null}, ${JSON.stringify(entry.metadata || {})},
        ${entry.hash}, ${entry.previousHash}
      )
    `;
  }
  
  private writeToFile(entry: AuditLogEntry): void {
    const date = entry.timestamp.toISOString().split('T')[0];
    const filename = join(this.logDir, `audit-${date}.log`);
    const logLine = JSON.stringify(entry, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ) + '\n';
    
    appendFileSync(filename, logLine, 'utf-8');
  }
  
  // Specialized logging methods for common operations
  async logWithdrawal(
    userId: number,
    amount: bigint,
    destinationAddress: string,
    eventType: AuditEventType,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      userId,
      action: `${eventType}: ${amount} nano to ${destinationAddress}`,
      amount,
      destinationAddress,
      metadata,
    });
  }
  
  async logPurchase(
    buyerId: number,
    sellerId: number,
    channelId: number,
    amount: bigint,
    eventType: AuditEventType,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      userId: buyerId,
      action: `${eventType}: Channel ${channelId} for ${amount} nano`,
      amount,
      channelId,
      metadata: {
        ...metadata,
        sellerId,
      },
    });
  }
  
  async logSecurityEvent(
    eventType: AuditEventType,
    action: string,
    userId?: number,
    ipAddress?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      userId,
      action,
      ipAddress,
      metadata,
    });
  }
  
  // Verify audit log integrity
  async verifyIntegrity(startDate?: Date, endDate?: Date): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    try {
      const logs = await this.prisma.$queryRaw<AuditLogEntry[]>`
        SELECT * FROM audit_logs 
        WHERE timestamp >= ${startDate || new Date(0)}
        AND timestamp <= ${endDate || new Date()}
        ORDER BY id ASC
      `;
      
      let previousHash = '0';
      
      for (const log of logs) {
        // Verify hash chain
        if (log.previousHash !== previousHash) {
          errors.push(`Chain broken at ${log.timestamp}: expected previous hash ${previousHash}, got ${log.previousHash}`);
        }
        
        // Verify hash integrity
        const { hash, previousHash: prevHash, ...logWithoutHash } = log;
        const expectedHash = this.calculateHash({
          ...logWithoutHash,
          previousHash: prevHash,
        });
        
        if (log.hash !== expectedHash) {
          errors.push(`Hash mismatch at ${log.timestamp}: expected ${expectedHash}, got ${log.hash}`);
        }
        
        previousHash = log.hash!;
      }
      
      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Verification failed: ${error}`],
      };
    }
  }
}

// SQL to create audit_logs table
export const CREATE_AUDIT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  user_id INTEGER,
  telegram_id VARCHAR(50),
  action TEXT NOT NULL,
  amount VARCHAR(50),
  destination_address VARCHAR(100),
  source_address VARCHAR(100),
  transaction_id VARCHAR(100),
  channel_id INTEGER,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSON,
  hash VARCHAR(64) NOT NULL,
  previous_hash VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_event (event_type),
  INDEX idx_audit_hash (hash)
);
`;
