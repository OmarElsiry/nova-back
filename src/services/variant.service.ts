import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Service for managing address variants with deterministic checksums
 * Ensures variant addresses can be validated without database lookups
 */
export class VariantService {
  private readonly secret: string;
  private readonly checksumLength = 8;

  constructor(secret?: string) {
    // SECURITY: Never use default secrets in production
    this.secret = secret || process.env.HMAC_SECRET || '';
    
    if (!this.secret) {
      throw new Error('SECURITY: HMAC_SECRET environment variable is required. Set it in your .env file.');
    }
    
    // Validate secret strength (minimum 32 characters)
    if (this.secret.length < 32) {
      throw new Error('SECURITY: HMAC_SECRET must be at least 32 characters long for adequate security.');
    }
    
    // Check for common weak secrets
    const weakSecrets = ['default', 'secret', 'password', 'changeme', 'test'];
    if (weakSecrets.some(weak => this.secret.toLowerCase().includes(weak))) {
      throw new Error('SECURITY: HMAC_SECRET appears to be a weak or default value. Use a cryptographically secure random string.');
    }
  }

  /**
   * Generate variant address with deterministic suffix
   * Format: {canonical}:{checksum}
   */
  generateVariant(canonicalAddress: string): string {
    const checksum = this.generateChecksum(canonicalAddress);
    return `${canonicalAddress}:${checksum}`;
  }

  /**
   * Validate variant address format and checksum
   */
  validateVariant(variant: string): boolean {
    const parts = variant.split(':');
    if (parts.length !== 2) return false;

    const [address, providedChecksum] = parts;
    if (!address || !providedChecksum) return false;
    
    const expectedChecksum = this.generateChecksum(address);

    // Use timing-safe comparison to prevent timing attacks
    try {
      const expected = Buffer.from(expectedChecksum);
      const provided = Buffer.from(providedChecksum);
      
      // Buffers must be same length for timingSafeEqual
      if (expected.length !== provided.length) {
        return false;
      }
      
      return timingSafeEqual(expected, provided);
    } catch {
      return false;
    }
  }

  /**
   * Extract canonical address from variant
   * Returns null if variant is invalid
   */
  extractCanonical(variant: string): string | null {
    if (!this.validateVariant(variant)) return null;
    const canonical = variant.split(':')[0];
    return canonical || null;
  }

  /**
   * Generate HMAC checksum for address
   * @private
   */
  private generateChecksum(address: string): string {
    const hmac = createHmac('sha256', this.secret);
    hmac.update(address);
    const hash = hmac.digest();

    // Convert to base32 and take first 8 chars
    return this.base32Encode(hash).substring(0, this.checksumLength);
  }

  /**
   * Encode buffer to base32 string
   * @private
   */
  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte === undefined) continue;
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }
}
