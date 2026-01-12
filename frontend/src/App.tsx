import { useState, useEffect, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
import './styles.css';

// Error Boundary to catch React rendering errors
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React Error Boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#1a1a2e', color: '#fff', minHeight: '100vh' }}>
          <h1 style={{ color: '#ef4444' }}>⚠️ Application Error</h1>
          <p>Something went wrong. Please refresh the page.</p>
          <pre style={{ background: '#0f0f1a', padding: '16px', borderRadius: '8px', overflow: 'auto', marginTop: '16px' }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '16px', padding: '12px 24px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            🔄 Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Types
interface EnvConfig {
  merchantId: string;
  merchantSiteId: string;
  merchantKey: string;
  baseUrl: string;
}

interface TestCard {
  id: string;
  name: string;
  number: string;
  holder: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  category: string;
  behavior: string;
  amount?: string;
  threeDSFlow?: 'frictionless' | 'challenge' | 'decline' | 'none' | 'error';
  expectedEci?: string;
}

// Comprehensive Test Cards - Vbest Edition
// Source: Nuvei Documentation - https://docs.nuvei.com/documentation/integration/testing/testing-cards/
// CRITICAL AMOUNTS per Nuvei docs:
// - Frictionless (FL-*): amount >= 150
// - Challenge (CL-*): amount = 151
// - non-3DS: amount = 10
const TEST_CARDS: TestCard[] = [
  // ===== 3DS FRICTIONLESS - amount >= 150 =====
  { id: 'fl-visa-1', name: 'FL-BRW1 (VISA)', number: '4000020951595032', holder: 'FL-BRW1', expMonth: '12', expYear: '2030', cvv: '217', category: '3DS Frictionless', behavior: '3DS Frictionless, Approved', amount: '150', threeDSFlow: 'frictionless', expectedEci: '05' },
  { id: 'fl-visa-2', name: 'FL-BRW2 (VISA + Method)', number: '4000027891380961', holder: 'FL-BRW2', expMonth: '12', expYear: '2030', cvv: '217', category: '3DS Frictionless', behavior: '3DS Frictionless with fingerprint', amount: '150', threeDSFlow: 'frictionless', expectedEci: '05' },
  { id: 'fl-mc', name: 'FL-BRW3 (MC)', number: '5333302221254276', holder: 'FL-BRW3', expMonth: '12', expYear: '2030', cvv: '217', category: '3DS Frictionless', behavior: '3DS Frictionless MC', amount: '150', threeDSFlow: 'frictionless', expectedEci: '02' },
  { id: 'fl-generic', name: 'Generic Frictionless', number: '4000000000001000', holder: 'Test Frictionless', expMonth: '12', expYear: '2030', cvv: '123', category: '3DS Frictionless', behavior: 'Generic frictionless test', amount: '150', threeDSFlow: 'frictionless', expectedEci: '05' },
  
  // ===== 3DS CHALLENGE - amount = 151 =====
  { id: 'cl-visa', name: 'CL-BRW1 (VISA)', number: '4000020951595032', holder: 'CL-BRW1', expMonth: '12', expYear: '2030', cvv: '217', category: '3DS Challenge', behavior: '3DS Challenge, Approved', amount: '151', threeDSFlow: 'challenge', expectedEci: '05' },
  { id: 'cl-mc', name: 'CL-BRW2 (MC + 3DS)', number: '2221008123677736', holder: 'CL-BRW2', expMonth: '12', expYear: '2030', cvv: '217', category: '3DS Challenge', behavior: '3DS Challenge with fingerprint', amount: '151', threeDSFlow: 'challenge', expectedEci: '02' },
  { id: 'cl-generic', name: 'Generic Challenge', number: '4000000000001091', holder: 'Test Challenge', expMonth: '12', expYear: '2030', cvv: '123', category: '3DS Challenge', behavior: 'Generic challenge test', amount: '151', threeDSFlow: 'challenge', expectedEci: '05' },
  
  // ===== NON-3DS APPROVED - amount = 10 =====
  { id: 'non3ds-visa', name: 'Non-3DS VISA (Jane Smith)', number: '4000027891380961', holder: 'Jane Smith', expMonth: '12', expYear: '2030', cvv: '123', category: 'Non-3DS', behavior: 'Non-3DS, Approved', amount: '10', threeDSFlow: 'none', expectedEci: '07' },
  { id: 'non3ds-visa2', name: 'Standard VISA', number: '4761344136141390', holder: 'John Smith', expMonth: '12', expYear: '2030', cvv: '123', category: 'Non-3DS', behavior: 'Standard approval', amount: '10', threeDSFlow: 'none', expectedEci: '07' },
  { id: 'non3ds-mc', name: 'Standard MC', number: '5111111111111118', holder: 'Test User', expMonth: '12', expYear: '2030', cvv: '123', category: 'Non-3DS', behavior: 'Mastercard without 3DS', amount: '10', threeDSFlow: 'none', expectedEci: '07' },
  
  // ===== DECLINE SCENARIOS - any amount =====
  { id: 'decline-visa', name: 'VISA Decline', number: '4008370896662369', holder: 'Jane Doe', expMonth: '12', expYear: '2030', cvv: '123', category: 'Decline', behavior: 'Declined by issuer', amount: '50', threeDSFlow: 'decline' },
  { id: 'decline-mc', name: 'MC Decline', number: '5333418445863914', holder: 'Jane Doe', expMonth: '12', expYear: '2030', cvv: '123', category: 'Decline', behavior: 'Declined by issuer', amount: '50', threeDSFlow: 'decline' },
  { id: 'decline-insuf', name: 'Insufficient Funds', number: '4000000000000002', holder: 'Test Decline', expMonth: '12', expYear: '2030', cvv: '123', category: 'Decline', behavior: 'Code 51 - Insufficient Funds', amount: '50', threeDSFlow: 'decline' },
  { id: 'decline-expired', name: 'Expired Card', number: '4000000000000069', holder: 'Test Decline', expMonth: '12', expYear: '2030', cvv: '123', category: 'Decline', behavior: 'Code 54 - Expired Card', amount: '50', threeDSFlow: 'decline' },
  { id: 'decline-cvv', name: 'Invalid CVV', number: '4000000000000127', holder: 'Test Decline', expMonth: '12', expYear: '2030', cvv: '999', category: 'Decline', behavior: 'Code N7 - CVV Mismatch', amount: '50', threeDSFlow: 'decline' },
  { id: 'decline-3ds', name: '3DS Auth Declined', number: '4000000000001109', holder: 'Test 3DS Fail', expMonth: '12', expYear: '2030', cvv: '123', category: 'Decline', behavior: '3DS authentication declined', amount: '50', threeDSFlow: 'decline' },
  
  // ===== DO NOT HONOR - any amount =====
  { id: 'dnh-visa', name: 'VISA DNH', number: '4000164166749263', holder: 'Jane Doe', expMonth: '12', expYear: '2030', cvv: '123', category: 'Do Not Honor', behavior: 'Code 05 - Do Not Honor', amount: '25', threeDSFlow: 'decline' },
  { id: 'dnh-mc', name: 'MC DNH', number: '5333463046218753', holder: 'Jane Doe', expMonth: '12', expYear: '2030', cvv: '123', category: 'Do Not Honor', behavior: 'Code 05 - Do Not Honor', amount: '25', threeDSFlow: 'decline' },
  { id: 'dnh-generic', name: 'Generic DNH', number: '4000000000000119', holder: 'Test DNH', expMonth: '12', expYear: '2030', cvv: '123', category: 'Do Not Honor', behavior: 'Generic Do Not Honor', amount: '25', threeDSFlow: 'decline' },
  
  // ===== ERROR SIMULATION =====
  { id: 'err-brw1', name: 'ERR-BRW1 (Error)', number: '4000319872807223', holder: 'ERR-BRW1', expMonth: '12', expYear: '2030', cvv: '217', category: 'Error', behavior: 'Returns error', amount: '75', threeDSFlow: 'error' },
  { id: 'err-timeout', name: 'Timeout', number: '4000000000000101', holder: 'Test Timeout', expMonth: '12', expYear: '2030', cvv: '123', category: 'Error', behavior: 'Simulates gateway timeout', amount: '75', threeDSFlow: 'error' },
  
  // ===== AMEX =====
  { id: 'amex-frictionless', name: 'AMEX Frictionless', number: '374245455400001', holder: 'AMEX Test', expMonth: '12', expYear: '2030', cvv: '1234', category: 'AMEX', behavior: 'AMEX frictionless flow', amount: '100', threeDSFlow: 'frictionless', expectedEci: '05' },
  
  // ===== PAYOUTS =====
  { id: 'payout-visa', name: 'Payout VISA', number: '4111111111111111', holder: 'Payout Test', expMonth: '12', expYear: '2030', cvv: '123', category: 'Payout', behavior: 'Standard payout card', amount: '50', threeDSFlow: 'none' },
];

// Feature test options
const FEATURE_OPTIONS = [
  { id: 'notificationUrlCasing', name: 'notificationUrl Casing', description: 'Tests how Nuvei handles different casing of the notification URL parameter in the threeD object (non-canonical casing may fail).' },
  { id: 'methodCompletionInd', name: 'methodCompletionInd', description: 'Test 3DS method completion indicator values (Y, N, U).' },
  { id: 'methodNotificationUrlMode', name: 'methodNotificationUrlMode', description: 'Toggle 3DS methodNotificationUrl in initPayment (on/off).' },
  { id: 'platformType', name: 'platformType', description: 'Test different platform types (01=App, 02=Browser).' },
  { id: 'challengePreference', name: 'challengePreference', description: 'Test challenge preference values for 3DS.' },
  { id: 'challengeWindowSize', name: 'challengeWindowSize', description: 'Test different challenge window sizes.' },
  { id: 'browserDetailsMode', name: 'browserDetailsMode', description: 'Test browserDetails payload completeness (full/minimal/omit).' },
];

const FEATURE_OPTION_VALUES: Record<string, Array<{ value: string; label: string }>> = {
  notificationUrlCasing: [
    { value: 'notificationURL', label: 'Capital "URL" (docs example)' },
    { value: 'notificationUrl', label: 'camelCase' },
    { value: 'NotificationUrl', label: 'PascalCase' },
  ],
  methodCompletionInd: [
    { value: 'auto', label: 'Auto (based on methodUrl)' },
    { value: 'Y', label: 'Y - Method completed' },
    { value: 'N', label: 'N - Not completed' },
    { value: 'U', label: 'U - Unavailable/unknown' },
  ],
  methodNotificationUrlMode: [
    { value: 'on', label: 'Include methodNotificationUrl' },
    { value: 'off', label: 'Omit methodNotificationUrl' },
  ],
  platformType: [
    { value: '02', label: '02 - Browser' },
    { value: '01', label: '01 - App' },
  ],
  challengePreference: [
    { value: '01', label: '01 - No preference' },
    { value: '02', label: '02 - No challenge requested' },
    { value: '03', label: '03 - Challenge requested' },
    { value: '04', label: '04 - Challenge mandate' },
  ],
  challengeWindowSize: [
    { value: '01', label: '01 - 250x400' },
    { value: '02', label: '02 - 390x400' },
    { value: '03', label: '03 - 500x600' },
    { value: '04', label: '04 - 600x400' },
    { value: '05', label: '05 - Full screen' },
  ],
  browserDetailsMode: [
    { value: 'full', label: 'Full browserDetails payload' },
    { value: 'minimal', label: 'Minimal browserDetails payload' },
    { value: 'omit', label: 'Omit browserDetails' },
  ],
};

const DEFAULT_FEATURE_OPTION_BY_TEST = Object.fromEntries(
  Object.entries(FEATURE_OPTION_VALUES).map(([key, options]) => [key, options[0]?.value || ''])
) as Record<string, string>;

type TabId = 'payment' | 'operations' | 'webhooks' | 'lookup' | 'cardinfo' | 'mcp' | 'payouts' | 'upo' | 'apms' | 'scenarios';

// Default test credentials (user should enter their own)
const DEFAULT_CREDENTIALS: EnvConfig = {
  merchantId: '',
  merchantSiteId: '',
  merchantKey: '',
  baseUrl: 'https://ppp-test.safecharge.com',
};

const EMPTY_APM_FIELDS = {
  AccountNumber: '',
  RoutingNumber: '',
  SECCode: 'WEB',
  account_id: '',
  nettelerAccount: '',
  BIC: '',
  bankId: ''
};

const buildApmFields = (paymentMethod: string) => {
  const fields = { ...EMPTY_APM_FIELDS };
  const name = paymentMethod.toLowerCase();

  if (name.includes('ach')) {
    fields.AccountNumber = '1234567890';
    fields.RoutingNumber = '123456789';
    fields.SECCode = 'WEB';
  }
  if (name.includes('ideal')) {
    fields.BIC = 'TESTBANK';
  }
  if (name.includes('moneybookers')) {
    fields.account_id = 'partnersuccess-s2p@nuvei.com';
    fields.nettelerAccount = fields.account_id;
  }
  if (name.includes('neteller')) {
    fields.account_id = 'integration-international@nuvei.com';
    fields.nettelerAccount = fields.account_id;
  }
  if (name.includes('open_banking')) {
    fields.bankId = 'ob-test-bank';
  }

  return fields;
};

function App() {
  // Credentials
  const [env, setEnv] = useState<EnvConfig>({
    merchantId: '',
    merchantSiteId: '',
    merchantKey: '',
    baseUrl: 'https://ppp-test.safecharge.com',
  });
  const [isApiReady, setIsApiReady] = useState<boolean | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('payment');

  // Payment settings
  const [selectedCardId, setSelectedCardId] = useState('cl-visa');
  const [featureTest, setFeatureTest] = useState('notificationUrlCasing');
  const [featureOptionsByTest, setFeatureOptionsByTest] = useState<Record<string, string>>(
    DEFAULT_FEATURE_OPTION_BY_TEST
  );
  
  // Card details - initialize from default card
  const defaultCard = TEST_CARDS.find(c => c.id === 'cl-visa') || TEST_CARDS[0];
  const [cardNumber, setCardNumber] = useState(defaultCard.number);
  const [cardHolder, setCardHolder] = useState(defaultCard.holder);
  const [expMonth, setExpMonth] = useState(defaultCard.expMonth);
  const [expYear, setExpYear] = useState(defaultCard.expYear);
  const [cvv, setCvv] = useState(defaultCard.cvv);
  
  // Payment - initialize amount from default card
  const [amount, setAmount] = useState(defaultCard.amount || '200');
  const [currency, setCurrency] = useState('USD');
  const [notificationUrl, setNotificationUrl] = useState('');
  
  // Results
  const [isRunning, setIsRunning] = useState(false);
  const [requestData, setRequestData] = useState<Record<string, unknown> | null>(null);
  const [responseData, setResponseData] = useState<Record<string, unknown> | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'steps' | 'request' | 'response' | 'challenge'>('steps');
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flowSteps, setFlowSteps] = useState<Array<{
    stepId: string;
    stepName: string;
    status: string;
    request: { url: string; method: string; body: Record<string, unknown>; timestamp: string };
    response: { status: number; body: Record<string, unknown>; duration: number };
  }>>([]);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  
  // 3DS Fingerprinting
  const [fingerprintUrl, setFingerprintUrl] = useState<string | null>(null);
  const [fingerprintPayload, setFingerprintPayload] = useState<string | null>(null);

  // Store context for liability-shift after 3DS challenge
  const [pendingLiabilityShift, setPendingLiabilityShift] = useState<{
    sessionToken: string;
    initPaymentTransactionId: string;
    card: { number: string; holderName: string; expMonth: string; expYear: string; cvv: string };
    amount: string;
    currency: string;
  } | null>(null);
  
  // Ref to track pendingLiabilityShift for the message handler (avoids stale closure)
  const pendingLiabilityShiftRef = useRef(pendingLiabilityShift);
  useEffect(() => {
    pendingLiabilityShiftRef.current = pendingLiabilityShift;
  }, [pendingLiabilityShift]);

  // Operations
  const [opTransactionId, setOpTransactionId] = useState('');
  const [opAuthCode, setOpAuthCode] = useState('');
  const [opAmount, setOpAmount] = useState('50.00');
  const [opCurrency, setOpCurrency] = useState('USD');
  const [settleLog, setSettleLog] = useState('// Settle log');
  const [refundLog, setRefundLog] = useState('// Refund log');
  const [voidLog, setVoidLog] = useState('// Void log');
  const [paymentStatusLog, setPaymentStatusLog] = useState('// Payment status log');
  const [sessionToken, setSessionToken] = useState('');
  const [txDetailsLog, setTxDetailsLog] = useState('// Transaction details log');
  const [cardLookupLog, setCardLookupLog] = useState('// Card lookup log');
  const [cardLookupNumber, setCardLookupNumber] = useState('');

  // Webhooks
  const [webhooks, setWebhooks] = useState<Array<{id: string; timestamp: string; payload: Record<string, unknown>}>>([]);
  const [selectedWebhook, setSelectedWebhook] = useState<{id: string; timestamp: string; payload: Record<string, unknown>} | null>(null);
  const [webhookPolling, setWebhookPolling] = useState(true);

  // MCP (Multi-Currency Pricing)
  const [mcpFromCurrency, setMcpFromCurrency] = useState('USD');
  const [mcpRates, setMcpRates] = useState<Array<{ currency: string; rate: number }>>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpLog, setMcpLog] = useState('// MCP rates will appear here');

  // Payouts
  const [payoutUserTokenId, setPayoutUserTokenId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('50.00');
  const [payoutCurrency, setPayoutCurrency] = useState('USD');
  const [payoutUpoId, setPayoutUpoId] = useState('');
  const [payoutLog, setPayoutLog] = useState('// Payout log');

  // UPO (User Payment Options)
  const [upoUserTokenId, setUpoUserTokenId] = useState('');
  const [upoList, setUpoList] = useState<Array<Record<string, unknown>>>([]);
  const [upoLog, setUpoLog] = useState('// UPO operations log');
  const [upoLoading, setUpoLoading] = useState(false);
  const [upoError, setUpoError] = useState<string | null>(null);
  const [upoCardNumber, setUpoCardNumber] = useState('');
  const [upoCardHolder, setUpoCardHolder] = useState('');
  const [upoExpMonth, setUpoExpMonth] = useState('12');
  const [upoExpYear, setUpoExpYear] = useState('2030');
  const [upoSelectedCard, setUpoSelectedCard] = useState('');

  // APMs
  const [apmCountry, setApmCountry] = useState('US');
  const [apmCurrency, setApmCurrency] = useState('USD');
  const [apmRedirectMode, setApmRedirectMode] = useState<'auto' | 'manual'>('auto');
  const [apmUserTokenId, setApmUserTokenId] = useState('');
  const [apmList, setApmList] = useState<Array<{ paymentMethod: string; paymentMethodDisplayName?: unknown; logoURL?: string }>>([]);
  const [apmLoading, setApmLoading] = useState(false);
  const [apmError, setApmError] = useState<string | null>(null);
  const [selectedApm, setSelectedApm] = useState<string | null>(null);
  const [apmPaymentLoading, setApmPaymentLoading] = useState(false);
  const [apmPaymentResult, setApmPaymentResult] = useState<{
    success?: boolean;
    pending?: boolean;
    status?: string;
    paymentMethod?: string;
    result?: Record<string, unknown>;
    redirectUrl?: string;
  } | null>(null);

  // APM Field Collection Modal
  const [showApmFieldsModal, setShowApmFieldsModal] = useState(false);
  const [selectedApmForPayment, setSelectedApmForPayment] = useState<any>(null);
  const [apmFields, setApmFields] = useState<Record<string, string>>({ ...EMPTY_APM_FIELDS });

  const getApmRules = (pm: string) => {
    const name = pm.toLowerCase();
    if (name.includes('ach')) return { required: ['AccountNumber', 'RoutingNumber', 'SECCode'], countries: ['US'], currencies: ['USD'] };
    if (name.includes('ideal')) return { required: ['BIC'], countries: ['NL'], currencies: ['EUR'] };
    if (name.includes('sofort')) return { required: [], countries: ['AT','BE','FR','DE','IT','NL','SK','ES','CH'], currencies: ['EUR','CHF'] };
    if (name.includes('klarna')) return { required: [], countries: [], currencies: ['CHF','CZK','DKK','EUR','GBP','NOK','PLN','RON','SEK'] };
    if (name.includes('moneybookers')) return { required: ['account_id'] };
    if (name.includes('neteller')) return { required: ['account_id'] };
    if (name.includes('paywithbanktransfer')) return { required: [], countries: ['GB'], currencies: ['GBP'] };
    if (name.includes('open_banking')) return { required: ['bankId'] };
    if (name.includes('instant_open_banking')) return { required: ['bankId'] };
    return { required: [] };
  };

  // Fetch webhooks
  const fetchWebhooks = useCallback(async () => {
    try {
      const response = await fetch('/api/webhooks');
      const result = await response.json(); 
      if (result.webhooks) {
        setWebhooks(result.webhooks);
      }
    } catch (e) {
      console.error('Failed to fetch webhooks:', e);
    }
  }, []);

  const clearWebhooks = async () => {
    try {
      await fetch('/api/webhooks/clear', { method: 'POST' });
      setWebhooks([]);
      setSelectedWebhook(null);
    } catch (e) {
      console.error('Failed to clear webhooks:', e);
    }
  };

  // APM Payment Handler
  const handleApmPayment = async (apm: any, customFields: Record<string, string>) => {
    setSelectedApm(apm.paymentMethod);
    setApmPaymentLoading(true);
    setApmPaymentResult(null);
    setApmError(null);
    setShowApmFieldsModal(false);
    
    try {
      const response = await fetch('/api/apm/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          env,
          paymentMethod: apm.paymentMethod,
          amount: amount,
          currency: apmCurrency,
          country: apmCountry,
          userTokenId: apmUserTokenId || undefined,
          firstName: cardHolder.split(' ')[0] || 'Test',
          lastName: cardHolder.split(' ').slice(1).join(' ') || 'User',
          email: 'test@example.com',
          phone: '+1234567890',
          address: '123 Test Street',
          city: 'New York',
          zip: '10001',
          paymentMethodFields: customFields
        }),
      });
      
      const result = await response.json();
      console.log('APM Payment response:', result);
      
      if (result.redirectUrl) {
        if (apmRedirectMode === 'auto') {
          // Open redirect URL in popup
          const popup = window.open(
            result.redirectUrl,
            'apm_payment',
            'width=600,height=700,scrollbars=yes,resizable=yes'
          );
          
          if (popup) {
            setApmPaymentResult({
              redirectUrl: result.redirectUrl,
              result: result.result
            });
            
            // Check if popup was closed without completing
            const checkClosed = setInterval(() => {
              if (popup.closed) {
                clearInterval(checkClosed);
                fetchWebhooks(); // Refresh webhooks in case DMN was received
              }
            }, 1000);
          } else {
            setApmError('Popup blocked! Please allow popups for this site.');
          }
        } else {
          setApmPaymentResult({
            redirectUrl: result.redirectUrl,
            result: result.result
          });
        }
      } else if (result.error) {
        setApmError(result.error);
      } else {
        setApmPaymentResult({
          success: result.success,
          result: result.result
        });
      }
    } catch (err) {
      setApmError(`Payment failed: ${err}`);
    } finally {
      setApmPaymentLoading(false);
    }
  };

  // Auto-poll webhooks when tab is active
  useEffect(() => {
    if (activeTab === 'webhooks' && webhookPolling) {
      fetchWebhooks();
      const interval = setInterval(fetchWebhooks, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, webhookPolling, fetchWebhooks]);

  // Load saved credentials
  useEffect(() => {
    const saved = localStorage.getItem('nuvei_lab_env');
    if (saved) {
      try {
        setEnv(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // *** SYNC CARD DETAILS WHEN CARD SELECTION CHANGES ***
  // This updates card number, holder, expiry, CVV, and AMOUNT when a new test card is selected
  useEffect(() => {
    const card = TEST_CARDS.find(c => c.id === selectedCardId);
    if (card) {
      setCardNumber(card.number);
      setCardHolder(card.holder);
      setExpMonth(card.expMonth);
      setExpYear(card.expYear);
      setCvv(card.cvv);
      // Update amount based on card's scenario type
      if (card.amount) {
        setAmount(card.amount);
      }
    }
  }, [selectedCardId]);

  // Ensure each feature has a valid selected option
  useEffect(() => {
    const options = FEATURE_OPTION_VALUES[featureTest] || [];
    setFeatureOptionsByTest((prev) => {
      const current = prev[featureTest];
      if (current && options.some((opt) => opt.value === current)) {
        return prev;
      }
      return { ...prev, [featureTest]: options[0]?.value || '' };
    });
  }, [featureTest]);

  // Update card details when selection changes
  useEffect(() => {
    const card = TEST_CARDS.find(c => c.id === selectedCardId);
    if (card) {
      setCardNumber(card.number);
      setCardHolder(card.holder);
      setExpMonth(card.expMonth);
      setExpYear(card.expYear);
      setCvv(card.cvv);
      // Auto-populate amount from card's pre-defined amount
      if (card.amount) {
        setAmount(card.amount);
      }
    }
  }, [selectedCardId]);

  // Set notification URL
  useEffect(() => {
    setNotificationUrl(`${window.location.origin}/api/3ds-notify`);
  }, []);

  // Liability shift after 3DS challenge - uses ref to avoid stale closure
  const runLiabilityShift = useCallback(async () => {
    // Use ref to get current value (avoids stale closure issue)
    const pending = pendingLiabilityShiftRef.current;
    if (!pending) {
      console.error('No pending liability shift data');
      return;
    }
    
    console.log('Running liability shift with:', pending);
    
    try {
      const response = await fetch('/api/payment/liability-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          env,
          sessionToken: pending.sessionToken,
          relatedTransactionId: pending.initPaymentTransactionId,
          card: pending.card,
          amount: pending.amount,
          currency: pending.currency,
        }),
      });
      const result = await response.json();
      
      console.log('Liability shift result:', result);
      
      // Add liability shift step
      setFlowSteps(prev => {
        if (prev.some(s => s.stepId === 'liability-shift')) return prev;
        return [...prev, {
          stepId: 'liability-shift',
          stepName: 'payment.do (Final Payment)',
          status: result.success ? 'success' : 'error',
          request: { url: '/ppp/api/v1/payment.do', method: 'POST', body: { transactionType: 'Auth' }, timestamp: new Date().toISOString() },
          response: { status: 200, body: result.response || result, duration: 0 },
        }];
      });
      setSelectedStep('liability-shift');
      
      // Auto-fill operations with final values
      if (result.transactionId) {
        setOpTransactionId(String(result.transactionId));
      }
      if (result.authCode) {
        setOpAuthCode(String(result.authCode));
      }
      
      // Clear pending
      setPendingLiabilityShift(null);
      pendingLiabilityShiftRef.current = null;
      
      return result;
    } catch (err) {
      console.error('Liability shift failed:', err);
      setFlowSteps(prev => [...prev, {
        stepId: 'liability-shift',
        stepName: 'payment.do (Final Payment)',
        status: 'error',
        request: { url: '/ppp/api/v1/payment.do', method: 'POST', body: {}, timestamp: new Date().toISOString() },
        response: { status: 500, body: { error: String(err) }, duration: 0 },
      }]);
    }
  }, [env]);

  // Listen for 3DS popup completion message and APM return
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === '3ds-complete') {
        // 3DS challenge completed - refresh webhooks
        fetchWebhooks();
        
        const threeDSResult = event.data.threeDSResult;
        const authSuccess = event.data.success;
        
        // Add challenge completion step with full result
        setFlowSteps(prev => {
          if (prev.some(s => s.stepId === '3ds-complete')) return prev;
          return [...prev, {
            stepId: '3ds-complete',
            stepName: authSuccess ? '3DS Challenge Successful' : '3DS Challenge Failed',
            status: authSuccess ? 'success' : 'error',
            request: { url: 'ACS Challenge', method: 'POST', body: { message: 'User completed 3DS challenge' }, timestamp: new Date().toISOString() },
            response: { 
              status: authSuccess ? 200 : 401, 
              body: { 
                message: authSuccess ? 'Challenge completed - performing final payment' : 'Challenge failed - authentication declined',
                threeDSResult,
                transStatus: threeDSResult?.transStatus,
                authenticationValue: threeDSResult?.authenticationValue,
                eci: threeDSResult?.eci
              }, 
              duration: 0 
            },
          }];
        });
        setSelectedStep('3ds-complete');
        setActiveResultTab('steps');
        
        // Only call liability shift if auth was successful
        if (authSuccess && pendingLiabilityShiftRef.current) {
          setTimeout(() => runLiabilityShift(), 500);
        } else if (!authSuccess) {
          // Show error notification
          setError(`3DS Authentication Failed: ${threeDSResult?.transStatus || 'Unknown'} - ${threeDSResult?.errorMessage || 'User could not be authenticated'}`);
          setIsRunning(false);
        }
      }
      
      // Handle APM return
      if (event.data?.type === 'apm-return') {
        fetchWebhooks();
        const apmResult = event.data;
        
        setApmPaymentResult({
          success: apmResult.success,
          pending: apmResult.pending,
          status: apmResult.status,
          paymentMethod: apmResult.paymentMethod,
          result: apmResult.result
        });
        
        if (apmResult.success) {
          console.log('APM Payment successful:', apmResult);
        } else if (apmResult.pending) {
          console.log('APM Payment pending:', apmResult);
        } else {
          console.log('APM Payment failed:', apmResult);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchWebhooks, runLiabilityShift]);

  const useDefaults = () => {
    setEnv(DEFAULT_CREDENTIALS);
    localStorage.setItem('nuvei_lab_env', JSON.stringify(DEFAULT_CREDENTIALS));
    setIsApiReady(null);
  };

  const saveCredentials = () => {
    localStorage.setItem('nuvei_lab_env', JSON.stringify(env));
  };

  const testConnection = async () => {
    if (!env.merchantId || !env.merchantSiteId || !env.merchantKey) {
      setIsApiReady(false);
      return;
    }
    
    try {
      const response = await fetch('/api/env/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      });
      const result = await response.json();
      setIsApiReady(result.success);
      saveCredentials();
    } catch {
      setIsApiReady(false);
    }
  };

  const run3DSFlow = async () => {
    setIsRunning(true);
    setError(null);
    setRequestData(null);
    setResponseData(null);
    setChallengeUrl(null);
    setFlowSteps([]);
    setSelectedStep(null);
    setFingerprintUrl(null);
    setFingerprintPayload(null);
    setActiveResultTab('steps');

    const card = {
      number: cardNumber,
      holderName: cardHolder,
      expMonth: expMonth,
      expYear: expYear,
      cvv: cvv,
    };

    const requestPayload = {
      env,
      card,
      amount,
      currency,
      notificationUrl,
      featureTest,
      featureOption: selectedFeatureOption,
    };

    setRequestData(requestPayload);

    try {
      const response = await fetch('/api/payment/3ds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const rawBody = await response.text();
      let result: Record<string, unknown>;
      try {
        result = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        result = {
          error: 'Non-JSON response from /api/payment/3ds',
          httpStatus: response.status,
          rawBody,
        };
      }
      setResponseData(result);
      
      // Update flow steps
      if (result.steps) {
        setFlowSteps(result.steps);
        setSelectedStep(result.steps[result.steps.length - 1]?.stepId || null);
      }
      
      // Handle 3DS fingerprinting if methodUrl is present
      if (result.context?.methodUrl && result.context?.methodPayload) {
        setFingerprintUrl(result.context.methodUrl as string);
        setFingerprintPayload(result.context.methodPayload as string);
      }

      if (result.error) {
        setError(result.error);
        setActiveResultTab('steps');
      } else if (result.status === 'challenge_required' && result.challengeUrl) {
        // Build full URL for the challenge
        const fullChallengeUrl = result.challengeUrl.startsWith('/') 
          ? `${window.location.origin}${result.challengeUrl}` 
          : result.challengeUrl;
        setChallengeUrl(fullChallengeUrl);
        setActiveResultTab('challenge');
        
        // Store context for liability shift after challenge completes
        // Backend uses initTransactionId (from initPayment response)
        if (result.context?.sessionToken && result.context?.initTransactionId) {
          setPendingLiabilityShift({
            sessionToken: String(result.context.sessionToken),
            initPaymentTransactionId: String(result.context.initTransactionId),
            card: {
              number: cardNumber,
              holderName: cardHolder,
              expMonth,
              expYear,
              cvv,
            },
            amount,
            currency,
          });
        }
        
        // Automatically open 3DS challenge popup
        setTimeout(() => {
          const width = 500;
          const height = 700;
          const left = window.screenX + (window.outerWidth - width) / 2;
          const top = window.screenY + (window.outerHeight - height) / 2;
          window.open(fullChallengeUrl, '3DS_Challenge', `width=${width},height=${height},left=${left},top=${top}`);
        }, 500);
      }

      // Auto-fill operations
      if (result.context?.paymentTransactionId) {
        setOpTransactionId(String(result.context.paymentTransactionId));
      }
      if (result.context?.authCode) {
        setOpAuthCode(String(result.context.authCode));
      }
      if (result.context?.sessionToken) {
        setSessionToken(String(result.context.sessionToken));
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }

    setIsRunning(false);
  };

  const openChallenge = () => {
    if (!challengeUrl) return;
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(challengeUrl, '3DS_Challenge', `width=${width},height=${height},left=${left},top=${top}`);
  };

  // Operations
  const runSettle = async () => {
    setSettleLog('// Running settle...');
    try {
      const response = await fetch('/api/operations/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, relatedTransactionId: opTransactionId, authCode: opAuthCode, amount: opAmount, currency: opCurrency }),
      });
      const result = await response.json();
      setSettleLog(JSON.stringify(result, null, 2));
    } catch (err) {
      setSettleLog(`// Error: ${err}`);
    }
  };

  const runRefund = async () => {
    setRefundLog('// Running refund...');
    try {
      const response = await fetch('/api/operations/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, relatedTransactionId: opTransactionId, authCode: opAuthCode, amount: opAmount, currency: opCurrency }),
      });
      const result = await response.json();
      setRefundLog(JSON.stringify(result, null, 2));
    } catch (err) {
      setRefundLog(`// Error: ${err}`);
    }
  };

  const runVoid = async () => {
    setVoidLog('// Running void...');
    try {
      const response = await fetch('/api/operations/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, relatedTransactionId: opTransactionId, authCode: opAuthCode, amount: opAmount, currency: opCurrency }),
      });
      const result = await response.json();
      setVoidLog(JSON.stringify(result, null, 2));
    } catch (err) {
      setVoidLog(`// Error: ${err}`);
    }
  };

  const getPaymentStatus = async () => {
    setPaymentStatusLog('// Getting payment status...');
    try {
      const response = await fetch('/api/payment/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, sessionToken }),
      });
      const result = await response.json();
      setPaymentStatusLog(JSON.stringify(result, null, 2));
    } catch (err) {
      setPaymentStatusLog(`// Error: ${err}`);
    }
  };

  const getTransactionDetails = async () => {
    setTxDetailsLog('// Getting transaction details...');
    try {
      const response = await fetch('/api/transaction/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, transactionId: opTransactionId }),
      });
      const result = await response.json();
      setTxDetailsLog(JSON.stringify(result, null, 2));
    } catch (err) {
      setTxDetailsLog(`// Error: ${err}`);
    }
  };

  // MCP Rates
  const getMcpRates = async () => {
    setMcpLoading(true);
    setMcpLog('// Fetching MCP rates...');
    try {
      const response = await fetch('/api/mcp/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, fromCurrency: mcpFromCurrency }),
      });
      const result = await response.json();
      if (result.mcpRates) {
        setMcpRates(result.mcpRates);
      }
      setMcpLog(JSON.stringify(result, null, 2));
    } catch (err) {
      setMcpLog(`// Error: ${err}`);
    } finally {
      setMcpLoading(false);
    }
  };

  // Payouts
  const executePayout = async () => {
    setPayoutLog('// Executing payout...');
    try {
      const response = await fetch('/api/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          env,
          userTokenId: payoutUserTokenId,
          amount: payoutAmount,
          currency: payoutCurrency,
          userPaymentOptionId: payoutUpoId,
        }),
      });
      const result = await response.json();
      setPayoutLog(JSON.stringify(result, null, 2));
    } catch (err) {
      setPayoutLog(`// Error: ${err}`);
    }
  };

  // APMs
  const getApms = async () => {
    // Validate credentials first
    if (!env.merchantId || !env.merchantSiteId || !env.merchantKey) {
      setApmError('Please configure Merchant ID, Site ID, and Merchant Key in the sidebar first');
      return;
    }
    
    setApmLoading(true);
    setApmList([]);
    setApmError(null);
    try {
      const response = await fetch('/api/apms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, countryCode: apmCountry, currencyCode: apmCurrency }),
      });
      const result = await response.json();
      console.log('APMs response:', result);
      if (result.error) {
        // Ensure error is a string
        const errorMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        setApmError(errorMsg);
      } else if (result.status === 'ERROR') {
        const reason = typeof result.reason === 'string' ? result.reason : JSON.stringify(result.reason);
        setApmError(reason || 'Failed to fetch APMs');
      } else if (result.paymentMethods && Array.isArray(result.paymentMethods)) {
        // Keep original paymentMethodDisplayName structure - handle in render
        const normalizedMethods = result.paymentMethods.map((apm: Record<string, unknown>) => ({
          ...apm,
          paymentMethod: String(apm.paymentMethod || ''),
          // Keep original structure, will parse in render
          paymentMethodDisplayName: apm.paymentMethodDisplayName,
          logoURL: typeof apm.logoURL === 'string' ? apm.logoURL : '',
        }));
        setApmList(normalizedMethods);
        console.log('Normalized APM list:', normalizedMethods);
        if (normalizedMethods.length === 0) {
          setApmError('No payment methods available for this country/currency combination');
        }
      } else {
        setApmError(`No payment methods returned. Response: ${JSON.stringify(result).slice(0, 200)}`);
      }
    } catch (err) {
      console.error('Error fetching APMs:', err);
      setApmError(err instanceof Error ? err.message : 'Failed to fetch APMs');
    } finally {
      setApmLoading(false);
    }
  };

  // Group cards by category
  const groupedCards = TEST_CARDS.reduce((acc, card) => {
    if (!acc[card.category]) acc[card.category] = [];
    acc[card.category].push(card);
    return acc;
  }, {} as Record<string, TestCard[]>);

  const currentFeatureOptions = FEATURE_OPTION_VALUES[featureTest] || [];
  const selectedFeatureOption = featureOptionsByTest[featureTest] ?? currentFeatureOptions[0]?.value ?? '';

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'payment', label: 'Payment', icon: '💳' },
    { id: 'operations', label: 'Operations', icon: '🔄' },
    { id: 'webhooks', label: 'Webhooks', icon: '📡' },
    { id: 'lookup', label: 'Lookup', icon: '🔍' },
    { id: 'cardinfo', label: 'Card Info', icon: '💡' },
    { id: 'upo', label: 'UPO', icon: '👤' },
    { id: 'payouts', label: 'Payouts', icon: '💸' },
    { id: 'apms', label: 'APMs', icon: '🏦' },
  ];

  // JSON syntax highlighting
  const formatJSON = (obj: Record<string, unknown> | null) => {
    if (!obj) return '';
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">
            <span className="logo-accent">NUVEI</span> REST API 1.0 Testing
          </h1>
        </div>

        {/* Merchant Config */}
        <div className="sidebar-section">
          <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🔧 MERCHANT CONFIG</span>
          </div>
          
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Enter your Nuvei sandbox credentials from the merchant portal.
          </p>

          <div className="form-group">
            <label>Merchant ID</label>
            <input
              type="text"
              value={env.merchantId}
              onChange={(e) => setEnv({ ...env, merchantId: e.target.value })}
              placeholder="Your Merchant ID"
            />
          </div>

          <div className="form-group">
            <label>Merchant Site ID</label>
            <input
              type="text"
              value={env.merchantSiteId}
              onChange={(e) => setEnv({ ...env, merchantSiteId: e.target.value })}
              placeholder="Your Site ID"
            />
          </div>

          <div className="form-group">
            <label>Secret Key</label>
            <input
              type="password"
              value={env.merchantKey}
              onChange={(e) => setEnv({ ...env, merchantKey: e.target.value })}
              placeholder="Your Secret Key"
            />
          </div>

          <button className="btn btn-secondary btn-block btn-sm" onClick={testConnection}>
            Test Connection
          </button>

          <div className={`api-status ${isApiReady === true ? 'ready' : isApiReady === false ? 'error' : ''}`}>
            <span className="status-dot"></span>
            {isApiReady === null ? 'Not tested' : isApiReady ? 'API Ready' : 'Connection Failed - Check credentials'}
          </div>
        </div>

        {/* Test Scenario */}
        <div className="sidebar-section">
          <div className="section-header">📋 TEST SCENARIO</div>

          <div className="form-group">
            <label>3DS Flow</label>
            <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
              {Object.entries(groupedCards).map(([category, cards]) => (
                <optgroup key={category} label={category}>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>{card.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '6px' }}>
            3DS outcome is controlled in the ACS challenge popup.
          </p>
        </div>

        {/* Feature Test */}
        <div className="sidebar-section">
          <div className="section-header">🧪 FEATURE TEST</div>

          <div className="form-row">
            <div className="form-group">
              <label>Feature</label>
              <select value={featureTest} onChange={(e) => setFeatureTest(e.target.value)}>
                {FEATURE_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>{f.id}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Option</label>
              <select
                key={featureTest}
                value={selectedFeatureOption}
                onChange={(e) =>
                  setFeatureOptionsByTest((prev) => ({ ...prev, [featureTest]: e.target.value }))
                }
              >
                {currentFeatureOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="feature-box">
            <div className="feature-title">📌 {featureTest}</div>
            <div className="feature-description">
              {FEATURE_OPTIONS.find(f => f.id === featureTest)?.description}
            </div>
            <div className="feature-options">
              Options:
              {currentFeatureOptions.length === 0 ? (
                <div style={{ marginTop: '6px' }}>No options available.</div>
              ) : (
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  {currentFeatureOptions.map((opt) => (
                    <li key={opt.value}>
                      {opt.value} - {opt.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Card Details */}
        <div className="sidebar-section">
          <div className="section-header">💳 CARD DETAILS</div>

          <div className="form-group">
            <label>Card Number</label>
            <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Card Holder</label>
            <input type="text" value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Month</label>
              <input type="text" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Year</label>
              <input type="text" value={expYear} onChange={(e) => setExpYear(e.target.value)} />
            </div>
            <div className="form-group">
              <label>CVV</label>
              <input type="text" value={cvv} onChange={(e) => setCvv(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="sidebar-section">
          <div className="section-header">💰 PAYMENT</div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount</label>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="ILS">ILS</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Notification URL</label>
            <input type="text" value={notificationUrl} onChange={(e) => setNotificationUrl(e.target.value)} />
          </div>

          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={run3DSFlow}
            disabled={isRunning || !env.merchantId}
            style={{ marginTop: '12px' }}
          >
            {isRunning ? <><span className="spinner"></span> Running...</> : '▶️ Run Full 3DS Flow'}
          </button>

          {error && <div className="error-message">{error}</div>}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Top Tabs */}
        <nav className="top-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`top-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        {/* Content Area */}
        <div className="content-area">
          {activeTab === 'payment' && (
            <div className="right-panel">
              <div className="results-header">
                <h2 className="results-title">📊 Results</h2>
                <div className="result-tabs">
                  <button
                    className={`result-tab ${activeResultTab === 'steps' ? 'active' : ''}`}
                    onClick={() => setActiveResultTab('steps')}
                  >
                    📋 Steps ({flowSteps.length})
                  </button>
                  <button
                    className={`result-tab ${activeResultTab === 'request' ? 'active' : ''}`}
                    onClick={() => setActiveResultTab('request')}
                  >
                    📤 Request
                  </button>
                  <button
                    className={`result-tab ${activeResultTab === 'response' ? 'active' : ''}`}
                    onClick={() => setActiveResultTab('response')}
                  >
                    📥 Response
                  </button>
                  {challengeUrl && (
                    <button
                      className={`result-tab ${activeResultTab === 'challenge' ? 'active' : ''}`}
                      onClick={() => setActiveResultTab('challenge')}
                    >
                      🔐 3DS Challenge
                    </button>
                  )}
                </div>
              </div>

              <div className="results-content">
                {activeResultTab === 'steps' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', height: '100%' }}>
                    {/* Steps List */}
                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', overflowY: 'auto' }}>
                      <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase' }}>API Flow Steps</h4>
                      {flowSteps.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚀</div>
                          <p style={{ fontSize: '13px' }}>Click "Run Full 3DS Flow" to see the API steps</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {flowSteps.map((step, index) => (
                            <div
                              key={step.stepId}
                              onClick={() => setSelectedStep(step.stepId)}
                              style={{
                                padding: '12px',
                                background: selectedStep === step.stepId ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                borderLeft: `3px solid ${step.status === 'success' ? '#22c55e' : step.status === 'redirect' ? '#f59e0b' : '#ef4444'}`,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                                  {index + 1}
                                </span>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{step.stepName}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {step.response.duration}ms • {step.status === 'success' ? '✓ Success' : step.status === 'redirect' ? '↪ Redirect' : '✗ Error'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Step Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                      {selectedStep && flowSteps.find(s => s.stepId === selectedStep) ? (
                        <>
                          {/* Request */}
                          <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
                            <h4 style={{ marginBottom: '8px', color: '#22c55e', fontSize: '12px' }}>
                              📤 REQUEST: {flowSteps.find(s => s.stepId === selectedStep)?.request.url.split('/').pop()}
                            </h4>
                            <pre className="json-viewer" style={{ margin: 0, flex: 1, overflow: 'auto' }}>
                              {JSON.stringify(flowSteps.find(s => s.stepId === selectedStep)?.request.body, null, 2)}
                            </pre>
                          </div>
                          {/* Response */}
                          <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
                            <h4 style={{ marginBottom: '8px', color: '#3b82f6', fontSize: '12px' }}>
                              📥 RESPONSE ({flowSteps.find(s => s.stepId === selectedStep)?.response.status})
                            </h4>
                            <pre className="json-viewer" style={{ margin: 0, flex: 1, overflow: 'auto' }}>
                              {JSON.stringify(flowSteps.find(s => s.stepId === selectedStep)?.response.body, null, 2)}
                            </pre>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                          <p>Select a step to view details</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeResultTab === 'request' && (
                  <div className="json-viewer">
                    {requestData ? formatJSON(requestData) : '// Select a scenario and click "Run Full 3DS Flow"'}
                  </div>
                )}

                {activeResultTab === 'response' && (
                  <div className="json-viewer">
                    {responseData ? formatJSON(responseData) : '// Response will appear here'}
                  </div>
                )}

                {activeResultTab === 'challenge' && challengeUrl && (
                  <div className="challenge-panel">
                    <div className="challenge-icon">🔐</div>
                    <h3 className="challenge-title">3DS Challenge in Progress</h3>
                    <p className="challenge-description">
                      The 3DS challenge popup has been opened. Complete the authentication in the popup window.
                    </p>
                    <p className="challenge-description" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      If the popup was blocked, click below to open it manually.
                    </p>
                    <button className="btn btn-primary btn-lg" onClick={openChallenge}>
                      🚀 Re-open Challenge
                    </button>
                  </div>
                )}
              </div>
              
              {/* Hidden 3DS Fingerprint iframe */}
              {fingerprintUrl && fingerprintPayload && (
                <iframe
                  src={`${fingerprintUrl}?threeDSMethodData=${encodeURIComponent(fingerprintPayload)}`}
                  style={{ width: 0, height: 0, border: 'none', position: 'absolute' }}
                  title="3DS Fingerprint"
                />
              )}
            </div>
          )}

          {activeTab === 'operations' && (
            <div className="right-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              <h2 style={{ marginBottom: '8px' }}>Settle, refund, void, and query</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px' }}>
                All calls hit Nuvei REST endpoints with checksums applied.
              </p>

              <div className="operations-grid">
                {/* Settle */}
                <div className="op-card">
                  <h3>💰 Settle</h3>
                  <div className="form-group">
                    <label>Transaction ID</label>
                    <input value={opTransactionId} onChange={(e) => setOpTransactionId(e.target.value)} placeholder="transaction id" />
                  </div>
                  <div className="form-group">
                    <label>Auth Code</label>
                    <input value={opAuthCode} onChange={(e) => setOpAuthCode(e.target.value)} placeholder="auth code" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount</label>
                      <input value={opAmount} onChange={(e) => setOpAmount(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Currency</label>
                      <select value={opCurrency} onChange={(e) => setOpCurrency(e.target.value)}>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={runSettle}>Settle</button>
                  <div className="op-log">{settleLog}</div>
                </div>

                {/* Refund */}
                <div className="op-card">
                  <h3>↩️ Refund</h3>
                  <div className="form-group">
                    <label>Transaction ID</label>
                    <input value={opTransactionId} onChange={(e) => setOpTransactionId(e.target.value)} placeholder="transaction id" />
                  </div>
                  <div className="form-group">
                    <label>Auth Code</label>
                    <input value={opAuthCode} onChange={(e) => setOpAuthCode(e.target.value)} placeholder="auth code" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount</label>
                      <input value={opAmount} onChange={(e) => setOpAmount(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Currency</label>
                      <select value={opCurrency} onChange={(e) => setOpCurrency(e.target.value)}>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-warning btn-sm" onClick={runRefund}>Refund</button>
                  <div className="op-log">{refundLog}</div>
                </div>

                {/* Void */}
                <div className="op-card">
                  <h3>🚫 Void</h3>
                  <div className="form-group">
                    <label>Transaction ID</label>
                    <input value={opTransactionId} onChange={(e) => setOpTransactionId(e.target.value)} placeholder="transaction id" />
                  </div>
                  <div className="form-group">
                    <label>Auth Code</label>
                    <input value={opAuthCode} onChange={(e) => setOpAuthCode(e.target.value)} placeholder="auth code" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount</label>
                      <input value={opAmount} onChange={(e) => setOpAmount(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Currency</label>
                      <select value={opCurrency} onChange={(e) => setOpCurrency(e.target.value)}>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={runVoid}>Void</button>
                  <div className="op-log">{voidLog}</div>
                </div>

                {/* Payment Status */}
                <div className="op-card">
                  <h3>🔍 Payment Status</h3>
                  <div className="form-group">
                    <label>Session Token</label>
                    <input value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} placeholder="session token" />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={getPaymentStatus}>Payment status</button>
                  <div className="op-log">{paymentStatusLog}</div>
                </div>

                {/* Transaction Details */}
                <div className="op-card">
                  <h3>📋 Transaction Details</h3>
                  <div className="form-group">
                    <label>Transaction ID</label>
                    <input value={opTransactionId} onChange={(e) => setOpTransactionId(e.target.value)} placeholder="transaction id" />
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={getTransactionDetails}>Transaction details</button>
                  <div className="op-log">{txDetailsLog}</div>
                </div>

                {/* Card Lookup */}
                <div className="op-card">
                  <h3>💳 Card Lookup</h3>
                  <div className="form-group">
                    <label>Card Number</label>
                    <input value={cardLookupNumber} onChange={(e) => setCardLookupNumber(e.target.value)} placeholder="BIN lookup" />
                  </div>
                  <button className="btn btn-secondary btn-sm">Card details</button>
                  <div className="op-log">{cardLookupLog}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'lookup' && (
            <div className="right-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              <h2 style={{ marginBottom: '8px' }}>🔍 Transaction Lookup</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px' }}>
                Look up transaction details and payment status.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Payment Status */}
                <div className="op-card">
                  <h3>📋 Payment Status</h3>
                  <div className="form-group">
                    <label>Session Token</label>
                    <input value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} placeholder="Enter session token" />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={getPaymentStatus}>Get Status</button>
                  <div className="op-log">{paymentStatusLog}</div>
                </div>

                {/* Transaction Details */}
                <div className="op-card">
                  <h3>📄 Transaction Details</h3>
                  <div className="form-group">
                    <label>Transaction ID</label>
                    <input value={opTransactionId} onChange={(e) => setOpTransactionId(e.target.value)} placeholder="Enter transaction ID" />
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={getTransactionDetails}>Get Details</button>
                  <div className="op-log">{txDetailsLog}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'webhooks' && (
            <div className="right-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ marginBottom: '4px' }}>📡 DMN / Webhooks</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Endpoint: <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>{window.location.origin}/api/webhook</code>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className={`btn ${webhookPolling ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => setWebhookPolling(!webhookPolling)}
                  >
                    {webhookPolling ? '⏸️ Stop Listening' : '▶️ Start Listening'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={fetchWebhooks}>
                    🔄 Refresh
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={clearWebhooks}>
                    🗑️ Clear
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: 'calc(100% - 80px)' }}>
                {/* Webhook List */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', overflow: 'auto' }}>
                  <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Received ({webhooks.length})</h4>
                  {webhooks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      {webhookPolling ? (
                        <>
                          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📡</div>
                          <p>Listening for webhooks...</p>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '24px', marginBottom: '8px' }}>💤</div>
                          <p>Click "Start Listening" to receive webhooks</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {webhooks.map((wh) => {
                        const dmnType = String(wh.payload._dmnType || 'DMN');
                        const operation = String(wh.payload._operation || '');
                        const source = String(wh.payload._source || '');
                        
                        // Determine icon based on DMN type
                        let icon = '📋';
                        if (dmnType === '3DS Error') icon = '⚠️';
                        else if (dmnType === '3DS Challenge Response') icon = '🔐';
                        else if (dmnType === 'Payment DMN' || dmnType.includes('Payment')) icon = '💳';
                        else if (dmnType === 'Settle Response') icon = '✅';
                        else if (dmnType === 'Void Response') icon = '🚫';
                        else if (dmnType === 'Refund Response') icon = '💸';
                        else if (dmnType === 'Payout Response') icon = '💰';
                        else if (dmnType === 'Transaction Details') icon = '🔍';
                        else if (dmnType === 'Payment Status') icon = '📊';
                        
                        return (
                          <div 
                            key={wh.id}
                            onClick={() => setSelectedWebhook(wh)}
                            style={{
                              padding: '10px',
                              background: selectedWebhook?.id === wh.id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                            }}
                          >
                            <div style={{ fontWeight: 500, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {icon} {dmnType}
                            </div>
                            {source && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {source} {operation && `• ${operation}`}
                              </div>
                            )}
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              {new Date(wh.timestamp).toLocaleTimeString()}
                            </div>
                            {wh.payload.errorMessage && (
                              <div style={{ fontSize: '10px', color: '#f87171', marginTop: '2px' }}>
                                ⚠️ {String(wh.payload.errorMessage)}
                              </div>
                            )}
                            {wh.payload.transactionStatus && (
                              <div style={{ 
                                fontSize: '10px', 
                                color: (() => {
                                  const status = String(wh.payload.transactionStatus);
                                  if (status === 'APPROVED') return '#4ade80';
                                  if (status === 'REDIRECT') return '#f59e0b';
                                  if (status === 'PENDING') return '#f59e0b';
                                  return '#f87171';
                                })(), 
                                marginTop: '2px' 
                              }}>
                                {String(wh.payload.transactionStatus)}
                              </div>
                            )}
                            {wh.payload.transStatus && !wh.payload.transactionStatus && (
                              <div style={{ fontSize: '10px', color: wh.payload.transStatus === 'Y' ? '#4ade80' : '#f87171', marginTop: '2px' }}>
                                3DS: {String(wh.payload.transStatus)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Webhook Details */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', overflow: 'auto' }}>
                  <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Details</h4>
                  {selectedWebhook ? (
                    <div style={{ height: 'calc(100% - 30px)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Show error message if cres decoded to error text */}
                      {Boolean(selectedWebhook.payload.errorMessage) && (
                        <div style={{ background: '#ef444422', padding: '12px', borderRadius: '6px', borderLeft: '3px solid #ef4444' }}>
                          <h5 style={{ marginBottom: '8px', color: '#ef4444' }}>⚠️ 3DS ACS Error</h5>
                          <p style={{ fontSize: '13px', color: '#fca5a5' }}>
                            {String(selectedWebhook.payload.errorMessage)}
                          </p>
                          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
                            This error came from Nuvei's 3DS ACS Emulator. Common causes: Invalid RReq (request format issue), timeout, or test card not supported for this flow.
                          </p>
                        </div>
                      )}
                      {/* Show decoded cres summary if present and NOT an error */}
                      {Boolean(selectedWebhook.payload.cres) && !selectedWebhook.payload.errorMessage && (
                        <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid var(--accent-primary)' }}>
                          <h5 style={{ marginBottom: '8px', color: 'var(--accent-primary)' }}>🔐 3DS Challenge Response (cres)</h5>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            This is the 3DS challenge completion response sent by the ACS (Access Control Server).
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Trans Status:</span>{' '}
                              <strong style={{ color: String(selectedWebhook.payload.transStatus) === 'Y' ? '#4ade80' : '#f87171' }}>
                                {String(selectedWebhook.payload.transStatus || 'N/A')} {String(selectedWebhook.payload.transStatus) === 'Y' ? '✓ Authenticated' : '✗ Failed'}
                              </strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Message Type:</span>{' '}
                              <span>{String(selectedWebhook.payload.messageType || 'CRes')}</span>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>ACS Trans ID:</span>{' '}
                              <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>{String(selectedWebhook.payload.acsTransID || 'N/A')}</span>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>3DS Server Trans ID:</span>{' '}
                              <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>{String(selectedWebhook.payload.threeDSServerTransID || 'N/A')}</span>
                            </div>
                          </div>
                          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '10px', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                            💡 <strong>Note:</strong> This cres webhook is the 3DS challenge completion signal. Full payment DMN with transaction details (transactionId, amount, status, etc.) is sent separately by Nuvei to your notificationUrl after payment processing completes.
                          </p>
                        </div>
                      )}
                      {/* Show payment DMN summary if present */}
                      {Boolean(selectedWebhook.payload.ppp_status || selectedWebhook.payload.Status || selectedWebhook.payload.transactionId) && !selectedWebhook.payload.cres && (
                        <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', borderLeft: '3px solid #4ade80' }}>
                          <h5 style={{ marginBottom: '8px', color: '#4ade80' }}>📋 Payment DMN</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Status:</span>{' '}
                              <strong>{String(selectedWebhook.payload.ppp_status || selectedWebhook.payload.Status || 'N/A')}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Amount:</span>{' '}
                              <strong>{String(selectedWebhook.payload.totalAmount || selectedWebhook.payload.amount || 'N/A')}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Transaction ID:</span>{' '}
                              <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>{String(selectedWebhook.payload.TransactionID || selectedWebhook.payload.transactionId || 'N/A')}</span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)' }}>Auth Code:</span>{' '}
                              <span style={{ fontFamily: 'monospace' }}>{String(selectedWebhook.payload.AuthCode || selectedWebhook.payload.authCode || 'N/A')}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <pre className="json-viewer" style={{ margin: 0, flex: 1 }}>
                        {JSON.stringify(selectedWebhook.payload, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>👈</div>
                      <p>Select a webhook to view details</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cardinfo' && (
            <div className="right-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              <h2 style={{ marginBottom: '8px' }}>💳 Test Card Database</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px' }}>
                Reference cards for testing different 3DS scenarios. Click a card to use it.
              </p>
              
              <div style={{ display: 'grid', gap: '24px' }}>
                {Object.entries(groupedCards).map(([category, cards]) => (
                  <div key={category}>
                    <h3 style={{ fontSize: '14px', color: 'var(--accent-primary)', marginBottom: '12px', textTransform: 'uppercase' }}>
                      {category}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                      {cards.map((card) => (
                        <div
                          key={card.id}
                          onClick={() => {
                            setSelectedCardId(card.id);
                            setActiveTab('payment');
                          }}
                          style={{
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            padding: '16px',
                            cursor: 'pointer',
                            border: selectedCardId === card.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px' }}>{card.name}</span>
                            <span style={{ 
                              fontSize: '11px', 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              background: card.category === 'Frictionless' ? '#22c55e33' : 
                                         card.category === 'Challenge' ? '#f59e0b33' : 
                                         card.category === 'Decline' ? '#ef444433' : '#3b82f633',
                              color: card.category === 'Frictionless' ? '#22c55e' : 
                                    card.category === 'Challenge' ? '#f59e0b' : 
                                    card.category === 'Decline' ? '#ef4444' : '#3b82f6',
                            }}>
                              {card.category}
                            </span>
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                            {card.number.replace(/(\d{4})/g, '$1 ').trim()}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {card.behavior}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                            Holder: {card.holder} • Exp: {card.expMonth}/{card.expYear} • CVV: {card.cvv}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPO (User Payment Options) Tab */}
          {activeTab === 'upo' && (
            <div className="right-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              <h2 style={{ marginBottom: '8px' }}>👤 User Payment Options (UPO)</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px' }}>
                Manage stored payment methods for users. Add credit cards, view existing UPOs, and delete them.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px' }}>
                {/* Left: UPO Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group">
                    <label>User Token ID *</label>
                    <input
                      value={upoUserTokenId}
                      onChange={(e) => setUpoUserTokenId(e.target.value)}
                      placeholder="Unique user identifier"
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Required for all UPO operations</span>
                  </div>

                  <button 
                    className="btn btn-secondary"
                    onClick={async () => {
                      if (!upoUserTokenId) {
                        setUpoError('User Token ID is required');
                        return;
                      }
                      setUpoLoading(true);
                      setUpoError(null);
                      try {
                        const response = await fetch('/api/upo/list', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ env, userTokenId: upoUserTokenId }),
                        });
                        const result = await response.json();
                        setUpoLog(JSON.stringify(result, null, 2));
                        if (result.success && result.paymentMethods) {
                          setUpoList(result.paymentMethods);
                        } else if (result.error) {
                          setUpoError(result.error);
                        } else if (result.reason) {
                          setUpoError(result.reason);
                        }
                      } catch (err) {
                        setUpoError(err instanceof Error ? err.message : 'Failed to fetch UPOs');
                      } finally {
                        setUpoLoading(false);
                      }
                    }}
                    disabled={upoLoading || !upoUserTokenId}
                    style={{ width: '100%' }}
                  >
                    {upoLoading ? '⏳ Loading...' : '🔍 Get User UPOs'}
                  </button>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

                  <h4 style={{ color: 'var(--accent-primary)', marginBottom: '8px' }}>➕ Add Credit Card UPO</h4>
                  
                  <div className="form-group">
                    <label>Quick Select Test Card</label>
                    <select
                      value={upoSelectedCard}
                      onChange={(e) => {
                        setUpoSelectedCard(e.target.value);
                        const card = TEST_CARDS.find(c => c.id === e.target.value);
                        if (card) {
                          setUpoCardNumber(card.number);
                          setUpoCardHolder(card.holder);
                          setUpoExpMonth(card.expMonth);
                          setUpoExpYear(card.expYear);
                        }
                      }}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    >
                      <option value="">-- Select a test card --</option>
                      {TEST_CARDS.map(card => (
                        <option key={card.id} value={card.id}>{card.name} - {card.number.slice(-4)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Card Number</label>
                    <input
                      value={upoCardNumber}
                      onChange={(e) => setUpoCardNumber(e.target.value)}
                      placeholder="4000027891380961"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Card Holder Name</label>
                    <input
                      value={upoCardHolder}
                      onChange={(e) => setUpoCardHolder(e.target.value)}
                      placeholder="John Smith"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label>Exp Month</label>
                      <input
                        value={upoExpMonth}
                        onChange={(e) => setUpoExpMonth(e.target.value)}
                        placeholder="12"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Exp Year</label>
                      <input
                        value={upoExpYear}
                        onChange={(e) => setUpoExpYear(e.target.value)}
                        placeholder="2030"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  <button 
                    className="btn btn-primary"
                    onClick={async () => {
                      if (!upoUserTokenId || !upoCardNumber) {
                        setUpoError('User Token ID and Card Number are required');
                        return;
                      }
                      setUpoLoading(true);
                      setUpoError(null);
                      try {
                        const response = await fetch('/api/upo/add', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            env, 
                            userTokenId: upoUserTokenId,
                            card: {
                              number: upoCardNumber,
                              holderName: upoCardHolder,
                              expMonth: upoExpMonth,
                              expYear: upoExpYear,
                              cvv: '217'
                            }
                          }),
                        });
                        const result = await response.json();
                        setUpoLog(JSON.stringify(result, null, 2));
                        if (result.success) {
                          setUpoError(null);
                          // Refresh the list
                          const listResponse = await fetch('/api/upo/list', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ env, userTokenId: upoUserTokenId }),
                          });
                          const listResult = await listResponse.json();
                          if (listResult.paymentMethods) {
                            setUpoList(listResult.paymentMethods);
                          }
                        } else {
                          setUpoError(result.error || result.reason || 'Failed to add UPO');
                        }
                      } catch (err) {
                        setUpoError(err instanceof Error ? err.message : 'Failed to add UPO');
                      } finally {
                        setUpoLoading(false);
                      }
                    }}
                    disabled={upoLoading || !upoUserTokenId || !upoCardNumber}
                    style={{ width: '100%' }}
                  >
                    {upoLoading ? '⏳ Adding...' : '💳 Add Credit Card UPO'}
                  </button>
                </div>

                {/* Right: UPO List and Log */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Error Display */}
                  {upoError && (
                    <div style={{ 
                      background: '#ef444422', 
                      border: '1px solid #ef4444', 
                      borderRadius: '8px', 
                      padding: '12px',
                      color: '#ef4444'
                    }}>
                      <strong>❌ Error:</strong> {upoError}
                    </div>
                  )}

                  {/* UPO List */}
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px' }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--accent-primary)' }}>📋 Stored Payment Methods ({upoList.length})</h4>
                    {upoList.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {upoList.map((upo, idx) => (
                          <div key={idx} style={{ 
                            background: 'var(--bg-secondary)', 
                            padding: '12px', 
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            border: '1px solid var(--border)'
                          }}>
                            <div>
                              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                {String(upo.upoName || upo.paymentMethodName || 'Unknown')}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                ID: {String(upo.userPaymentOptionId)}
                              </div>
                            </div>
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ background: '#ef444422', borderColor: '#ef4444', color: '#ef4444' }}
                              onClick={async () => {
                                if (!confirm('Delete this payment method?')) return;
                                setUpoLoading(true);
                                try {
                                  const response = await fetch('/api/upo/delete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ 
                                      env, 
                                      userTokenId: upoUserTokenId,
                                      userPaymentOptionId: String(upo.userPaymentOptionId)
                                    }),
                                  });
                                  const result = await response.json();
                                  setUpoLog(JSON.stringify(result, null, 2));
                                  if (result.success) {
                                    setUpoList(prev => prev.filter((_, i) => i !== idx));
                                  } else {
                                    setUpoError(result.error || result.reason || 'Failed to delete');
                                  }
                                } catch (err) {
                                  setUpoError(err instanceof Error ? err.message : 'Failed to delete');
                                } finally {
                                  setUpoLoading(false);
                                }
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                        No UPOs found. Enter a User Token ID and click "Get User UPOs" to load, or add a new card.
                      </p>
                    )}
                  </div>

                  {/* API Response Log */}
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px', flex: 1 }}>
                    <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>📜 API Response</h4>
                    <pre className="json-viewer" style={{ margin: 0, maxHeight: '300px', overflow: 'auto' }}>
                      {upoLog}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payouts Tab */}
          {activeTab === 'payouts' && (
            <div className="right-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              <h2 style={{ marginBottom: '8px' }}>💸 Payouts</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
                Send funds to users via stored payment methods (UPOs).
              </p>
              <div style={{ background: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: '8px', padding: '12px', marginBottom: '24px', fontSize: '12px' }}>
                <strong style={{ color: '#f59e0b' }}>⚠️ Note:</strong> Payouts require a UPO that was stored <em>before</em> the payment transaction.
                UPOs created during the payment flow may not work for payouts immediately. The "Auth Code/Trans ID mismatch" error
                typically means the UPO isn't eligible for payouts yet.
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px' }}>
                {/* Left: Payout Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group">
                    <label>User Token ID</label>
                    <input
                      value={payoutUserTokenId}
                      onChange={(e) => setPayoutUserTokenId(e.target.value)}
                      placeholder="User's unique token"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>User Payment Option ID (UPO)</label>
                    <input
                      value={payoutUpoId}
                      onChange={(e) => setPayoutUpoId(e.target.value)}
                      placeholder="Stored payment method ID"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '12px' }}>
                    <div className="form-group">
                      <label>Amount</label>
                      <input
                        type="number"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        placeholder="10.00"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Currency</label>
                      <select
                        value={payoutCurrency}
                        onChange={(e) => setPayoutCurrency(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={executePayout} style={{ width: '100%' }}>
                    💸 Execute Payout
                  </button>
                </div>

                {/* Right: Response */}
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>📋 Payout Response</h4>
                  <pre className="json-viewer" style={{ margin: 0, maxHeight: '500px', overflow: 'auto' }}>
                    {payoutLog}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* APMs Tab */}
          {activeTab === 'apms' && (
            <div className="right-panel" style={{ padding: '24px', overflowY: 'auto' }}>
              <h2 style={{ marginBottom: '8px' }}>🏦 Alternative Payment Methods</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '13px' }}>
                Discover available APMs by country and currency. Test redirects or run direct transactions.
              </p>
              
              <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Country</label>
                  <select
                    value={apmCountry}
                    onChange={(e) => setApmCountry(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: '150px' }}
                  >
                    <option value="DE">Germany (DE)</option>
                    <option value="NL">Netherlands (NL)</option>
                    <option value="GB">United Kingdom (GB)</option>
                    <option value="FR">France (FR)</option>
                    <option value="ES">Spain (ES)</option>
                    <option value="IT">Italy (IT)</option>
                    <option value="US">United States (US)</option>
                    <option value="AU">Australia (AU)</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Currency</label>
                  <select
                    value={apmCurrency}
                    onChange={(e) => setApmCurrency(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: '120px' }}
                  >
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="USD">USD</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
                  <label>Redirect Mode</label>
                  <select
                    value={apmRedirectMode}
                    onChange={(e) => setApmRedirectMode(e.target.value as 'auto' | 'manual')}
                    style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: '180px' }}
                  >
                    <option value="auto">Auto popup</option>
                    <option value="manual">Manual (copy/open link)</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, minWidth: '220px' }}>
                  <label>User Token ID (optional)</label>
                  <input
                    type="text"
                    value={apmUserTokenId}
                    onChange={(e) => setApmUserTokenId(e.target.value)}
                    placeholder="user_123 or email"
                    style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', minWidth: '220px' }}
                  />
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={getApms}
                  disabled={apmLoading}
                >
                  {apmLoading ? '⏳ Loading...' : '🔍 Discover APMs'}
                </button>
              </div>

              {/* APM Error Display */}
              {apmError && (
                <div style={{ 
                  background: '#ef444422', 
                  border: '1px solid #ef4444', 
                  borderRadius: '8px', 
                  padding: '16px', 
                  marginBottom: '24px',
                  color: '#ef4444'
                }}>
                  <strong>❌ Error:</strong> {apmError}
                </div>
              )}

              {/* APM Payment Result Display */}
              {apmPaymentResult && (
                <div style={{ 
                  background: (() => {
                    const txStatus = (apmPaymentResult.result as Record<string, unknown>)?.transactionStatus;
                    if (apmPaymentResult.redirectUrl || txStatus === 'REDIRECT') return '#3b82f622'; // Redirect opened
                    if (txStatus === 'APPROVED') return '#10b98122';
                    if (txStatus === 'PENDING') return '#f59e0b22';
                    return '#ef444422'; // DECLINED, ERROR, etc.
                  })(), 
                  border: `1px solid ${(() => {
                    const txStatus = (apmPaymentResult.result as Record<string, unknown>)?.transactionStatus;
                    if (apmPaymentResult.redirectUrl || txStatus === 'REDIRECT') return '#3b82f6';
                    if (txStatus === 'APPROVED') return '#10b981';
                    if (txStatus === 'PENDING') return '#f59e0b';
                    return '#ef4444';
                  })()}`, 
                  borderRadius: '8px', 
                  padding: '16px', 
                  marginBottom: '24px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <strong style={{ color: (() => {
                      const txStatus = (apmPaymentResult.result as Record<string, unknown>)?.transactionStatus;
                      if (apmPaymentResult.redirectUrl || txStatus === 'REDIRECT') return '#3b82f6';
                      if (txStatus === 'APPROVED') return '#10b981';
                      if (txStatus === 'PENDING') return '#f59e0b';
                      return '#ef4444';
                    })() }}>
                      {(() => {
                        const res = apmPaymentResult.result as Record<string, unknown>;
                        const txStatus = res?.transactionStatus;
                        const gwError = res?.gwErrorReason;
                        if (apmPaymentResult.redirectUrl || txStatus === 'REDIRECT') return '🔗 Redirect Opened - Complete payment in popup';
                        if (txStatus === 'APPROVED') return '✅ Transaction APPROVED';
                        if (txStatus === 'PENDING') return '⏳ Transaction PENDING';
                        if (txStatus === 'DECLINED') return `❌ Transaction DECLINED${gwError ? `: ${gwError}` : ''}`;
                        if (txStatus === 'ERROR') return `❌ Transaction ERROR${gwError ? `: ${gwError}` : ''}`;
                        return `❌ Payment Failed: ${res?.status || 'Unknown'} - ${gwError || res?.reason || 'No details'}`;
                      })()}
                    </strong>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => setApmPaymentResult(null)}
                    >
                      ✕ Clear
                    </button>
                  </div>
                  {apmPaymentResult.redirectUrl && (
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Redirect URL: </span>
                      <a 
                        href={apmPaymentResult.redirectUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6', fontSize: '12px', wordBreak: 'break-all' }}
                      >
                        {apmPaymentResult.redirectUrl.substring(0, 80)}...
                      </a>
                      {apmRedirectMode === 'manual' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginLeft: '8px' }}
                          onClick={() => window.open(apmPaymentResult.redirectUrl, '_blank', 'noopener,noreferrer')}
                        >
                          🔗 Open Redirect
                        </button>
                      )}
                    </div>
                  )}
                  {apmPaymentResult.result && (
                    <details open>
                      <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        View Full Response
                      </summary>
                      <pre style={{ 
                        fontSize: '11px', 
                        background: 'var(--bg-primary)', 
                        padding: '12px', 
                        borderRadius: '6px', 
                        marginTop: '8px',
                        maxHeight: '200px',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(apmPaymentResult.result, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* APM Grid */}
              {apmList.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                  {apmList.map((apm, idx) => (
                    <div key={idx} style={{
                      background: selectedApm === apm.paymentMethod ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
                      borderRadius: '12px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      border: selectedApm === apm.paymentMethod ? '2px solid var(--accent)' : '1px solid var(--border)',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedApm(apm.paymentMethod === selectedApm ? null : apm.paymentMethod)}
                    >
                      {apm.logoURL && (
                        <img 
                          src={apm.logoURL} 
                          alt={apm.paymentMethod} 
                          style={{ height: '40px', objectFit: 'contain' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <span style={{ fontWeight: 600, textAlign: 'center' }}>
                        {(() => {
                          const dn = apm.paymentMethodDisplayName;
                          if (!dn) return apm.paymentMethod || 'Unknown';
                          if (typeof dn === 'string') return dn;
                          if (Array.isArray(dn)) return dn[0]?.message || dn[0] || apm.paymentMethod;
                          if (typeof dn === 'object' && dn !== null) {
                            // Handle {en: 'Name', de: 'Name'} or [{message: 'Name'}]
                            const dnObj = dn as Record<string, unknown>;
                            return (dnObj.en || dnObj.message || dnObj.EN || Object.values(dnObj)[0]) as string || apm.paymentMethod;
                          }
                          return apm.paymentMethod || 'Unknown';
                        })()}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {String(apm.paymentMethod || 'unknown')}
                      </span>
                      
                      {/* Payment Button - Opens fields modal or directly processes */}
                      <button 
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: 'auto', width: '100%' }}
                        disabled={apmPaymentLoading}
                        onClick={(e) => {
                          e.stopPropagation();
                          
                          const rule = getApmRules(apm.paymentMethod);
                          if (rule.countries && rule.countries.length && !rule.countries.includes(apmCountry)) {
                            setApmError(`Country ${apmCountry} not supported for ${apm.paymentMethod}`);
                            return;
                          }
                          if (rule.currencies && rule.currencies.length && !rule.currencies.includes(apmCurrency)) {
                            setApmError(`Currency ${apmCurrency} not supported for ${apm.paymentMethod}`);
                            return;
                          }

                          const required = rule.required || [];
                          const needsModal = required.length > 0;
                          if (needsModal) {
                            setSelectedApmForPayment(apm);
                            setShowApmFieldsModal(true);
                            setApmFields(buildApmFields(apm.paymentMethod));
                          } else {
                            handleApmPayment(apm, {});
                          }
                        }}
                      >
                        {apmPaymentLoading && selectedApm === apm.paymentMethod ? '⏳ Processing...' : '💳 Test Payment'}
                      </button>
                      
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ width: '100%' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Show real Nuvei APM sandbox test credentials
                          const apmName = String(apm.paymentMethod).toLowerCase();
                          
                          // APM Test Credentials from Nuvei Docs
                          const apmTestCredentials: Record<string, { name: string; deposit: boolean; withdrawal: boolean; credentials: string }> = {
                            paypal: {
                              name: 'PayPal',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Username: SCTest1@gmail.com\nPassword: 1q2w3e$R\n\nAlternate:\nUsername: SCTest2@gmail.com\nPassword: 1q2w3e$R`
                            },
                            skrill: {
                              name: 'Skrill',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Email: partnersuccess-s2p@nuvei.com\nPassword: partnersuccess-s2p@Paysafe123\n\nAlternate:\nEmail: integration-international-customertest@nuvei.com\nPassword: integration-international-customertest@Paysafe123`
                            },
                            neteller: {
                              name: 'Neteller',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Email: integration-international@nuvei.com\nPassword: integration-international@Paysafe123`
                            },
                            ideal: {
                              name: 'iDEAL',
                              deposit: true,
                              withdrawal: true,
                              credentials: `For PPRO-PI provider:\n• Choose any bank\n• BIC: Testbank\n• Account Number: 123456\n• PIN: 1234\n• TAN: 1234\n\nFor S2P provider:\n• After redirect choose the final status`
                            },
                            sofort: {
                              name: 'Sofort',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Bank code: 88888888\nAccount number: 1234\nPIN: 1234\nTAN: 12345`
                            },
                            bancontact: {
                              name: 'Bancontact',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Cardholder name: any name (i.e John Doe)\nCard Number: 67030000000000003\nExpiry date: any valid date`
                            },
                            paysafecard: {
                              name: 'PaySafeCard',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Deposit PIN: 0000009021001201`
                            },
                            przelewy24: {
                              name: 'Przelewy24',
                              deposit: true,
                              withdrawal: true,
                              credentials: `After redirect:\n1. Choose "Przelew online i tradycyjne"\n2. Choose any bank\n3. Click "Zaplac"`
                            },
                            blik: {
                              name: 'BLIK',
                              deposit: true,
                              withdrawal: false,
                              credentials: `Any 6-digit code starting with 777 will SUCCEED\n(e.g., 777089, 777654)\n\nCodes NOT starting with 777 will FAIL\n(e.g., 142211, 332885)\n\nFor one-click test: use amount *.04 PLN`
                            },
                            sepa: {
                              name: 'SEPA Payout',
                              deposit: false,
                              withdrawal: true,
                              credentials: `IBAN: DE75380500000108605346`
                            },
                            interac: {
                              name: 'Interac E-Transfer',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Test values on redirect page:\n• User: 1234\n• Pass: 1234\n• Confirmation code: 12345`
                            },
                            pix: {
                              name: 'PIX',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Use any valid format CPF`
                            },
                            alipay: {
                              name: 'Alipay',
                              deposit: true,
                              withdrawal: false,
                              credentials: `Email: cnbuyer_3467@alitest.com\nLogin password: a111111\nPayment password: b111111`
                            },
                            multibanco: {
                              name: 'Multibanco',
                              deposit: true,
                              withdrawal: false,
                              credentials: `PIN: ABCD-EFG1-2345-6789\n(random PIN available on redirect page)`
                            },
                            oxxopay: {
                              name: 'OxxoPay',
                              deposit: true,
                              withdrawal: true,
                              credentials: `Phone number: any valid Mexican format\n(e.g., 52 169 682 5719)`
                            },
                            neosurf: {
                              name: 'Neosurf',
                              deposit: true,
                              withdrawal: false,
                              credentials: `No credentials required - emulator generates responses automatically`
                            },
                            webmoney: {
                              name: 'WebMoney',
                              deposit: true,
                              withdrawal: false,
                              credentials: `No credentials required - emulator generates responses automatically`
                            }
                          };
                          
                          // Find matching credential
                          let testInfo = null;
                          for (const [key, info] of Object.entries(apmTestCredentials)) {
                            if (apmName.includes(key) || apmName.includes(key.replace(/[^a-z]/g, ''))) {
                              testInfo = info;
                              break;
                            }
                          }
                          
                          if (testInfo) {
                            alert(
                              `🧪 ${testInfo.name} - Nuvei Sandbox Test Credentials\n\n` +
                              `Deposit: ${testInfo.deposit ? '✅ Supported' : '❌ Not Supported'}\n` +
                              `Withdrawal: ${testInfo.withdrawal ? '✅ Supported' : '❌ Not Supported'}\n\n` +
                              `📋 TEST CREDENTIALS:\n${testInfo.credentials}\n\n` +
                              `⚠️ These credentials ONLY work on Nuvei's integration/sandbox environment.`
                            );
                          } else {
                            alert(
                              `ℹ️ ${String(apm.paymentMethodDisplayName || apm.paymentMethod)}\n\n` +
                              `No specific test credentials found for this APM.\n\n` +
                              `For testing, check Nuvei documentation:\nhttps://docs.nuvei.com/documentation/integration/testing/testing-apms/`
                            );
                          }
                        }}
                      >
                        📋 Test Credentials
                      </button>
                    </div>
                  ))}
                </div>
              ) : !apmError && (
                <div style={{ 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: '12px', 
                  padding: '60px', 
                  textAlign: 'center',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏦</div>
                  <p>Select a country and currency, then click "Discover APMs" to see available payment methods.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* APM Fields Collection Modal */}
      {showApmFieldsModal && selectedApmForPayment && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => setShowApmFieldsModal(false)}
        >
          <div 
            style={{
              background: 'var(--card-bg)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => { const r = getApmRules(selectedApmForPayment.paymentMethod); return null; })()}
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-color)' }}>
              APM Payment Details
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              <strong>{selectedApmForPayment.paymentMethod}</strong> requires additional information
            </p>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '12px' }}>
              Test values are pre-filled where available. Adjust if needed.
            </p>

            {(() => {
              const rule = getApmRules(selectedApmForPayment.paymentMethod);
              const required = rule.required || [];
              return (
                <ul style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '12px', paddingLeft: '16px' }}>
                  {required.map(f => (
                    <li key={f}>{f}</li>
                  ))}
                  {rule.countries?.length ? <li>Supported countries: {rule.countries.join(', ')}</li> : null}
                  {rule.currencies?.length ? <li>Supported currencies: {rule.currencies.join(', ')}</li> : null}
                </ul>
              );
            })()}

            {/* ACH Fields */}
            {selectedApmForPayment.paymentMethod.includes('ACH') && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-color)', fontWeight: '500' }}>
                    Account Number *
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="1234567890 (max 17 chars)"
                    maxLength={17}
                    value={apmFields.AccountNumber}
                    onChange={(e) => setApmFields({ ...apmFields, AccountNumber: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-color)', fontWeight: '500' }}>
                    Routing Number *
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="123456789 (9 digits)"
                    maxLength={9}
                    pattern="[0-9]{9}"
                    value={apmFields.RoutingNumber}
                    onChange={(e) => setApmFields({ ...apmFields, RoutingNumber: e.target.value.replace(/\D/g, '') })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-color)', fontWeight: '500' }}>
                    SEC Code
                  </label>
                  <select
                    className="input-field"
                    value={apmFields.SECCode}
                    onChange={(e) => setApmFields({ ...apmFields, SECCode: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="WEB">WEB - Internet-initiated</option>
                    <option value="CCD">CCD - Corporate Credit or Debit</option>
                    <option value="TEL">TEL - Telephone-initiated</option>
                  </select>
                </div>
              </>
            )}

            {/* iDEAL BIC */}
            {selectedApmForPayment.paymentMethod.toLowerCase().includes('ideal') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-color)', fontWeight: '500' }}>
                  BIC *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Testbank"
                  value={apmFields.BIC}
                  onChange={(e) => setApmFields({ ...apmFields, BIC: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {/* Skrill / Neteller account_id */}
            {(selectedApmForPayment.paymentMethod.includes('MoneyBookers') || 
              selectedApmForPayment.paymentMethod.includes('Neteller')) && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-color)', fontWeight: '500' }}>
                  Account Email/ID *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="user@example.com"
                  value={apmFields.account_id}
                  onChange={(e) => setApmFields({ ...apmFields, account_id: e.target.value, nettelerAccount: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {/* Open Banking bankId */}
            {(selectedApmForPayment.paymentMethod.toLowerCase().includes('open_banking')) && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-color)', fontWeight: '500' }}>
                  Bank ID *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="bank id"
                  value={apmFields.bankId}
                  onChange={(e) => setApmFields({ ...apmFields, bankId: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowApmFieldsModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const rule = getApmRules(selectedApmForPayment.paymentMethod);
                  const required = rule.required || [];
                  for (const f of required) {
                    if (!apmFields[f as keyof typeof apmFields]) {
                      alert(`Please fill required field: ${f}`);
                      return;
                    }
                  }

                  if (selectedApmForPayment.paymentMethod.includes('ACH')) {
                    if (apmFields.RoutingNumber.length !== 9) {
                      alert('Routing Number must be exactly 9 digits');
                      return;
                    }
                  }

                  const fieldsToSend: Record<string, string> = {};
                  if (selectedApmForPayment.paymentMethod.includes('ACH')) {
                    fieldsToSend.AccountNumber = apmFields.AccountNumber;
                    fieldsToSend.RoutingNumber = apmFields.RoutingNumber;
                    fieldsToSend.SECCode = apmFields.SECCode;
                  }
                  if (selectedApmForPayment.paymentMethod.toLowerCase().includes('ideal')) {
                    fieldsToSend.BIC = apmFields.BIC;
                  }
                  if (selectedApmForPayment.paymentMethod.includes('MoneyBookers') || 
                      selectedApmForPayment.paymentMethod.includes('Neteller')) {
                    fieldsToSend.account_id = apmFields.account_id;
                    fieldsToSend.nettelerAccount = apmFields.nettelerAccount;
                  }
                  if (selectedApmForPayment.paymentMethod.toLowerCase().includes('open_banking')) {
                    fieldsToSend.bankId = apmFields.bankId;
                  }

                  handleApmPayment(selectedApmForPayment, fieldsToSend);
                }}
              >
                Process Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// Wrap in ErrorBoundary for crash protection
function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
