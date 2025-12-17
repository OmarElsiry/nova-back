/**
 * BigInt Serialization Utility
 * 
 * Enables BigInt values to be serialized to JSON
 */

/**
 * Initialize BigInt serialization
 * Call this once at application startup
 */
export function initializeBigIntSerialization(): void {
  // Add toJSON method to BigInt prototype
  (BigInt.prototype as any).toJSON = function() {
    return this.toString();
  };
}

/**
 * Parse BigInt from string
 * Use this when receiving BigInt values from API
 */
export function parseBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  return BigInt(value);
}

/**
 * Serialize object with BigInt values
 */
export function serializeWithBigInt(obj: any): string {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

/**
 * Parse object with BigInt values
 */
export function parseWithBigInt(json: string, bigIntKeys: string[] = []): any {
  return JSON.parse(json, (key, value) => {
    if (bigIntKeys.includes(key) && typeof value === 'string') {
      try {
        return BigInt(value);
      } catch {
        return value;
      }
    }
    return value;
  });
}
