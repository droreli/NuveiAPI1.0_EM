/**
 * Nuvei REST API 1.0 Endpoint Specifications
 * Source of Truth: MCP Nuvei Documentation
 * Version: Vbest
 * 
 * This registry defines authoritative checksum field orders and endpoint metadata
 * for all supported Nuvei PPP API endpoints.
 */

export type HashAlgorithm = 'SHA256' | 'SHA1';

export interface ChecksumField {
  name: string;
  required: boolean;
  fromRequest?: boolean;  // field comes from request body
  fromEnv?: boolean;      // field comes from environment (merchantSecretKey)
}

export interface EndpointSpec {
  path: string;
  method: 'POST' | 'GET';
  description: string;
  checksumFields: ChecksumField[];
  requiresChecksum: boolean;
  requiresSessionToken: boolean;
  category: 'session' | 'payment' | 'operation' | 'user' | 'payout' | 'lookup' | 'apm' | '3ds';
  sandboxUrl: string;
}

/**
 * Authoritative checksum field orders from Nuvei MCP documentation
 */
export const ENDPOINT_SPECS: Record<string, EndpointSpec> = {
  // Session Management
  getSessionToken: {
    path: '/getSessionToken.do',
    method: 'POST',
    description: 'Creates a session token for subsequent API calls',
    category: 'session',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getSessionToken.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  // Payment Operations
  'payment.do': {
    path: '/payment.do',
    method: 'POST',
    description: 'Process Auth or Sale transaction',
    category: 'payment',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/payment.do',
    // NOTE: transactionType is NOT included per MCP docs
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'amount', required: true, fromRequest: true },
      { name: 'currency', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  initPayment: {
    path: '/initPayment.do',
    method: 'POST',
    description: 'Initialize payment before 3DS/payment flow',
    category: 'payment',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/initPayment.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'amount', required: true, fromRequest: true },
      { name: 'currency', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  // 3DS Endpoints
  authorize3d: {
    path: '/authorize3d.do',
    method: 'POST',
    description: 'Initiate 3DS authentication (MPI-only first step)',
    category: '3ds',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/authorize3d.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'amount', required: true, fromRequest: true },
      { name: 'currency', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  verify3d: {
    path: '/verify3d.do',
    method: 'POST',
    description: 'Complete 3DS verification and get MPI data (eci, cavv, dsTransID)',
    category: '3ds',
    requiresChecksum: false,  // Per MCP docs, examples omit checksum
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/verify3d.do',
    checksumFields: [] // No checksum required per docs
  },

  // Financial Operations
  settleTransaction: {
    path: '/settleTransaction.do',
    method: 'POST',
    description: 'Settle (capture) a previously authorized transaction',
    category: 'operation',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/settleTransaction.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: false, fromRequest: true },
      { name: 'clientUniqueId', required: true, fromRequest: true },
      { name: 'amount', required: true, fromRequest: true },
      { name: 'currency', required: true, fromRequest: true },
      { name: 'relatedTransactionId', required: true, fromRequest: true },
      { name: 'authCode', required: false, fromRequest: true },
      { name: 'comment', required: false, fromRequest: true },
      { name: 'urlDetails', required: false, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  voidTransaction: {
    path: '/voidTransaction.do',
    method: 'POST',
    description: 'Void (cancel) a previously authorized transaction',
    category: 'operation',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/voidTransaction.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: false, fromRequest: true },
      { name: 'clientUniqueId', required: true, fromRequest: true },
      { name: 'amount', required: true, fromRequest: true },
      { name: 'currency', required: true, fromRequest: true },
      { name: 'relatedTransactionId', required: true, fromRequest: true },
      { name: 'authCode', required: false, fromRequest: true },
      { name: 'comment', required: false, fromRequest: true },
      { name: 'urlDetails', required: false, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  refundTransaction: {
    path: '/refundTransaction.do',
    method: 'POST',
    description: 'Refund a settled transaction (full or partial)',
    category: 'operation',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/refundTransaction.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: false, fromRequest: true },
      { name: 'clientUniqueId', required: true, fromRequest: true },
      { name: 'amount', required: true, fromRequest: true },
      { name: 'currency', required: true, fromRequest: true },
      { name: 'relatedTransactionId', required: true, fromRequest: true },
      { name: 'authCode', required: false, fromRequest: true },
      { name: 'comment', required: false, fromRequest: true },
      { name: 'urlDetails', required: false, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  // User Management
  createUser: {
    path: '/createUser.do',
    method: 'POST',
    description: 'Register a user and obtain userTokenId',
    category: 'user',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/createUser.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'userTokenId', required: true, fromRequest: true },
      { name: 'email', required: true, fromRequest: true },
      { name: 'countryCode', required: true, fromRequest: true },
      { name: 'firstName', required: true, fromRequest: true },
      { name: 'lastName', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  // User Payment Options
  getUserUPOs: {
    path: '/getUserUPOs.do',
    method: 'POST',
    description: 'Retrieve user payment options',
    category: 'user',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getUserUPOs.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'userTokenId', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  addUPOCreditCard: {
    path: '/addUPOCreditCard.do',
    method: 'POST',
    description: 'Add credit card as user payment option',
    category: 'user',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/addUPOCreditCard.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'userTokenId', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  deleteUPO: {
    path: '/deleteUPO.do',
    method: 'POST',
    description: 'Delete a user payment option',
    category: 'user',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/deleteUPO.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'userPaymentOptionId', required: true, fromRequest: true },
      { name: 'userTokenId', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  // Payouts
  'payout.do': {
    path: '/payout.do',
    method: 'POST',
    description: 'Initiate payout to card or APM',
    category: 'payout',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/payout.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'userTokenId', required: true, fromRequest: true },
      { name: 'amount', required: true, fromRequest: true },
      { name: 'currency', required: true, fromRequest: true },
      { name: 'paymentMethodName', required: false, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  getPayoutStatus: {
    path: '/getPayoutStatus.do',
    method: 'POST',
    description: 'Check status of a payout',
    category: 'payout',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getPayoutStatus.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'userTokenId', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  // Lookup & Info
  getPaymentStatus: {
    path: '/getPaymentStatus.do',
    method: 'POST',
    description: 'Get payment status by sessionToken',
    category: 'lookup',
    requiresChecksum: false,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getPaymentStatus.do',
    checksumFields: []
  },

  getTransactionDetails: {
    path: '/getTransactionDetails.do',
    method: 'POST',
    description: 'Get transaction details by transactionId',
    category: 'lookup',
    requiresChecksum: true,
    requiresSessionToken: false,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getTransactionDetails.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'transactionId', required: false, fromRequest: true },
      { name: 'clientUniqueId', required: false, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  getCardDetails: {
    path: '/getCardDetails.do',
    method: 'POST',
    description: 'Get card BIN details (brand, type, issuing country)',
    category: 'lookup',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getCardDetails.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'sessionToken', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'cardNumber', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  // APM Operations
  getMerchantPaymentMethods: {
    path: '/getMerchantPaymentMethods.do',
    method: 'POST',
    description: 'Get available payment methods for merchant',
    category: 'apm',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getMerchantPaymentMethods.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  },

  getMcpRates: {
    path: '/getMcpRates.do',
    method: 'POST',
    description: 'Get multi-currency pricing rates',
    category: 'apm',
    requiresChecksum: true,
    requiresSessionToken: true,
    sandboxUrl: 'https://ppp-test.safecharge.com/ppp/api/v1/getMcpRates.do',
    checksumFields: [
      { name: 'merchantId', required: true, fromRequest: true },
      { name: 'merchantSiteId', required: true, fromRequest: true },
      { name: 'clientRequestId', required: true, fromRequest: true },
      { name: 'timeStamp', required: true, fromRequest: true },
      { name: 'merchantSecretKey', required: true, fromEnv: true }
    ]
  }
};

/**
 * Test card database with documented 3DS behaviors
 */
export interface TestCard {
  cardNumber: string;
  brand: string;
  behavior: string;
  threeDSFlow: 'frictionless' | 'challenge' | 'decline' | 'none' | 'error';
  expectedEci: string;
  description: string;
}

export const TEST_CARDS: TestCard[] = [
  // Visa 3DS Test Cards
  {
    cardNumber: '4000027891380961',
    brand: 'Visa',
    behavior: '3DS Challenge - Approved',
    threeDSFlow: 'challenge',
    expectedEci: '05',
    description: 'Challenge flow with successful authentication'
  },
  {
    cardNumber: '4000020951595032',
    brand: 'Visa',
    behavior: '3DS Frictionless - Approved',
    threeDSFlow: 'frictionless',
    expectedEci: '05',
    description: 'Frictionless flow with successful authentication'
  },
  {
    cardNumber: '4012000100000007',
    brand: 'Visa',
    behavior: 'Non-3DS - Approved',
    threeDSFlow: 'none',
    expectedEci: '07',
    description: 'Standard approval without 3DS'
  },
  {
    cardNumber: '4000000000001091',
    brand: 'Visa',
    behavior: '3DS Challenge - Approved (Generic)',
    threeDSFlow: 'challenge',
    expectedEci: '05',
    description: 'Generic challenge flow test card'
  },
  {
    cardNumber: '4000000000001000',
    brand: 'Visa',
    behavior: '3DS Frictionless - Approved (Generic)',
    threeDSFlow: 'frictionless',
    expectedEci: '05',
    description: 'Generic frictionless flow test card'
  },
  {
    cardNumber: '4000000000001109',
    brand: 'Visa',
    behavior: '3DS - Declined Authentication',
    threeDSFlow: 'decline',
    expectedEci: '07',
    description: 'Authentication declined by issuer'
  },
  
  // Mastercard 3DS Test Cards
  {
    cardNumber: '5333306200310007',
    brand: 'Mastercard',
    behavior: '3DS Frictionless - Approved',
    threeDSFlow: 'frictionless',
    expectedEci: '02',
    description: 'Mastercard frictionless flow'
  },
  {
    cardNumber: '5200000000001005',
    brand: 'Mastercard',
    behavior: '3DS Challenge - Approved',
    threeDSFlow: 'challenge',
    expectedEci: '02',
    description: 'Mastercard challenge flow'
  },
  {
    cardNumber: '5111111111111118',
    brand: 'Mastercard',
    behavior: 'Non-3DS - Approved',
    threeDSFlow: 'none',
    expectedEci: '07',
    description: 'Mastercard without 3DS'
  },

  // AMEX Test Cards
  {
    cardNumber: '374245455400001',
    brand: 'AMEX',
    behavior: '3DS Frictionless - Approved',
    threeDSFlow: 'frictionless',
    expectedEci: '05',
    description: 'AMEX frictionless flow'
  },

  // Decline Test Cards
  {
    cardNumber: '4000000000000002',
    brand: 'Visa',
    behavior: 'Decline - Insufficient Funds',
    threeDSFlow: 'none',
    expectedEci: '',
    description: 'Declined - code 51 (Insufficient Funds)'
  },
  {
    cardNumber: '4000000000000069',
    brand: 'Visa',
    behavior: 'Decline - Expired Card',
    threeDSFlow: 'none',
    expectedEci: '',
    description: 'Declined - code 54 (Expired Card)'
  },
  {
    cardNumber: '4000000000000127',
    brand: 'Visa',
    behavior: 'Decline - Invalid CVV',
    threeDSFlow: 'none',
    expectedEci: '',
    description: 'Declined - code N7 (CVV Mismatch)'
  },
  {
    cardNumber: '4000000000000119',
    brand: 'Visa',
    behavior: 'Decline - Do Not Honor',
    threeDSFlow: 'none',
    expectedEci: '',
    description: 'Declined - code 05 (Do Not Honor)'
  },

  // Error Simulation Cards
  {
    cardNumber: '4000000000000101',
    brand: 'Visa',
    behavior: 'Error - Connection Timeout',
    threeDSFlow: 'error',
    expectedEci: '',
    description: 'Simulates gateway timeout'
  }
];

/**
 * Response code database for realistic error simulation
 */
export interface ResponseCode {
  code: string;
  reason: string;
  status: 'APPROVED' | 'DECLINED' | 'ERROR' | 'PENDING';
  gwErrorCode: number;
  gwErrorReason: string;
}

export const RESPONSE_CODES: Record<string, ResponseCode> = {
  '0': {
    code: '0',
    reason: 'Approved',
    status: 'APPROVED',
    gwErrorCode: 0,
    gwErrorReason: ''
  },
  '-1': {
    code: '-1',
    reason: 'Error',
    status: 'ERROR',
    gwErrorCode: -1,
    gwErrorReason: 'General Error'
  },
  '51': {
    code: '51',
    reason: 'Insufficient Funds',
    status: 'DECLINED',
    gwErrorCode: 0,
    gwErrorReason: ''
  },
  '54': {
    code: '54',
    reason: 'Expired Card',
    status: 'DECLINED',
    gwErrorCode: 0,
    gwErrorReason: ''
  },
  '05': {
    code: '05',
    reason: 'Do Not Honor',
    status: 'DECLINED',
    gwErrorCode: 0,
    gwErrorReason: ''
  },
  '14': {
    code: '14',
    reason: 'Invalid Card Number',
    status: 'DECLINED',
    gwErrorCode: 0,
    gwErrorReason: ''
  },
  '41': {
    code: '41',
    reason: 'Lost Card',
    status: 'DECLINED',
    gwErrorCode: 0,
    gwErrorReason: ''
  },
  '43': {
    code: '43',
    reason: 'Stolen Card',
    status: 'DECLINED',
    gwErrorCode: 0,
    gwErrorReason: ''
  },
  'N7': {
    code: 'N7',
    reason: 'CVV Mismatch',
    status: 'DECLINED',
    gwErrorCode: 0,
    gwErrorReason: ''
  }
};

/**
 * Helper to get endpoint spec by name or path
 */
export function getEndpointSpec(nameOrPath: string): EndpointSpec | undefined {
  // Direct lookup by key
  if (ENDPOINT_SPECS[nameOrPath]) {
    return ENDPOINT_SPECS[nameOrPath];
  }
  
  // Lookup by path
  const pathWithDo = nameOrPath.endsWith('.do') ? nameOrPath : `${nameOrPath}.do`;
  const pathFormatted = pathWithDo.startsWith('/') ? pathWithDo : `/${pathWithDo}`;
  
  for (const spec of Object.values(ENDPOINT_SPECS)) {
    if (spec.path === pathFormatted) {
      return spec;
    }
  }
  
  return undefined;
}

/**
 * Get checksum field names in correct order for an endpoint
 */
export function getChecksumFieldOrder(endpointName: string): string[] {
  const spec = getEndpointSpec(endpointName);
  if (!spec || !spec.requiresChecksum) {
    return [];
  }
  return spec.checksumFields.map(f => f.name);
}

/**
 * Get test card by number
 */
export function getTestCard(cardNumber: string): TestCard | undefined {
  return TEST_CARDS.find(card => card.cardNumber === cardNumber);
}

/**
 * Get test cards by 3DS flow type
 */
export function getTestCardsByFlow(flow: TestCard['threeDSFlow']): TestCard[] {
  return TEST_CARDS.filter(card => card.threeDSFlow === flow);
}

/**
 * Utility: mask PAN for logging (show first 6 and last 4)
 */
export function maskPAN(cardNumber: string): string {
  if (!cardNumber || cardNumber.length < 13) return '****';
  const first6 = cardNumber.slice(0, 6);
  const last4 = cardNumber.slice(-4);
  const masked = '*'.repeat(cardNumber.length - 10);
  return `${first6}${masked}${last4}`;
}

/**
 * Utility: generate transaction ID
 */
export function generateTransactionId(): string {
  return `${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Utility: generate auth code
 */
export function generateAuthCode(): string {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}
