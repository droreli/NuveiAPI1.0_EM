/**
 * Nuvei REST API 1.0 Checksum Utilities
 * Version: Vbest
 * 
 * Handles checksum calculation using endpoint spec registry for authoritative field orders.
 * SECURITY: No sensitive data (secrets, CVVs, full PANs) is ever logged.
 */

import { 
  ENDPOINT_SPECS, 
  getEndpointSpec, 
  type EndpointSpec,
  type HashAlgorithm 
} from './endpointSpecs';

// ============================================================================
// Hash Functions (Cloudflare Workers compatible)
// ============================================================================

/**
 * Generate SHA-256 hash
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate SHA-1 hash
 */
async function sha1(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Simple Checksum Calculation (Backward Compatible)
// ============================================================================

/**
 * Calculate checksum for Nuvei API request
 * Simple version: concatenates all values in order and hashes
 * 
 * @param values - Array of values to concatenate (in order)
 * @param algorithm - Hash algorithm ('SHA256' or 'SHA1')
 * @returns The calculated checksum
 */
export async function calculateChecksum(
  values: string[],
  algorithm: HashAlgorithm = 'SHA256'
): Promise<string> {
  // Filter out undefined/null values (optional fields)
  const cleanValues = values.filter(v => v !== undefined && v !== null && v !== '');
  
  // Concatenate all values
  const concatenated = cleanValues.join('');
  
  // Calculate hash based on algorithm
  if (algorithm === 'SHA256') {
    return sha256(concatenated);
  } else {
    return sha1(concatenated);
  }
}

// ============================================================================
// Spec-Based Checksum Calculation (New Vbest Feature)
// ============================================================================

/**
 * Request data for checksum calculation
 */
export interface ChecksumRequestData {
  merchantId?: string;
  merchantSiteId?: string;
  clientRequestId?: string;
  timeStamp?: string;
  amount?: string;
  currency?: string;
  transactionType?: string;
  userTokenId?: string;
  relatedTransactionId?: string;
  clientUniqueId?: string;
  authCode?: string;
  comment?: string;
  urlDetails?: string;
  email?: string;
  countryCode?: string;
  firstName?: string;
  lastName?: string;
  sessionToken?: string;
  cardNumber?: string;
  userPaymentOptionId?: string;
  paymentMethodName?: string;
  transactionId?: string;
  [key: string]: string | undefined;
}

/**
 * Calculate checksum for a specific endpoint using the spec registry
 * This is the preferred method for Vbest - uses authoritative field orders
 * 
 * @param endpointName - Name of the endpoint (e.g., 'payment.do', 'getSessionToken')
 * @param requestData - Request data object
 * @param merchantSecretKey - Merchant secret key
 * @param algorithm - Hash algorithm (default: SHA256)
 * @returns The calculated checksum
 */
export async function calculateChecksumForEndpoint(
  endpointName: string,
  requestData: ChecksumRequestData,
  merchantSecretKey: string,
  algorithm: HashAlgorithm = 'SHA256'
): Promise<string> {
  const spec = getEndpointSpec(endpointName);
  
  if (!spec) {
    throw new Error(`Unknown endpoint: ${endpointName}. Cannot calculate checksum.`);
  }
  
  if (!spec.requiresChecksum) {
    throw new Error(`Endpoint ${endpointName} does not require checksum.`);
  }
  
  // Build values array in correct order from spec
  const values: string[] = [];
  
  for (const field of spec.checksumFields) {
    let value: string | undefined;
    
    if (field.fromEnv && field.name === 'merchantSecretKey') {
      value = merchantSecretKey;
    } else if (field.fromRequest) {
      value = requestData[field.name];
    }
    
    // Handle required vs optional fields
    if (field.required && (value === undefined || value === null || value === '')) {
      // For required fields, use empty string if missing (to maintain checksum parity)
      // In production, you'd want to throw an error
      value = '';
    }
    
    // Only include if value exists (handles optional fields)
    if (value !== undefined && value !== null) {
      values.push(value.toString());
    }
  }
  
  return calculateChecksum(values, algorithm);
}

/**
 * Verify a checksum from incoming request
 * 
 * @param endpointName - Name of the endpoint
 * @param requestData - Request data including the checksum to verify
 * @param providedChecksum - The checksum provided in the request
 * @param merchantSecretKey - Merchant secret key
 * @param algorithm - Hash algorithm
 * @returns True if checksum matches
 */
export async function verifyChecksum(
  endpointName: string,
  requestData: ChecksumRequestData,
  providedChecksum: string,
  merchantSecretKey: string,
  algorithm: HashAlgorithm = 'SHA256'
): Promise<boolean> {
  try {
    const calculated = await calculateChecksumForEndpoint(
      endpointName,
      requestData,
      merchantSecretKey,
      algorithm
    );
    
    return calculated.toLowerCase() === providedChecksum.toLowerCase();
  } catch {
    return false;
  }
}

// ============================================================================
// Timestamp & ID Generation
// ============================================================================

/**
 * Generate timestamp in Nuvei format (YYYYMMDDHHmmss)
 */
export function generateTimestamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Generate unique client request ID
 */
export function generateClientRequestId(): string {
  return `${generateTimestamp()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Generate transaction ID (emulator format)
 */
export function generateTransactionId(): string {
  return `${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate auth code (6-char alphanumeric)
 */
export function generateAuthCode(): string {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * Generate session token (emulator format)
 */
export function generateSessionToken(): string {
  const chars = 'abcdef0123456789';
  let token = '';
  
  // UUID-like format: 8-4-4-4-12
  const segments = [8, 4, 4, 4, 12];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) token += '-';
    for (let j = 0; j < segments[i]; j++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  
  return token;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Mask PAN for safe logging (show first 6 and last 4)
 */
export function maskPAN(cardNumber: string): string {
  if (!cardNumber || cardNumber.length < 13) return '****';
  const first6 = cardNumber.slice(0, 6);
  const last4 = cardNumber.slice(-4);
  const masked = '*'.repeat(cardNumber.length - 10);
  return `${first6}${masked}${last4}`;
}

/**
 * Get endpoint spec by name (re-export for convenience)
 */
export { getEndpointSpec, ENDPOINT_SPECS, type EndpointSpec, type HashAlgorithm };
