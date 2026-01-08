// Type definitions for the Nuvei API Emulator

export interface EnvConfig {
  merchantId: string;
  merchantSiteId: string;
  merchantKey: string;
  baseUrl: string;
  checksumAlgorithm: 'SHA256' | 'SHA1';
}

export interface ScenarioStep {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: 'POST' | 'GET';
  checksumFields: string[];
  requestTemplate: Record<string, unknown>;
  contextReads: string[];
  contextWrites: Record<string, string>; // response path -> context key
  is3DSChallenge?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  tags: string[];
  steps: ScenarioStep[];
}

export interface ScenarioConfig {
  version: string;
  defaultEnv: string;
  scenarios: Scenario[];
}

export interface RunContext {
  env: EnvConfig;
  sessionToken?: string;
  initPaymentTransactionId?: string;
  paymentTransactionId?: string;
  threeDVersion?: string;
  acsUrl?: string;
  cReq?: string;
  authCode?: string;
  userPaymentOptionId?: string;
  relatedTransactionId?: string;
  [key: string]: unknown;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  status: 'success' | 'error' | 'redirect';
  request: {
    url: string;
    method: string;
    body: Record<string, unknown>;
    timestamp: string;
  };
  response: {
    status: number;
    body: Record<string, unknown>;
    duration: number;
  };
  threeDSChallenge?: {
    acsUrl: string;
    cReq: string;
  };
}

export interface ScenarioRunResult {
  scenarioId: string;
  scenarioName: string;
  startTime: string;
  endTime: string;
  status: 'completed' | 'failed' | 'challenge_required';
  steps: StepResult[];
  context: Partial<RunContext>;
}

// API Request/Response types
export interface TestEnvRequest {
  env: EnvConfig;
}

export interface RunScenarioRequest {
  env: EnvConfig;
  scenarioId: string;
  context?: Partial<RunContext>;
}

export interface RunStepRequest {
  env: EnvConfig;
  scenarioId: string;
  stepId: string;
  context: Partial<RunContext>;
}
