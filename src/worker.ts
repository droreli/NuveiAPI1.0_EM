// Cloudflare Worker - Nuvei REST API 1.0 Emulator Backend
// Version: Vbest
// Correct flow: getSessionToken → initPayment → payment.do (NO openOrder - that's for Web SDK)

import { 
  calculateChecksum, 
  calculateChecksumForEndpoint,
  generateTimestamp as genTs,
  generateClientRequestId,
  generateTransactionId,
  generateAuthCode,
  generateSessionToken,
  maskPAN
} from './checksum';

import {
  ENDPOINT_SPECS,
  TEST_CARDS,
  RESPONSE_CODES,
  getTestCard,
  getTestCardsByFlow,
  type TestCard
} from './endpointSpecs';

export interface Env {
  // KV namespace for webhooks (optional)
  WEBHOOKS?: KVNamespace;
}

interface EnvConfig {
  merchantId: string;
  merchantSiteId: string;
  merchantKey: string;
  baseUrl: string;
}

interface PaymentRequest {
  env: EnvConfig;
  card: {
    number: string;
    holderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
  };
  amount: string;
  currency: string;
  notificationUrl?: string;
  methodCompletionInd?: string;
  featureTest?: string;
  featureOption?: string;
}

interface LiabilityShiftRequest {
  env: EnvConfig;
  sessionToken: string;
  relatedTransactionId: string;
  card: {
    number: string;
    holderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
  };
  amount: string;
  currency: string;
}

interface OperationRequest {
  env: EnvConfig;
  relatedTransactionId: string;
  authCode?: string;
  amount: string;
  currency: string;
  notificationUrl?: string;
}

// In-memory webhook storage (resets on worker restart)
const webhookStore: Array<{
  id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}> = [];

// In-memory user storage for createUser endpoint
const userStore: Map<string, {
  userTokenId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  createdAt: string;
}> = new Map();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Helper to store operation responses as internal DMNs for visibility in the Webhooks tab
function storeInternalDmn(type: string, operation: string, response: Record<string, unknown>) {
  const dmn = {
    id: `dmn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    payload: {
      ...response,
      _dmnType: type,
      _operation: operation,
      _source: 'API Response',
      _receivedAt: new Date().toISOString(),
    },
  };
  webhookStore.unshift(dmn);
  if (webhookStore.length > 100) {
    webhookStore.pop();
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// Generate timestamp in Nuvei format (YYYYMMDDHHmmss)
function generateTimestamp(): string {
  return genTs();
}

// Generate unique request ID
function generateRequestId(): string {
  return `REQ_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== API HANDLERS ====================

// Test environment connection
async function handleTestEnv(request: Request): Promise<Response> {
  try {
    const { env } = await request.json() as { env: EnvConfig };

    if (!env?.merchantId || !env?.merchantSiteId || !env?.merchantKey) {
      return errorResponse('Missing required credentials');
    }

    // Get session token to test connection
    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();
    
    // Use spec-based checksum calculation (Vbest feature)
    const checksum = await calculateChecksumForEndpoint(
      'getSessionToken',
      {
        merchantId: env.merchantId,
        merchantSiteId: env.merchantSiteId,
        clientRequestId,
        timeStamp: timestamp
      },
      env.merchantKey
    );

    const requestBody = {
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      clientRequestId,
      timeStamp: timestamp,
      checksum,
    };

    const response = await fetch(`${env.baseUrl}/ppp/api/getSessionToken.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    return jsonResponse({
      success: result.status === 'SUCCESS',
      message: result.status === 'SUCCESS' ? 'Connection successful' : (result.reason || 'Connection failed'),
      sessionToken: result.sessionToken,
      debug: {
        timestamp,
        clientRequestId,
        nuveiResponse: result,
      }
    });
  } catch (error) {
    return errorResponse(`Test failed: ${error}`);
  }
}

// Run full 3DS payment flow: getSessionToken → initPayment → payment.do
async function handle3DSPayment(request: Request): Promise<Response> {
  try {
    const body = await request.json() as PaymentRequest;
    const { env, card, amount, currency, notificationUrl, methodCompletionInd, featureTest, featureOption } = body;

    if (!env?.merchantId || !env?.merchantSiteId || !env?.merchantKey) {
      return errorResponse('Missing required credentials');
    }

    const steps: Array<{
      stepId: string;
      stepName: string;
      status: string;
      request: { url: string; method: string; body: Record<string, unknown>; timestamp: string };
      response: { status: number; body: Record<string, unknown>; duration: number };
    }> = [];

    const context: Record<string, unknown> = {
      amount,
      currency,
      cardNumber: card.number,
      cardHolder: card.holderName,
    };
    const featureTestId = typeof featureTest === 'string' ? featureTest : '';
    const featureOptionValue = typeof featureOption === 'string' ? featureOption : '';

    const notificationUrlKeys = (() => {
      if (
        featureTestId === 'notificationUrlCasing' &&
        ['notificationURL', 'notificationUrl', 'NotificationUrl'].includes(featureOptionValue)
      ) {
        return [featureOptionValue];
      }
      return ['notificationURL'];
    })();
    const methodNotificationUrlMode = featureTestId === 'methodNotificationUrlMode' && featureOptionValue === 'off'
      ? 'off'
      : 'on';
    const browserDetailsMode = featureTestId === 'browserDetailsMode' &&
      ['full', 'minimal', 'omit'].includes(featureOptionValue)
        ? featureOptionValue
        : 'full';
    const platformType = featureTestId === 'platformType' && ['01', '02'].includes(featureOptionValue)
      ? featureOptionValue
      : '02';
    const challengePreference = featureTestId === 'challengePreference' &&
      ['01', '02', '03', '04'].includes(featureOptionValue)
        ? featureOptionValue
        : '01';
    const challengeWindowSize = featureTestId === 'challengeWindowSize' &&
      ['01', '02', '03', '04', '05'].includes(featureOptionValue)
        ? featureOptionValue
        : '05';

    if (featureTestId) {
      context.featureTest = featureTestId;
    }
    if (featureOptionValue) {
      context.featureOption = featureOptionValue;
    }

    // ===== STEP 1: getSessionToken =====
    const timestamp1 = generateTimestamp();
    const clientRequestId1 = generateRequestId();
    const checksum1 = await calculateChecksum(
      [env.merchantId, env.merchantSiteId, clientRequestId1, timestamp1, env.merchantKey],
      'SHA256'
    );

    const sessionBody = {
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      clientRequestId: clientRequestId1,
      timeStamp: timestamp1,
      checksum: checksum1,
    };

    const sessionStart = Date.now();
    const sessionResponse = await fetch(`${env.baseUrl}/ppp/api/getSessionToken.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionBody),
    });
    const sessionData = await sessionResponse.json() as Record<string, unknown>;

    steps.push({
      stepId: 'getSessionToken',
      stepName: 'Get Session Token',
      status: sessionData.status === 'SUCCESS' ? 'success' : 'error',
      request: {
        url: `${env.baseUrl}/ppp/api/getSessionToken.do`,
        method: 'POST',
        body: sessionBody,
        timestamp: new Date().toISOString(),
      },
      response: {
        status: sessionResponse.status,
        body: sessionData,
        duration: Date.now() - sessionStart,
      },
    });

    if (sessionData.status !== 'SUCCESS') {
      return jsonResponse({ status: 'failed', steps, context, error: 'Failed to get session token' });
    }

    const sessionToken = sessionData.sessionToken as string;
    context.sessionToken = sessionToken;

    // ===== STEP 2: initPayment (3DS initialization) =====
    const clientRequestId2 = generateRequestId();
    const userTokenId = `user_${Date.now()}`;

    const methodNotificationUrl = notificationUrl?.replace('/3ds-notify', '/3ds-method-notify') ||
      `https://nuvei-api-emulator.ndocs.workers.dev/api/3ds-method-notify`;
    const initThreeD: Record<string, unknown> = {
      platformType, // Browser/App
    };
    if (methodNotificationUrlMode !== 'off') {
      initThreeD.methodNotificationUrl = methodNotificationUrl;
    }

    const initPaymentBody = {
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      sessionToken,
      clientRequestId: clientRequestId2,
      currency,
      amount,
      userTokenId,
      paymentOption: {
        card: {
          cardNumber: card.number,
          cardHolderName: card.holderName,
          expirationMonth: card.expMonth,
          expirationYear: card.expYear,
          CVV: card.cvv,
          threeD: initThreeD,
        },
      },
      deviceDetails: {
        ipAddress: '192.168.1.1',
      },
    };

    const initStart = Date.now();
    const initResponse = await fetch(`${env.baseUrl}/ppp/api/initPayment.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initPaymentBody),
    });
    const initData = await initResponse.json() as Record<string, unknown>;

    // Mask card number in logged request
    const initBodyLog = {
      ...initPaymentBody,
      paymentOption: {
        card: {
          ...initPaymentBody.paymentOption.card,
          cardNumber: `****${card.number.slice(-4)}`,
        },
      },
    };

    steps.push({
      stepId: 'initPayment',
      stepName: 'Initialize Payment (3DS)',
      status: initData.status === 'SUCCESS' ? 'success' : 'error',
      request: {
        url: `${env.baseUrl}/ppp/api/initPayment.do`,
        method: 'POST',
        body: initBodyLog,
        timestamp: new Date().toISOString(),
      },
      response: {
        status: initResponse.status,
        body: initData,
        duration: Date.now() - initStart,
      },
    });

    if (initData.status !== 'SUCCESS') {
      return jsonResponse({ status: 'failed', steps, context, error: 'Failed to initialize payment' });
    }

    // Extract 3DS info from initPayment response
    const initTransactionId = initData.transactionId as string;
    const paymentOption = initData.paymentOption as Record<string, unknown>;
    const cardData = paymentOption?.card as Record<string, unknown>;
    const threeD = cardData?.threeD as Record<string, unknown>;
    const threeDVersion = threeD?.version as string;
    const methodUrl = threeD?.methodUrl as string;
    const methodPayload = threeD?.methodPayload as string;

    context.initTransactionId = initTransactionId;
    context.threeDVersion = threeDVersion;
    context.methodUrl = methodUrl;
    context.methodPayload = methodPayload;
    context.userTokenId = userTokenId;

    const resolvedMethodCompletionInd = (() => {
      const fallback = methodCompletionInd || (methodUrl ? 'Y' : 'U');
      if (featureTestId !== 'methodCompletionInd') {
        return fallback;
      }
      if (!featureOptionValue || featureOptionValue === 'auto') {
        return methodUrl ? 'Y' : 'U';
      }
      if (['Y', 'N', 'U'].includes(featureOptionValue)) {
        return featureOptionValue;
      }
      return fallback;
    })();

    context.methodCompletionInd = resolvedMethodCompletionInd;
    context.platformType = platformType;
    context.challengePreference = challengePreference;
    context.challengeWindowSize = challengeWindowSize;
    context.notificationUrlKeys = notificationUrlKeys;
    context.methodNotificationUrlMode = methodNotificationUrlMode;
    context.browserDetailsMode = browserDetailsMode;

    // ===== STEP 3: payment.do (with 3DS data) =====
    const timestamp3 = generateTimestamp();
    const clientRequestId3 = generateRequestId();
    
    // CRITICAL: Checksum for payment.do = merchantId + merchantSiteId + clientRequestId + amount + currency + timeStamp + merchantKey
    const checksum3 = await calculateChecksum(
      [env.merchantId, env.merchantSiteId, clientRequestId3, amount, currency, timestamp3, env.merchantKey],
      'SHA256'
    );

    const browserDetailsFull = {
      acceptHeader: 'text/html,application/xhtml+xml',
      ip: '192.168.1.1',
      javaEnabled: 'TRUE',
      javaScriptEnabled: 'TRUE',
      language: 'EN',
      colorDepth: '24',
      screenHeight: '1080',
      screenWidth: '1920',
      timeZone: '0',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    const browserDetailsMinimal = {
      acceptHeader: 'text/html,application/xhtml+xml',
      ip: '192.168.1.1',
      language: 'EN',
      screenHeight: '1080',
      screenWidth: '1920',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    const threeDRequest: Record<string, unknown> = {
      methodCompletionInd: resolvedMethodCompletionInd,
      version: threeDVersion,
      merchantURL: 'https://example.com',
      platformType,
      v2AdditionalParams: {
        challengePreference,
        challengeWindowSize,
      },
    };

    if (browserDetailsMode !== 'omit') {
      threeDRequest.browserDetails = browserDetailsMode === 'minimal'
        ? browserDetailsMinimal
        : browserDetailsFull;
    }

    if (notificationUrl) {
      for (const key of notificationUrlKeys) {
        threeDRequest[key] = notificationUrl;
      }
    }

    const paymentBody: Record<string, unknown> = {
      sessionToken,
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      clientRequestId: clientRequestId3,
      timeStamp: timestamp3,
      checksum: checksum3,
      currency,
      amount,
      relatedTransactionId: initTransactionId,
      transactionType: 'Auth',
      paymentOption: {
        card: {
          cardNumber: card.number,
          cardHolderName: card.holderName,
          expirationMonth: card.expMonth,
          expirationYear: card.expYear,
          CVV: card.cvv,
          threeD: threeDRequest,
        },
      },
      billingAddress: {
        firstName: card.holderName.split(' ')[0] || 'Test',
        lastName: card.holderName.split(' ').slice(1).join(' ') || 'User',
        address: '123 Main St',
        city: 'London',
        country: 'GB',
        email: 'test@example.com',
      },
      deviceDetails: {
        ipAddress: '192.168.1.1',
      },
      // Add urlDetails to receive payment DMNs
      urlDetails: {
        notificationUrl: notificationUrl,
      },
    };

    const paymentStart = Date.now();
    const paymentResponse = await fetch(`${env.baseUrl}/ppp/api/payment.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentBody),
    });
    const paymentData = await paymentResponse.json() as Record<string, unknown>;

    // Mask card number in logged request
    const paymentBodyLog = {
      ...paymentBody,
      paymentOption: {
        card: {
          ...(paymentBody.paymentOption as Record<string, unknown>).card as Record<string, unknown>,
          cardNumber: `****${card.number.slice(-4)}`,
        },
      },
    };

    const paymentThreeD = (paymentData.paymentOption as Record<string, unknown>)?.card
      ? ((paymentData.paymentOption as Record<string, unknown>).card as Record<string, unknown>).threeD as Record<string, unknown>
      : undefined;

    const acsUrl = paymentThreeD?.acsUrl as string | undefined;
    const cReq = paymentThreeD?.cReq as string | undefined;

    let stepStatus = 'success';
    if (paymentData.transactionStatus === 'REDIRECT') {
      stepStatus = 'redirect';
    } else if (paymentData.status !== 'SUCCESS') {
      stepStatus = 'error';
    }

    steps.push({
      stepId: 'payment',
      stepName: 'Payment (3DS)',
      status: stepStatus,
      request: {
        url: `${env.baseUrl}/ppp/api/payment.do`,
        method: 'POST',
        body: paymentBodyLog,
        timestamp: new Date().toISOString(),
      },
      response: {
        status: paymentResponse.status,
        body: paymentData,
        duration: Date.now() - paymentStart,
      },
    });

    context.paymentTransactionId = paymentData.transactionId;
    context.transactionStatus = paymentData.transactionStatus;
    context.authCode = paymentData.authCode;

    // Store as internal DMN for webhook visibility
    storeInternalDmn('Payment (3DS)', 'payment.do', paymentData);

    // Check if 3DS challenge is required
    if (paymentData.transactionStatus === 'REDIRECT' && acsUrl && cReq) {
      context.acsUrl = acsUrl;
      context.cReq = cReq;

      // Use our own redirect page that auto-POSTs to the acsUrl
      // This goes directly to the ACS Challenge Page with the 5 buttons
      const challengeUrl = `/api/3ds-challenge?acsUrl=${encodeURIComponent(acsUrl)}&creq=${encodeURIComponent(cReq)}`;

      return jsonResponse({
        status: 'challenge_required',
        steps,
        context,
        challengeUrl,
        // Also provide raw values for custom handling
        acsUrl,
        cReq,
      });
    }

    // Frictionless or approved
    return jsonResponse({
      status: paymentData.transactionStatus === 'APPROVED' ? 'completed' : 'failed',
      steps,
      context,
    });

  } catch (error) {
    return errorResponse(`Payment failed: ${error}`);
  }
}

// Liability shift payment after 3DS challenge
async function handleLiabilityShift(request: Request): Promise<Response> {
  try {
    const body = await request.json() as LiabilityShiftRequest;
    const { env, sessionToken, relatedTransactionId, card, amount, currency } = body;

    if (!sessionToken || !relatedTransactionId) {
      return errorResponse('Missing sessionToken or relatedTransactionId');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // Checksum for payment.do
    const checksum = await calculateChecksum(
      [env.merchantId, env.merchantSiteId, clientRequestId, amount, currency, timestamp, env.merchantKey],
      'SHA256'
    );

    const paymentBody = {
      sessionToken,
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      clientRequestId,
      timeStamp: timestamp,
      checksum,
      relatedTransactionId,
      currency,
      amount,
      transactionType: 'Auth',
      paymentOption: {
        card: {
          cardNumber: card.number,
          cardHolderName: card.holderName,
          expirationMonth: card.expMonth,
          expirationYear: card.expYear,
          CVV: card.cvv,
        },
      },
      billingAddress: {
        firstName: card.holderName.split(' ')[0] || 'Test',
        lastName: card.holderName.split(' ').slice(1).join(' ') || 'User',
        address: '123 Main St',
        city: 'London',
        country: 'GB',
        email: 'test@example.com',
      },
      deviceDetails: {
        ipAddress: '192.168.1.1',
      },
    };

    const response = await fetch(`${env.baseUrl}/ppp/api/payment.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentBody),
    });
    const rawBody = await response.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      data = {
        rawBody,
        httpStatus: response.status,
        parseError: 'Non-JSON response from payment.do',
      };
    }

    // Store as internal DMN for webhook visibility - this is the final payment after 3DS
    storeInternalDmn('Payment (Post 3DS)', 'payment.do', data);

    return jsonResponse({
      success: data.status === 'SUCCESS' && data.transactionStatus === 'APPROVED',
      transactionId: data.transactionId,
      authCode: data.authCode,
      transactionStatus: data.transactionStatus,
      response: data,
    });

  } catch (error) {
    return errorResponse(`Liability shift failed: ${error}`);
  }
}

// Get payment status
async function handleGetPaymentStatus(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { env: EnvConfig; sessionToken: string };
    const { env, sessionToken } = body;

    if (!sessionToken) {
      return errorResponse('Missing sessionToken');
    }

    const response = await fetch(`${env.baseUrl}/ppp/api/getPaymentStatus.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        merchantId: env.merchantId,
        merchantSiteId: env.merchantSiteId,
        sessionToken 
      }),
    });
    const data = await response.json() as Record<string, unknown>;

    // Store as internal DMN for webhook visibility
    storeInternalDmn('Payment Status', 'getPaymentStatus', data);

    return jsonResponse({ success: true, response: data });

  } catch (error) {
    return errorResponse(`Get status failed: ${error}`);
  }
}

// Get transaction details
async function handleGetTransactionDetails(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { env: EnvConfig; transactionId: string };
    const { env, transactionId } = body;

    if (!transactionId) {
      return errorResponse('Missing transactionId');
    }

    const timestamp = generateTimestamp();

    // Checksum per docs: merchantId + merchantSiteId + transactionId (if provided) + clientUniqueId (if provided) + timeStamp + merchantKey
    // We're providing transactionId, not clientUniqueId
    const checksum = await calculateChecksum(
      [env.merchantId, env.merchantSiteId, transactionId, timestamp, env.merchantKey],
      'SHA256'
    );

    const response = await fetch(`${env.baseUrl}/ppp/api/getTransactionDetails.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        merchantId: env.merchantId,
        merchantSiteId: env.merchantSiteId,
        transactionId,
        timeStamp: timestamp,
        checksum,
      }),
    });
    const data = await response.json() as Record<string, unknown>;

    // Store as internal DMN for webhook visibility
    storeInternalDmn('Transaction Details', 'getTransactionDetails', data);

    return jsonResponse({ success: true, response: data });

  } catch (error) {
    return errorResponse(`Get transaction details failed: ${error}`);
  }
}

// Settle transaction
async function handleSettle(request: Request): Promise<Response> {
  try {
    const body = await request.json() as OperationRequest;
    const { env, relatedTransactionId, amount, currency, authCode, notificationUrl } = body;

    if (!relatedTransactionId) {
      return errorResponse('Missing relatedTransactionId');
    }

    const timestamp = generateTimestamp();
    const clientUniqueId = generateRequestId();

    // Checksum for settleTransaction per docs:
    // merchantId + merchantSiteId + clientRequestId (opt) + clientUniqueId + amount + currency + relatedTransactionId + authCode (opt) + comment (opt) + urlDetails (opt) + timeStamp + merchantKey
    // Include authCode if provided for proper checksum
    const checksumParts = authCode 
      ? [env.merchantId, env.merchantSiteId, clientUniqueId, amount, currency, relatedTransactionId, authCode, timestamp, env.merchantKey]
      : [env.merchantId, env.merchantSiteId, clientUniqueId, amount, currency, relatedTransactionId, timestamp, env.merchantKey];
    const checksum = await calculateChecksum(checksumParts, 'SHA256');

    const settleBody: Record<string, unknown> = {
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      clientUniqueId,
      amount,
      currency,
      relatedTransactionId,
      timeStamp: timestamp,
      checksum,
    };

    // Add authCode if provided
    if (authCode) {
      settleBody.authCode = authCode;
    }

    // Add urlDetails for DMN notifications
    if (notificationUrl) {
      settleBody.urlDetails = { notificationUrl };
    }

    const response = await fetch(`${env.baseUrl}/ppp/api/settleTransaction.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settleBody),
    });
    const data = await response.json() as Record<string, unknown>;

    // Store as internal DMN for webhook visibility
    storeInternalDmn('Settle Response', 'settleTransaction', data);

    return jsonResponse({
      success: data.status === 'SUCCESS',
      transactionId: data.transactionId,
      authCode: data.authCode,
      response: data,
    });

  } catch (error) {
    return errorResponse(`Settle failed: ${error}`);
  }
}

// Void transaction
async function handleVoid(request: Request): Promise<Response> {
  try {
    const body = await request.json() as OperationRequest;
    const { env, relatedTransactionId, authCode, notificationUrl } = body;

    if (!relatedTransactionId) {
      return errorResponse('Missing relatedTransactionId');
    }

    const timestamp = generateTimestamp();
    const clientUniqueId = generateRequestId();

    // Checksum for voidTransaction per docs:
    // merchantId + merchantSiteId + clientRequestId (opt) + clientUniqueId + amount (opt) + currency (opt) + relatedTransactionId + authCode (opt) + comment (opt) + urlDetails (opt) + timeStamp + merchantKey
    // Include authCode if provided
    const checksumParts = authCode
      ? [env.merchantId, env.merchantSiteId, clientUniqueId, relatedTransactionId, authCode, timestamp, env.merchantKey]
      : [env.merchantId, env.merchantSiteId, clientUniqueId, relatedTransactionId, timestamp, env.merchantKey];
    const checksum = await calculateChecksum(checksumParts, 'SHA256');

    const voidBody: Record<string, unknown> = {
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      clientUniqueId,
      relatedTransactionId,
      timeStamp: timestamp,
      checksum,
    };

    // Add authCode if provided
    if (authCode) {
      voidBody.authCode = authCode;
    }

    // Add urlDetails for DMN notifications
    if (notificationUrl) {
      voidBody.urlDetails = { notificationUrl };
    }

    const response = await fetch(`${env.baseUrl}/ppp/api/voidTransaction.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(voidBody),
    });
    const data = await response.json() as Record<string, unknown>;

    // Store as internal DMN for webhook visibility
    storeInternalDmn('Void Response', 'voidTransaction', data);

    return jsonResponse({
      success: data.status === 'SUCCESS',
      transactionId: data.transactionId,
      response: data,
    });

  } catch (error) {
    return errorResponse(`Void failed: ${error}`);
  }
}

// Refund transaction
async function handleRefund(request: Request): Promise<Response> {
  try {
    const body = await request.json() as OperationRequest;
    const { env, relatedTransactionId, amount, currency, authCode, notificationUrl } = body;

    if (!relatedTransactionId) {
      return errorResponse('Missing relatedTransactionId');
    }

    const timestamp = generateTimestamp();
    const clientUniqueId = generateRequestId();

    // Checksum for refundTransaction per docs:
    // merchantId + merchantSiteId + clientRequestId (opt) + clientUniqueId + amount + currency + relatedTransactionId + authCode (opt) + comment (opt) + urlDetails (opt) + timeStamp + merchantKey
    // Include authCode if provided
    const checksumParts = authCode
      ? [env.merchantId, env.merchantSiteId, clientUniqueId, amount, currency, relatedTransactionId, authCode, timestamp, env.merchantKey]
      : [env.merchantId, env.merchantSiteId, clientUniqueId, amount, currency, relatedTransactionId, timestamp, env.merchantKey];
    const checksum = await calculateChecksum(checksumParts, 'SHA256');

    const refundBody: Record<string, unknown> = {
      merchantId: env.merchantId,
      merchantSiteId: env.merchantSiteId,
      clientUniqueId,
      amount,
      currency,
      relatedTransactionId,
      timeStamp: timestamp,
      checksum,
    };

    // Add authCode if provided
    if (authCode) {
      refundBody.authCode = authCode;
    }

    // Add urlDetails for DMN notifications
    if (notificationUrl) {
      refundBody.urlDetails = { notificationUrl };
    }

    const response = await fetch(`${env.baseUrl}/ppp/api/refundTransaction.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(refundBody),
    });
    const data = await response.json() as Record<string, unknown>;

    // Store as internal DMN for webhook visibility
    storeInternalDmn('Refund Response', 'refundTransaction', data);

    return jsonResponse({
      success: data.status === 'SUCCESS',
      transactionId: data.transactionId,
      response: data,
    });

  } catch (error) {
    return errorResponse(`Refund failed: ${error}`);
  }
}

// DMN Webhook receiver - stores webhooks without checksum verification
async function handleWebhook(request: Request): Promise<Response> {
  try {
    let payload: Record<string, unknown>;

    const method = request.method;
    const contentType = request.headers.get('content-type') || '';
    
    // Handle GET webhooks (Nuvei DMNs can be sent as GET)
    if (method === 'GET') {
      const url = new URL(request.url);
      payload = {};
      url.searchParams.forEach((value, key) => {
        payload[key] = value;
      });
    } else {
      // Handle POST webhooks
      const rawBody = await request.text();
    
      if (contentType.includes('application/x-www-form-urlencoded')) {
        // Parse form data
        payload = {};
        const params = new URLSearchParams(rawBody);
        params.forEach((value, key) => {
          payload[key] = value;
        });
      
        // Try to decode cres if present (it's base64 encoded)
        if (payload.cres && typeof payload.cres === 'string') {
          try {
            // cres is base64url encoded - could be JSON or plain text
            const decodedText = atob(payload.cres.replace(/-/g, '+').replace(/_/g, '/'));
            payload.cresDecoded = decodedText;
            
            // Try to parse as JSON for proper 3DS CRes
            try {
              const cresJson = JSON.parse(decodedText);
              payload.cresDecoded = cresJson;
              payload.transStatus = cresJson.transStatus;
              payload.threeDSServerTransID = cresJson.threeDSServerTransID;
              payload.acsTransID = cresJson.acsTransID;
              payload.messageType = cresJson.messageType || 'CRes';
            } catch {
              // Not JSON - might be error text like "Invalid RReq"
              payload.cresDecodedText = decodedText;
              payload.messageType = 'Error';
              payload.errorMessage = decodedText;
            }
          } catch {
            // If base64 decoding fails, keep raw cres
            payload.cresDecodeError = 'Failed to decode base64';
          }
        }
      } else if (contentType.includes('application/json')) {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } else {
        // Try to parse as JSON first, then as form data
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          payload = {};
          const params = new URLSearchParams(rawBody);
          params.forEach((value, key) => {
            payload[key] = value;
          });
          if (Object.keys(payload).length === 0) {
            payload = { rawBody };
          }
        }
      }
    }
    
    // Add metadata
    payload._receivedAt = new Date().toISOString();
    payload._contentType = contentType;
    
    // Classify DMN type for better UI display
    if (payload.cres) {
      payload._dmnType = payload.errorMessage ? '3DS Error' : '3DS Challenge Response';
    } else if (payload.ppp_status || payload.Status) {
      payload._dmnType = 'Payment DMN';
    } else if (payload.transactionId || payload.TransactionID) {
      payload._dmnType = 'Transaction DMN';
    } else {
      payload._dmnType = 'Unknown DMN';
    }

    const webhook = {
      id: `dmn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      payload,
    };

    // Store in memory (max 100 webhooks)
    webhookStore.unshift(webhook);
    if (webhookStore.length > 100) {
      webhookStore.pop();
    }

    console.log('Webhook received:', webhook.id);

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200, headers: corsHeaders });
  }
}

// Get stored webhooks
async function handleGetWebhooks(): Promise<Response> {
  return jsonResponse({
    webhooks: webhookStore,
    count: webhookStore.length,
  });
}

// Clear webhooks
async function handleClearWebhooks(): Promise<Response> {
  webhookStore.length = 0;
  return jsonResponse({ success: true, message: 'Webhooks cleared' });
}

// ==================== MCP RATES ====================

async function handleGetMcpRates(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { env: EnvConfig; fromCurrency: string };
    const { env: envConfig, fromCurrency } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();
    const clientUniqueId = `mcp_${Date.now()}`;

    // First get a session token
    const sessionChecksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      clientRequestId,
      timestamp,
      envConfig.merchantKey
    ]);

    const sessionResponse = await fetch(`${envConfig.baseUrl}/ppp/api/getSessionToken.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: envConfig.merchantId,
        merchantSiteId: envConfig.merchantSiteId,
        clientRequestId,
        timeStamp: timestamp,
        checksum: sessionChecksum,
      }),
    });

    const sessionResult = await sessionResponse.json() as { sessionToken?: string; status?: string; reason?: string };
    
    if (!sessionResult.sessionToken) {
      return jsonResponse({
        error: 'Failed to get session token',
        sessionResponse: sessionResult,
      });
    }

    // getMcpRates request - uses sessionToken, no checksum needed
    const requestBody = {
      sessionToken: sessionResult.sessionToken,
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId: generateRequestId(),
      clientUniqueId,
      fromCurrency: fromCurrency || 'USD',
      toCurrency: ['EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN'],
      paymentMethods: ['cc_card'],
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/getMcpRates.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    // Extract rates from response - getMcpRates returns "rates" array
    let mcpRates: Array<{ currency: string; rate: number }> = [];
    if (result.rates && Array.isArray(result.rates)) {
      // rates is array of { paymentMethod, ratesByCurrencies: [{ currency, rate }] }
      const ratesData = result.rates as Array<{ paymentMethod: string; ratesByCurrencies: Array<{ currency: string; rate: string }> }>;
      if (ratesData.length > 0 && ratesData[0].ratesByCurrencies) {
        mcpRates = ratesData[0].ratesByCurrencies.map(r => ({
          currency: r.currency,
          rate: parseFloat(r.rate),
        }));
      }
    }

    return jsonResponse({
      ...result,
      mcpRates,
      request: requestBody,
    });
  } catch (error) {
    console.error('MCP rates error:', error);
    return errorResponse(`MCP rates failed: ${error}`);
  }
}

// ==================== PAYOUTS ====================

async function handlePayout(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      env: EnvConfig;
      userTokenId: string;
      amount: string;
      currency: string;
      userPaymentOptionId: string;
    };
    const { env: envConfig, userTokenId, amount, currency, userPaymentOptionId } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!userTokenId || !amount || !userPaymentOptionId) {
      return errorResponse('Missing required payout fields');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();
    const clientUniqueId = `payout_${Date.now()}`;

    // payout checksum: merchantId + merchantSiteId + clientRequestId + amount + currency + timeStamp + merchantKey
    const checksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      clientRequestId,
      amount,
      currency || 'USD',
      timestamp,
      envConfig.merchantKey
    ]);

    const requestBody = {
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId,
      clientUniqueId,
      timeStamp: timestamp,
      userTokenId,
      userPaymentOption: {
        userPaymentOptionId,
      },
      amount,
      currency: currency || 'USD',
      checksum,
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/payout.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    // Store as internal DMN for webhook visibility
    storeInternalDmn('Payout Response', 'payout', result);

    return jsonResponse({
      ...result,
      request: requestBody,
    });
  } catch (error) {
    console.error('Payout error:', error);
    return errorResponse(`Payout failed: ${error}`);
  }
}

// ==================== APMs ====================

async function handleGetApms(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      env: EnvConfig;
      countryCode: string;
      currencyCode: string;
    };
    const { env: envConfig, countryCode, currencyCode } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // First get a session token
    const sessionChecksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      clientRequestId,
      timestamp,
      envConfig.merchantKey
    ]);

    const sessionResponse = await fetch(`${envConfig.baseUrl}/ppp/api/getSessionToken.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: envConfig.merchantId,
        merchantSiteId: envConfig.merchantSiteId,
        clientRequestId,
        timeStamp: timestamp,
        checksum: sessionChecksum,
      }),
    });

    const sessionResult = await sessionResponse.json() as { sessionToken?: string; status?: string; reason?: string };
    const sessionToken = sessionResult.sessionToken;

    if (!sessionToken) {
      return jsonResponse({
        error: 'Failed to get session token for APMs',
        sessionResponse: sessionResult,
      });
    }

    // getMerchantPaymentMethods - per docs uses "countryCode" and "currencyCode" but some docs show "country" and "currency"
    // Let's try both approaches and see what works
    const timestamp2 = generateTimestamp();
    const clientRequestId2 = generateRequestId();
    
    // Checksum for getMerchantPaymentMethods: merchantId + merchantSiteId + clientRequestId + timeStamp + merchantKey
    const checksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      clientRequestId2,
      timestamp2,
      envConfig.merchantKey
    ]);

    const requestBody = {
      sessionToken,
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId: clientRequestId2,
      timeStamp: timestamp2,
      checksum,
      countryCode: countryCode || 'DE',
      currencyCode: currencyCode || 'EUR',
      languageCode: 'en',
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/getMerchantPaymentMethods.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    // Filter out card payment methods to show only real APMs
    // Keep PayPal (apmgw_expresscheckout) as it's a valid APM
    if (result.paymentMethods && Array.isArray(result.paymentMethods)) {
      const cardMethods = ['cc_card', 'ppp_ApplePay', 'ppp_GooglePay'];
      result.paymentMethods = result.paymentMethods.filter((pm: any) => 
        !cardMethods.includes(pm.paymentMethod)
      );
    }

    return jsonResponse({
      ...result,
      request: requestBody,
    });
  } catch (error) {
    console.error('APMs error:', error);
    return errorResponse(`Get APMs failed: ${error}`);
  }
}

// ==================== APM Payment ====================

interface ApmPaymentRequest {
  env: EnvConfig;
  paymentMethod: string;
  amount: string;
  currency: string;
  country: string;
  userTokenId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zip?: string;
  paymentMethodFields?: Record<string, string>;
}

// Minimal APM rules to enforce mandatory fields and geo constraints
function getApmRules(paymentMethod: string) {
  const pm = paymentMethod.toLowerCase();
  const rules: Array<{
    match: boolean;
    requiredFields?: string[];
    countries?: string[];
    currencies?: string[];
  }> = [
    { match: pm.includes('ach'), requiredFields: ['AccountNumber', 'RoutingNumber', 'SECCode'], countries: ['US'], currencies: ['USD'] },
    { match: pm.includes('ideal'), requiredFields: ['BIC'], countries: ['NL'], currencies: ['EUR'] },
    { match: pm.includes('sofort'), countries: ['AT','BE','FR','DE','IT','NL','SK','ES','CH'], currencies: ['EUR','CHF'] },
    { match: pm.includes('klarna'), currencies: ['CHF','CZK','DKK','EUR','GBP','NOK','PLN','RON','SEK'] },
    { match: pm.includes('moneybookers'), requiredFields: ['account_id'] },
    { match: pm.includes('neteller'), requiredFields: ['account_id', 'nettelerAccount'] },
    { match: pm.includes('paywithbanktransfer'), countries: ['GB'], currencies: ['GBP'] },
    { match: pm.includes('open_banking'), requiredFields: ['bankId'] },
    { match: pm.includes('instant_open_banking'), requiredFields: ['bankId'] },
  ];
  return rules.find(r => r.match);
}

async function handleApmPayment(request: Request): Promise<Response> {
  try {
    const body = await request.json() as ApmPaymentRequest;
    const { 
      env: envConfig, 
      paymentMethod, 
      amount, 
      currency, 
      country,
      userTokenId,
      firstName = 'Test',
      lastName = 'User',
      email = 'test@example.com',
      phone = '+1234567890',
      address = '123 Test Street',
      city = 'Berlin',
      zip = '10115',
      paymentMethodFields = {}
    } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!paymentMethod) {
      return errorResponse('Missing paymentMethod');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // Get session token first
    const sessionChecksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      clientRequestId,
      timestamp,
      envConfig.merchantKey
    ]);

    const sessionResponse = await fetch(`${envConfig.baseUrl}/ppp/api/getSessionToken.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: envConfig.merchantId,
        merchantSiteId: envConfig.merchantSiteId,
        clientRequestId,
        timeStamp: timestamp,
        checksum: sessionChecksum,
      }),
    });

    const sessionResult = await sessionResponse.json() as { sessionToken?: string; status?: string; reason?: string };
    const sessionToken = sessionResult.sessionToken;

    if (!sessionToken) {
      return jsonResponse({
        error: 'Failed to get session token for APM payment',
        sessionResponse: sessionResult,
      });
    }

    // Build return URL that will handle the APM redirect back
    const workerUrl = new URL(request.url).origin;
    const successUrl = `${workerUrl}/apm/return?status=success&paymentMethod=${paymentMethod}`;
    const failUrl = `${workerUrl}/apm/return?status=fail&paymentMethod=${paymentMethod}`;
    const pendingUrl = `${workerUrl}/apm/return?status=pending&paymentMethod=${paymentMethod}`;
    // For DMN, use the webhook endpoint
    const dmnUrl = `${workerUrl}/api/webhook`;

    const timestamp2 = generateTimestamp();
    const clientRequestId2 = generateRequestId();
    const clientUniqueId = `CU_${Date.now()}`;
    const finalUserTokenId = userTokenId || email || `UT_${Date.now()}`;

    // Checksum for payment: merchantId + merchantSiteId + clientRequestId + amount + currency + timeStamp + merchantKey
    const paymentChecksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      clientRequestId2,
      amount,
      currency,
      timestamp2,
      envConfig.merchantKey
    ]);

    // Build APM-specific alternativePaymentMethod object
    const alternativePaymentMethod: Record<string, any> = {
      paymentMethod,
      ...paymentMethodFields // Allow passing custom fields
    };

    // Enforce APM-specific requirements
    const apmRule = getApmRules(paymentMethod);
    if (apmRule?.countries && apmRule.countries.length > 0 && !apmRule.countries.includes(country)) {
      return errorResponse(`Country ${country} not supported for ${paymentMethod}`);
    }
    if (apmRule?.currencies && apmRule.currencies.length > 0 && !apmRule.currencies.includes(currency)) {
      return errorResponse(`Currency ${currency} not supported for ${paymentMethod}`);
    }
    if (apmRule?.requiredFields) {
      const missing = apmRule.requiredFields.filter(f => !paymentMethodFields[f]);
      if (missing.length > 0) {
        return errorResponse(`Missing required fields for ${paymentMethod}: ${missing.join(', ')}`);
      }
    }

    // Normalize wallet account field
    if ((paymentMethod === 'apmgw_MoneyBookers' || paymentMethod === 'apmgw_Neteller') && 
        paymentMethodFields.account_id) {
      alternativePaymentMethod.account_id = paymentMethodFields.account_id;
    }
    if (paymentMethod.toLowerCase().includes('neteller') && paymentMethodFields.nettelerAccount) {
      alternativePaymentMethod.nettelerAccount = paymentMethodFields.nettelerAccount;
    }
    if (paymentMethod.toLowerCase().includes('ideal') && paymentMethodFields.BIC) {
      alternativePaymentMethod.BIC = paymentMethodFields.BIC;
    }
    if ((paymentMethod.toLowerCase().includes('open_banking') || paymentMethod.toLowerCase().includes('instant_open_banking')) && paymentMethodFields.bankId) {
      alternativePaymentMethod.bankId = paymentMethodFields.bankId;
    }

    // Build payment request for payment.do
    const paymentRequest: Record<string, unknown> = {
      sessionToken,
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId: clientRequestId2,
      clientUniqueId,
      userTokenId: finalUserTokenId,
      timeStamp: timestamp2,
      checksum: paymentChecksum,
      amount,
      currency,
      transactionType: 'Sale',
      paymentOption: {
        alternativePaymentMethod
      },
      billingAddress: {
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        zip,
        country
      },
      userDetails: {
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        zip,
        country
      },
      deviceDetails: {
        ipAddress: '93.146.254.172'
      },
      urlDetails: {
        successUrl,
        failureUrl: failUrl,
        pendingUrl,
        notificationUrl: dmnUrl
      }
    };

    console.log('APM Payment Request:', JSON.stringify(paymentRequest, null, 2));

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/payment.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentRequest),
    });

    const result = await response.json() as Record<string, unknown>;

    console.log('APM Payment Response:', JSON.stringify(result, null, 2));

    // Store as internal DMN for webhook visibility
    storeInternalDmn('APM Payment', 'payment.do', result);

    // Check if we got a redirect URL
    const redirectUrl = (
      result.redirectURL || 
      result.redirectUrl || 
      (result.paymentOption as any)?.redirectUrl || 
      (result.paymentOption as any)?.alternativePaymentMethod?.redirectUrl
    ) as string | undefined;

    if (redirectUrl || result.transactionStatus === 'REDIRECT') {
      return jsonResponse({
        success: true,
        redirectUrl: redirectUrl || (result.paymentOption as any)?.redirectUrl,
        result,
        request: paymentRequest,
      });
    }

    // Return the full result
    return jsonResponse({
      success: result.status === 'SUCCESS' && result.transactionStatus !== 'DECLINED',
      result,
      request: paymentRequest,
    });
  } catch (error) {
    console.error('APM Payment error:', error);
    return errorResponse(`APM Payment failed: ${error}`);
  }
}

// Handle APM redirect return
function handleApmReturn(url: URL): Response {
  const params = url.searchParams;
  const status = params.get('status') || 'unknown';
  const paymentMethod = params.get('paymentMethod') || 'APM';
  
  // Capture all URL parameters as the result
  const apmResult: Record<string, string> = {};
  params.forEach((value, key) => {
    apmResult[key] = value;
  });
  
  const isSuccess = status === 'success';
  const isPending = status === 'pending';
  const statusIcon = isSuccess ? '✓' : (isPending ? '⏳' : '✗');
  const statusText = isSuccess ? 'Payment Successful' : (isPending ? 'Payment Pending' : 'Payment Failed');
  const statusColor = isSuccess ? '#10b981' : (isPending ? '#f59e0b' : '#ef4444');
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>APM Payment Complete</title>
  <meta charset="utf-8">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; justify-content: center; align-items: center;
      height: 100vh; margin: 0; background: #1a1a2e; color: #fff; text-align: center;
    }
    .container {
      background: #16213e; padding: 40px; border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3); max-width: 400px;
    }
    .icon { font-size: 64px; color: ${statusColor}; margin-bottom: 20px; }
    h2 { margin: 0 0 12px 0; color: ${statusColor}; }
    p { margin: 8px 0; color: #94a3b8; }
    .method-badge {
      display: inline-block; padding: 8px 16px;
      background: #3b82f622; border: 1px solid #3b82f6;
      border-radius: 8px; color: #3b82f6; font-weight: 600;
      margin-top: 12px; font-size: 14px;
    }
    .status-badge {
      display: inline-block; padding: 8px 16px;
      background: ${statusColor}22; border: 1px solid ${statusColor};
      border-radius: 8px; color: ${statusColor}; font-weight: 600;
      margin-top: 8px; font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${statusIcon}</div>
    <h2>${statusText}</h2>
    <p>Returning to application...</p>
    <div class="method-badge">${paymentMethod}</div>
    <br>
    <div class="status-badge">Status: ${status}</div>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ 
        type: 'apm-return',
        success: ${isSuccess},
        pending: ${isPending},
        status: '${status}',
        paymentMethod: '${paymentMethod}',
        result: ${JSON.stringify(apmResult)}
      }, '*');
    }
    setTimeout(() => window.close(), 2500);
  </script>
</body>
</html>`;
  
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ==================== UPO (User Payment Options) ====================

interface UPORequest {
  env: EnvConfig;
  userTokenId: string;
}

interface AddUPORequest {
  env: EnvConfig;
  userTokenId: string;
  card: {
    number: string;
    holderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
  };
}

interface DeleteUPORequest {
  env: EnvConfig;
  userTokenId: string;
  userPaymentOptionId: string;
}

// Get user's saved payment options
async function handleGetUserUPOs(request: Request): Promise<Response> {
  try {
    const body = await request.json() as UPORequest;
    const { env: envConfig, userTokenId } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!userTokenId) {
      return errorResponse('Missing userTokenId');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // Checksum: merchantId + merchantSiteId + userTokenId + clientRequestId + timeStamp + merchantKey
    const checksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      userTokenId,
      clientRequestId,
      timestamp,
      envConfig.merchantKey
    ]);

    const requestBody = {
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      userTokenId,
      clientRequestId,
      timeStamp: timestamp,
      checksum,
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/getUserUPOs.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    return jsonResponse({
      success: result.status === 'SUCCESS',
      ...result,
    });
  } catch (error) {
    console.error('Get UPOs error:', error);
    return errorResponse(`Get UPOs failed: ${error}`);
  }
}

// Add a new credit card UPO (requires PCI certification)
async function handleAddUPO(request: Request): Promise<Response> {
  try {
    const body = await request.json() as AddUPORequest;
    const { env: envConfig, userTokenId, card } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!userTokenId || !card) {
      return errorResponse('Missing userTokenId or card details');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // Checksum for addUPOCreditCard: merchantId + merchantSiteId + userTokenId + clientRequestId + ccCardNumber + ccExpMonth + ccExpYear + timeStamp + merchantKey
    const checksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      userTokenId,
      clientRequestId,
      card.number,
      card.expMonth,
      card.expYear,
      timestamp,
      envConfig.merchantKey
    ]);

    const requestBody = {
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      userTokenId,
      clientRequestId,
      ccCardNumber: card.number,
      ccExpMonth: card.expMonth,
      ccExpYear: card.expYear,
      ccNameOnCard: card.holderName,
      timeStamp: timestamp,
      checksum,
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/addUPOCreditCard.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    return jsonResponse({
      success: result.status === 'SUCCESS',
      userPaymentOptionId: result.userPaymentOptionId,
      ...result,
    });
  } catch (error) {
    console.error('Add UPO error:', error);
    return errorResponse(`Add UPO failed: ${error}`);
  }
}

// Delete a UPO
async function handleDeleteUPO(request: Request): Promise<Response> {
  try {
    const body = await request.json() as DeleteUPORequest;
    const { env: envConfig, userTokenId, userPaymentOptionId } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!userTokenId || !userPaymentOptionId) {
      return errorResponse('Missing userTokenId or userPaymentOptionId');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // Checksum for deleteUPO: merchantId + merchantSiteId + userTokenId + clientRequestId + userPaymentOptionId + timeStamp + merchantKey
    const checksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      userTokenId,
      clientRequestId,
      userPaymentOptionId,
      timestamp,
      envConfig.merchantKey
    ]);

    const requestBody = {
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      userTokenId,
      clientRequestId,
      userPaymentOptionId,
      timeStamp: timestamp,
      checksum,
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/deleteUPO.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    return jsonResponse({
      success: result.status === 'SUCCESS',
      ...result,
    });
  } catch (error) {
    console.error('Delete UPO error:', error);
    return errorResponse(`Delete UPO failed: ${error}`);
  }
}

// ==================== NEW VBEST ENDPOINTS ====================

// Create User - register a user and obtain userTokenId
interface CreateUserRequest {
  env: EnvConfig;
  userTokenId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

async function handleCreateUser(request: Request): Promise<Response> {
  try {
    const body = await request.json() as CreateUserRequest;
    const { env: envConfig, userTokenId, email, firstName, lastName, countryCode, phone, address, city, state, zip } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!userTokenId || !email || !firstName || !lastName || !countryCode) {
      return errorResponse('Missing required fields: userTokenId, email, firstName, lastName, countryCode');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // Checksum per MCP docs: merchantId + merchantSiteId + clientRequestId + userTokenId + email + countryCode + firstName + lastName + timeStamp + merchantKey
    const checksum = await calculateChecksumForEndpoint(
      'createUser',
      {
        merchantId: envConfig.merchantId,
        merchantSiteId: envConfig.merchantSiteId,
        clientRequestId,
        userTokenId,
        email,
        countryCode,
        firstName,
        lastName,
        timeStamp: timestamp
      },
      envConfig.merchantKey
    );

    const requestBody: Record<string, unknown> = {
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId,
      userTokenId,
      email,
      countryCode,
      firstName,
      lastName,
      timeStamp: timestamp,
      checksum,
    };

    // Add optional fields
    if (phone) requestBody.phone = phone;
    if (address) requestBody.address = address;
    if (city) requestBody.city = city;
    if (state) requestBody.state = state;
    if (zip) requestBody.zip = zip;

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/createUser.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    // Store user locally for reference
    if (result.status === 'SUCCESS') {
      userStore.set(userTokenId, {
        userTokenId,
        email,
        firstName,
        lastName,
        countryCode,
        createdAt: new Date().toISOString()
      });
    }

    return jsonResponse({
      success: result.status === 'SUCCESS',
      userTokenId: result.userTokenId || userTokenId,
      ...result,
    });
  } catch (error) {
    console.error('Create user error:', error);
    return errorResponse(`Create user failed: ${error}`);
  }
}

// Get Payout Status - check status of a payout
interface GetPayoutStatusRequest {
  env: EnvConfig;
  userTokenId: string;
  clientUniqueId?: string;
}

async function handleGetPayoutStatus(request: Request): Promise<Response> {
  try {
    const body = await request.json() as GetPayoutStatusRequest;
    const { env: envConfig, userTokenId, clientUniqueId } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!userTokenId) {
      return errorResponse('Missing userTokenId');
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    // Checksum per MCP docs: merchantId + merchantSiteId + clientRequestId + userTokenId + timeStamp + merchantKey
    const checksum = await calculateChecksumForEndpoint(
      'getPayoutStatus',
      {
        merchantId: envConfig.merchantId,
        merchantSiteId: envConfig.merchantSiteId,
        clientRequestId,
        userTokenId,
        timeStamp: timestamp
      },
      envConfig.merchantKey
    );

    const requestBody: Record<string, unknown> = {
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId,
      userTokenId,
      timeStamp: timestamp,
      checksum,
    };

    if (clientUniqueId) {
      requestBody.clientUniqueId = clientUniqueId;
    }

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/getPayoutStatus.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    return jsonResponse({
      success: result.status === 'SUCCESS',
      ...result,
    });
  } catch (error) {
    console.error('Get payout status error:', error);
    return errorResponse(`Get payout status failed: ${error}`);
  }
}

// Get Card Details - BIN lookup (brand, type, issuing country)
interface GetCardDetailsRequest {
  env: EnvConfig;
  cardNumber: string;
  sessionToken?: string;
}

async function handleGetCardDetails(request: Request): Promise<Response> {
  try {
    const body = await request.json() as GetCardDetailsRequest;
    const { env: envConfig, cardNumber } = body;
    let { sessionToken } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!cardNumber) {
      return errorResponse('Missing cardNumber');
    }

    // Get session token if not provided
    if (!sessionToken) {
      const timestamp = generateTimestamp();
      const clientRequestId = generateRequestId();
      const sessionChecksum = await calculateChecksum([
        envConfig.merchantId,
        envConfig.merchantSiteId,
        clientRequestId,
        timestamp,
        envConfig.merchantKey
      ]);

      const sessionResponse = await fetch(`${envConfig.baseUrl}/ppp/api/getSessionToken.do`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: envConfig.merchantId,
          merchantSiteId: envConfig.merchantSiteId,
          clientRequestId,
          timeStamp: timestamp,
          checksum: sessionChecksum,
        }),
      });

      const sessionResult = await sessionResponse.json() as { sessionToken?: string };
      sessionToken = sessionResult.sessionToken;
      
      if (!sessionToken) {
        return errorResponse('Failed to get session token');
      }
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();

    const requestBody = {
      sessionToken,
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId,
      cardNumber,
      timeStamp: timestamp,
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/getCardDetails.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    // Mask card number in response
    return jsonResponse({
      success: result.status === 'SUCCESS',
      maskedCard: maskPAN(cardNumber),
      ...result,
    });
  } catch (error) {
    console.error('Get card details error:', error);
    return errorResponse(`Get card details failed: ${error}`);
  }
}

// ==================== 3DS MPI-ONLY ENDPOINTS ====================

// Authorize3d - initiate 3DS authentication for MPI-only flow
interface Authorize3dRequest {
  env: EnvConfig;
  sessionToken?: string;
  amount: string;
  currency: string;
  card: {
    number: string;
    holderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
  };
  notificationUrl?: string;
}

async function handleAuthorize3d(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Authorize3dRequest;
    const { env: envConfig, amount, currency, card, notificationUrl } = body;
    let { sessionToken } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId || !envConfig?.merchantKey) {
      return errorResponse('Missing merchant credentials');
    }

    if (!amount || !currency || !card) {
      return errorResponse('Missing required fields: amount, currency, card');
    }

    // Get session token if not provided
    if (!sessionToken) {
      const timestamp = generateTimestamp();
      const clientRequestId = generateRequestId();
      const sessionChecksum = await calculateChecksum([
        envConfig.merchantId,
        envConfig.merchantSiteId,
        clientRequestId,
        timestamp,
        envConfig.merchantKey
      ]);

      const sessionResponse = await fetch(`${envConfig.baseUrl}/ppp/api/getSessionToken.do`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: envConfig.merchantId,
          merchantSiteId: envConfig.merchantSiteId,
          clientRequestId,
          timeStamp: timestamp,
          checksum: sessionChecksum,
        }),
      });

      const sessionResult = await sessionResponse.json() as { sessionToken?: string };
      sessionToken = sessionResult.sessionToken;
      
      if (!sessionToken) {
        return errorResponse('Failed to get session token');
      }
    }

    const timestamp = generateTimestamp();
    const clientRequestId = generateRequestId();
    const userTokenId = `user_${Date.now()}`;

    // Checksum for authorize3d (same as payment.do)
    const checksum = await calculateChecksum([
      envConfig.merchantId,
      envConfig.merchantSiteId,
      clientRequestId,
      amount,
      currency,
      timestamp,
      envConfig.merchantKey
    ]);

    const requestBody = {
      sessionToken,
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId,
      timeStamp: timestamp,
      checksum,
      currency,
      amount,
      userTokenId,
      paymentOption: {
        card: {
          cardNumber: card.number,
          cardHolderName: card.holderName,
          expirationMonth: card.expMonth,
          expirationYear: card.expYear,
          CVV: card.cvv,
          threeD: {
            methodCompletionInd: 'U',
            platformType: '02',
            notificationURL: notificationUrl || 'https://nuvei-api-emulator.ndocs.workers.dev/api/3ds-notify',
            browserDetails: {
              acceptHeader: 'text/html,application/xhtml+xml',
              ip: '192.168.1.1',
              javaEnabled: 'TRUE',
              javaScriptEnabled: 'TRUE',
              language: 'EN',
              colorDepth: '24',
              screenHeight: '1080',
              screenWidth: '1920',
              timeZone: '0',
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          },
        },
      },
      billingAddress: {
        firstName: card.holderName.split(' ')[0] || 'Test',
        lastName: card.holderName.split(' ').slice(1).join(' ') || 'User',
        address: '123 Main St',
        city: 'London',
        country: 'GB',
        email: 'test@example.com',
      },
      deviceDetails: {
        ipAddress: '192.168.1.1',
      },
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/authorize3d.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    return jsonResponse({
      success: result.status === 'SUCCESS',
      sessionToken,
      ...result,
      // Mask sensitive data
      request: {
        ...requestBody,
        paymentOption: {
          card: {
            cardNumber: maskPAN(card.number),
            cardHolderName: card.holderName,
            expirationMonth: card.expMonth,
            expirationYear: card.expYear,
          }
        }
      }
    });
  } catch (error) {
    console.error('Authorize3d error:', error);
    return errorResponse(`Authorize3d failed: ${error}`);
  }
}

// Verify3d - complete 3DS verification and get MPI data (eci, cavv, dsTransID)
interface Verify3dRequest {
  env: EnvConfig;
  sessionToken: string;
  relatedTransactionId: string;
  amount: string;
  currency: string;
  card: {
    number: string;
    holderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
  };
}

async function handleVerify3d(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Verify3dRequest;
    const { env: envConfig, sessionToken, relatedTransactionId, amount, currency, card } = body;

    if (!envConfig?.merchantId || !envConfig?.merchantSiteId) {
      return errorResponse('Missing merchant credentials');
    }

    if (!sessionToken || !relatedTransactionId) {
      return errorResponse('Missing required fields: sessionToken, relatedTransactionId');
    }

    const clientRequestId = generateRequestId();
    const userTokenId = `user_${Date.now()}`;

    // Note: verify3d does NOT require checksum per MCP docs
    const requestBody = {
      sessionToken,
      merchantId: envConfig.merchantId,
      merchantSiteId: envConfig.merchantSiteId,
      clientRequestId,
      relatedTransactionId,
      currency,
      amount,
      userTokenId,
      paymentOption: {
        card: {
          cardNumber: card.number,
          cardHolderName: card.holderName,
          expirationMonth: card.expMonth,
          expirationYear: card.expYear,
          CVV: card.cvv,
        },
      },
      billingAddress: {
        firstName: card.holderName.split(' ')[0] || 'Test',
        lastName: card.holderName.split(' ').slice(1).join(' ') || 'User',
        address: '123 Main St',
        city: 'London',
        country: 'GB',
        email: 'test@example.com',
      },
      deviceDetails: {
        ipAddress: '192.168.1.1',
      },
    };

    const response = await fetch(`${envConfig.baseUrl}/ppp/api/verify3d.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json() as Record<string, unknown>;

    // Extract MPI data if available
    const paymentOption = result.paymentOption as Record<string, unknown>;
    const cardData = paymentOption?.card as Record<string, unknown>;
    const threeD = cardData?.threeD as Record<string, unknown>;

    const mpiData = threeD ? {
      eci: threeD.eci,
      cavv: threeD.cavv,
      dsTransID: threeD.dsTransID,
      threeDSVersion: threeD.version,
      authenticationStatus: threeD.threeDReasonId,
    } : null;

    return jsonResponse({
      success: result.status === 'SUCCESS',
      mpiData,
      ...result,
      // Mask sensitive data
      request: {
        ...requestBody,
        paymentOption: {
          card: {
            cardNumber: maskPAN(card.number),
            cardHolderName: card.holderName,
          }
        }
      }
    });
  } catch (error) {
    console.error('Verify3d error:', error);
    return errorResponse(`Verify3d failed: ${error}`);
  }
}

// ==================== SCENARIOS API ====================

// Get available scenarios
async function handleGetScenarios(): Promise<Response> {
  const scenarios = [
    {
      id: '3ds-challenge',
      name: '3DS Challenge Flow',
      description: 'Full 3DS authentication with challenge popup',
      steps: ['getSessionToken', 'initPayment', 'payment.do (REDIRECT)', '3DS Challenge', 'payment.do (liability shift)'],
      testCards: getTestCardsByFlow('challenge').map(c => ({ number: c.cardNumber, brand: c.brand }))
    },
    {
      id: '3ds-frictionless',
      name: '3DS Frictionless Flow',
      description: 'Authentication waived by issuer',
      steps: ['getSessionToken', 'initPayment', 'payment.do (APPROVED)'],
      testCards: getTestCardsByFlow('frictionless').map(c => ({ number: c.cardNumber, brand: c.brand }))
    },
    {
      id: 'auth-settle',
      name: 'Auth + Settle',
      description: 'Two-step capture: authorize then settle',
      steps: ['getSessionToken', 'initPayment', 'payment.do (Auth)', 'settleTransaction'],
      testCards: getTestCardsByFlow('none').map(c => ({ number: c.cardNumber, brand: c.brand }))
    },
    {
      id: 'mpi-only',
      name: 'MPI-Only Flow',
      description: 'Get 3DS authentication data (eci, cavv) without payment',
      steps: ['getSessionToken', 'authorize3d', '3DS Challenge (if needed)', 'verify3d'],
      testCards: getTestCardsByFlow('challenge').map(c => ({ number: c.cardNumber, brand: c.brand }))
    },
    {
      id: 'external-mpi',
      name: 'External MPI',
      description: 'Use pre-obtained 3DS data for payment',
      steps: ['getSessionToken', 'payment.do (with externalMPI)'],
      testCards: getTestCardsByFlow('none').map(c => ({ number: c.cardNumber, brand: c.brand }))
    },
    {
      id: 'payout',
      name: 'Payout Flow',
      description: 'Send money to a card',
      steps: ['createUser (if needed)', 'getSessionToken', 'payout.do'],
      testCards: [{ number: '4111111111111111', brand: 'Visa' }]
    },
    {
      id: 'recurring',
      name: 'Recurring Payment',
      description: 'Save card and charge later',
      steps: ['createUser', 'payment.do (save card)', 'payment.do (recurring)'],
      testCards: getTestCardsByFlow('none').map(c => ({ number: c.cardNumber, brand: c.brand }))
    },
    {
      id: 'decline',
      name: 'Decline Simulation',
      description: 'Test various decline scenarios',
      steps: ['getSessionToken', 'initPayment', 'payment.do (DECLINED)'],
      testCards: getTestCardsByFlow('decline').concat(getTestCardsByFlow('error')).map(c => ({ 
        number: c.cardNumber, 
        brand: c.brand, 
        behavior: c.behavior 
      }))
    }
  ];

  return jsonResponse({
    scenarios,
    testCards: TEST_CARDS,
    endpointSpecs: Object.keys(ENDPOINT_SPECS),
  });
}

// Get test cards
async function handleGetTestCards(): Promise<Response> {
  return jsonResponse({
    testCards: TEST_CARDS,
    byFlow: {
      challenge: getTestCardsByFlow('challenge'),
      frictionless: getTestCardsByFlow('frictionless'),
      decline: getTestCardsByFlow('decline'),
      none: getTestCardsByFlow('none'),
      error: getTestCardsByFlow('error'),
    }
  });
}

// Get endpoint specifications
async function handleGetEndpointSpecs(): Promise<Response> {
  return jsonResponse({
    endpoints: ENDPOINT_SPECS,
    categories: {
      session: Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === 'session').map(([k]) => k),
      payment: Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === 'payment').map(([k]) => k),
      operation: Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === 'operation').map(([k]) => k),
      user: Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === 'user').map(([k]) => k),
      payout: Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === 'payout').map(([k]) => k),
      lookup: Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === 'lookup').map(([k]) => k),
      apm: Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === 'apm').map(([k]) => k),
      '3ds': Object.entries(ENDPOINT_SPECS).filter(([_, s]) => s.category === '3ds').map(([k]) => k),
    }
  });
}

// ==================== MAIN ROUTER ====================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return handleOptions();
    }

    // API Routes
    if (path === '/api/env/test' && method === 'POST') {
      return handleTestEnv(request);
    }

    if (path === '/api/payment/3ds' && method === 'POST') {
      return handle3DSPayment(request);
    }

    if (path === '/api/payment/liability-shift' && method === 'POST') {
      return handleLiabilityShift(request);
    }

    if (path === '/api/payment/status' && method === 'POST') {
      return handleGetPaymentStatus(request);
    }

    if (path === '/api/transaction/details' && method === 'POST') {
      return handleGetTransactionDetails(request);
    }

    if (path === '/api/operations/settle' && method === 'POST') {
      return handleSettle(request);
    }

    if (path === '/api/operations/void' && method === 'POST') {
      return handleVoid(request);
    }

    if (path === '/api/operations/refund' && method === 'POST') {
      return handleRefund(request);
    }

    // DMN/Webhook endpoints (support both POST and GET as per Nuvei docs)
    if (path === '/api/webhook' && (method === 'POST' || method === 'GET')) {
      return handleWebhook(request);
    }

    if (path === '/api/webhooks' && method === 'GET') {
      return handleGetWebhooks();
    }

    if (path === '/api/webhooks/clear' && method === 'POST') {
      return handleClearWebhooks();
    }

    // 3DS notification endpoints (for fingerprinting and challenge callbacks)
    if (path === '/api/3ds-method-notify' && method === 'POST') {
      // 3DS method completion notification
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    if (path === '/api/3ds-notify' && method === 'POST') {
      // 3DS challenge completion notification - parse and send to frontend
      const contentType = request.headers.get('content-type') || '';
      const rawBody = await request.text();
      
      let payload: Record<string, unknown> = {};
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(rawBody);
        params.forEach((value, key) => {
          payload[key] = value;
        });
      } else {
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          payload = { rawBody };
        }
      }
      
      // Parse cRes to extract 3DS result
      let threeDSResult: Record<string, unknown> = {
        transStatus: 'Y',
        messageType: 'CRes'
      };
      
      if (payload.cres && typeof payload.cres === 'string') {
        try {
          const decodedText = atob((payload.cres as string).replace(/-/g, '+').replace(/_/g, '/'));
          try {
            const cresJson = JSON.parse(decodedText);
            threeDSResult = {
              transStatus: cresJson.transStatus,
              threeDSServerTransID: cresJson.threeDSServerTransID,
              acsTransID: cresJson.acsTransID,
              messageType: cresJson.messageType || 'CRes',
              authenticationValue: cresJson.authenticationValue,
              eci: cresJson.eci,
              dsTransID: cresJson.dsTransID,
            };
          } catch {
            threeDSResult = {
              transStatus: 'N',
              errorMessage: decodedText,
              messageType: 'Error'
            };
          }
        } catch {
          threeDSResult = {
            transStatus: 'N',
            errorMessage: 'Failed to decode cRes',
            messageType: 'Error'
          };
        }
      }
      
      // Store as webhook
      await handleWebhook(new Request(request.url, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: rawBody,
      }));
      
      // Determine if auth was successful
      const authSuccess = threeDSResult.transStatus === 'Y' || threeDSResult.transStatus === 'A';
      const statusIcon = authSuccess ? '✓' : '✗';
      const statusText = authSuccess ? 'Authentication Successful' : 'Authentication Failed';
      const statusColor = authSuccess ? '#10b981' : '#ef4444';
      
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>3DS Complete</title>
  <meta charset="utf-8">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; justify-content: center; align-items: center;
      height: 100vh; margin: 0; background: #1a1a2e; color: #fff; text-align: center;
    }
    .container {
      background: #16213e; padding: 40px; border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    .icon { font-size: 64px; color: ${statusColor}; margin-bottom: 20px; }
    h2 { margin: 0 0 12px 0; color: ${statusColor}; }
    p { margin: 8px 0; color: #94a3b8; }
    .status-badge {
      display: inline-block; padding: 8px 16px;
      background: ${statusColor}22; border: 1px solid ${statusColor};
      border-radius: 8px; color: ${statusColor}; font-weight: 600;
      margin-top: 12px; font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${statusIcon}</div>
    <h2>3DS ${statusText}</h2>
    <p>Returning to application...</p>
    <div class="status-badge">transStatus: ${threeDSResult.transStatus || 'Unknown'}</div>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ 
        type: '3ds-complete',
        success: ${authSuccess},
        threeDSResult: ${JSON.stringify(threeDSResult)},
        rawPayload: ${JSON.stringify(payload)}
      }, '*');
    }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;
      
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
      });
    }

    if (path === '/api/3ds-challenge-notify' && method === 'POST') {
      // 3DS challenge completion notification
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // MCP Rates endpoint
    if (path === '/api/mcp/rates' && method === 'POST') {
      return handleGetMcpRates(request);
    }

    // Payout endpoint
    if (path === '/api/payout' && method === 'POST') {
      return handlePayout(request);
    }

    // APMs endpoint
    if (path === '/api/apms' && method === 'POST') {
      return handleGetApms(request);
    }

    // APM Payment endpoint
    if (path === '/api/apm/payment' && method === 'POST') {
      return handleApmPayment(request);
    }

    // APM return URL handler
    if (path.startsWith('/apm/return') && method === 'GET') {
      return handleApmReturn(url);
    }

    // UPO endpoints
    if (path === '/api/upo/list' && method === 'POST') {
      return handleGetUserUPOs(request);
    }
    if (path === '/api/upo/add' && method === 'POST') {
      return handleAddUPO(request);
    }
    if (path === '/api/upo/delete' && method === 'POST') {
      return handleDeleteUPO(request);
    }

    // ===== NEW VBEST ENDPOINTS =====
    
    // User management
    if (path === '/api/user/create' && method === 'POST') {
      return handleCreateUser(request);
    }

    // Payout status
    if (path === '/api/payout/status' && method === 'POST') {
      return handleGetPayoutStatus(request);
    }

    // Card details (BIN lookup)
    if (path === '/api/card/details' && method === 'POST') {
      return handleGetCardDetails(request);
    }

    // 3DS MPI-only endpoints
    if (path === '/api/3ds/authorize' && method === 'POST') {
      return handleAuthorize3d(request);
    }
    if (path === '/api/3ds/verify' && method === 'POST') {
      return handleVerify3d(request);
    }

    // Scenarios API
    if (path === '/api/scenarios' && method === 'GET') {
      return handleGetScenarios();
    }
    if (path === '/api/scenarios/test-cards' && method === 'GET') {
      return handleGetTestCards();
    }
    if (path === '/api/scenarios/endpoints' && method === 'GET') {
      return handleGetEndpointSpecs();
    }

    // Version info endpoint
    if (path === '/api/version' && method === 'GET') {
      return jsonResponse({
        version: 'Vbest',
        name: 'Nuvei REST API 1.0 Emulator',
        build: new Date().toISOString(),
        endpoints: Object.keys(ENDPOINT_SPECS).length,
        testCards: TEST_CARDS.length,
        features: [
          'Full 3DS support (Challenge, Frictionless, MPI-only)',
          'Financial operations (Settle, Void, Refund)',
          'User management (Create, UPO)',
          'Payouts',
          'APMs',
          'DMN Webhooks',
          'Card BIN lookup',
          'Multi-currency (MCP rates)',
          'Comprehensive test card database',
          'Scenario-based testing'
        ]
      });
    }

    // 3DS Challenge redirect page - auto-submits form to acsUrl
    if (path === '/api/3ds-challenge' && method === 'GET') {
      const acsUrl = url.searchParams.get('acsUrl');
      const cReq = url.searchParams.get('creq');
      
      if (!acsUrl || !cReq) {
        return errorResponse('Missing acsUrl or creq');
      }

      // Return HTML page that auto-submits form to ACS
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>3DS Challenge - Redirecting...</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; 
      justify-content: center; 
      align-items: center; 
      height: 100vh; 
      margin: 0;
      background: #1a1a2e;
      color: #fff;
    }
    .loader { text-align: center; }
    .spinner { 
      width: 40px; 
      height: 40px; 
      border: 3px solid #333; 
      border-top-color: #00d4ff; 
      border-radius: 50%; 
      animation: spin 1s linear infinite; 
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Redirecting to 3DS Challenge...</p>
  </div>
  <form id="challengeForm" method="POST" action="${acsUrl}">
    <input type="hidden" name="creq" value="${cReq}" />
  </form>
  <script>
    document.getElementById('challengeForm').submit();
  </script>
</body>
</html>`;

      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html', ...corsHeaders },
      });
    }

    // Return 404 for unmatched API routes
    if (path.startsWith('/api/')) {
      return errorResponse('Not found', 404);
    }

    // For non-API paths, Cloudflare serves static assets
    return new Response('Not found', { status: 404 });
  },
};
