// Scenario execution engine

import { calculateChecksum, generateTimestamp, generateClientRequestId } from './checksum';
import { scenarios } from './scenarios';
import type { 
  EnvConfig, 
  RunContext, 
  Scenario, 
  ScenarioStep, 
  StepResult, 
  ScenarioRunResult 
} from './types';

/**
 * Get all available scenarios
 */
export function getScenarios(): Scenario[] {
  return scenarios;
}

/**
 * Get a specific scenario by ID
 */
export function getScenarioById(id: string): Scenario | undefined {
  return scenarios.find(s => s.id === id);
}

/**
 * Resolve template placeholders in request body
 */
function resolveTemplate(
  template: Record<string, unknown>,
  context: RunContext
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(template)) {
    if (typeof value === 'string') {
      // Replace placeholders like {{env.merchantId}}, {{ctx.sessionToken}}, {{meta.timestamp}}
      resolved[key] = value.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_, namespace, field) => {
        if (namespace === 'env') {
          const envAny = context.env as unknown as Record<string, unknown>;
          return String(envAny[field] || '');
        } else if (namespace === 'ctx') {
          return String((context as Record<string, unknown>)[field] || '');
        } else if (namespace === 'meta') {
          if (field === 'timestamp') return generateTimestamp();
          if (field === 'clientRequestId') return generateClientRequestId();
        }
        return '';
      });
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveTemplate(value as Record<string, unknown>, context);
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * Extract value from response using dot notation path
 */
function extractFromResponse(response: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((obj: unknown, key) => {
    if (obj && typeof obj === 'object') {
      return (obj as Record<string, unknown>)[key];
    }
    return undefined;
  }, response);
}

/**
 * Execute a single step
 */
export async function executeStep(
  step: ScenarioStep,
  context: RunContext
): Promise<{ result: StepResult; updatedContext: RunContext }> {
  const startTime = Date.now();
  const timestamp = generateTimestamp();
  const clientRequestId = generateClientRequestId();
  
  // Build context with meta values
  const contextWithMeta: RunContext = {
    ...context,
    timestamp,
    clientRequestId,
  };
  
  // Resolve request template
  let requestBody = resolveTemplate(step.requestTemplate, contextWithMeta);
  
  // Add timestamp and clientRequestId to request if in template
  if ('timeStamp' in requestBody || step.requestTemplate.timeStamp) {
    requestBody.timeStamp = timestamp;
  }
  if ('clientRequestId' in requestBody || step.requestTemplate.clientRequestId) {
    requestBody.clientRequestId = clientRequestId;
  }
  
  // Calculate checksum if needed
  if (step.checksumFields.length > 0) {
    // Build checksum values array from the request body in the correct order
    const checksumValues = step.checksumFields.map(field => {
      if (field === 'merchantKey') {
        return context.env.merchantKey;
      }
      return String(requestBody[field] || '');
    });
    const checksum = await calculateChecksum(checksumValues, context.env.checksumAlgorithm || 'SHA256');
    requestBody.checksum = checksum;
  }
  
  // Build URL
  const url = `${context.env.baseUrl}${step.endpoint}`;
  
  // Make the API call
  let response: Response;
  let responseBody: Record<string, unknown>;
  
  try {
    response = await fetch(url, {
      method: step.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    responseBody = await response.json() as Record<string, unknown>;
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      result: {
        stepId: step.id,
        stepName: step.name,
        status: 'error',
        request: {
          url,
          method: step.method,
          body: maskSensitiveData(requestBody),
          timestamp: new Date().toISOString(),
        },
        response: {
          status: 0,
          body: { error: String(error) },
          duration,
        },
      },
      updatedContext: context,
    };
  }
  
  const duration = Date.now() - startTime;
  
  // Update context with response values
  const updatedContext = { ...context };
  for (const [responsePath, contextKey] of Object.entries(step.contextWrites)) {
    const value = extractFromResponse(responseBody, responsePath);
    if (value !== undefined) {
      (updatedContext as Record<string, unknown>)[contextKey] = value;
    }
  }
  
  // Check for 3DS challenge
  const acsUrl = extractFromResponse(responseBody, 'paymentOption.card.threeD.acsUrl');
  const cReq = extractFromResponse(responseBody, 'paymentOption.card.threeD.cReq');
  const transactionStatus = responseBody.transactionStatus;
  
  let status: 'success' | 'error' | 'redirect' = 'success';
  let threeDSChallenge: { acsUrl: string; cReq: string } | undefined;
  
  if (responseBody.status === 'ERROR' || responseBody.errCode) {
    status = 'error';
  } else if (transactionStatus === 'REDIRECT' && acsUrl && cReq) {
    status = 'redirect';
    threeDSChallenge = { acsUrl: String(acsUrl), cReq: String(cReq) };
    updatedContext.acsUrl = String(acsUrl);
    updatedContext.cReq = String(cReq);
  }
  
  return {
    result: {
      stepId: step.id,
      stepName: step.name,
      status,
      request: {
        url,
        method: step.method,
        body: maskSensitiveData(requestBody),
        timestamp: new Date().toISOString(),
      },
      response: {
        status: response.status,
        body: responseBody,
        duration,
      },
      threeDSChallenge,
    },
    updatedContext,
  };
}

/**
 * Execute all steps in a scenario
 */
export async function executeScenario(
  scenario: Scenario,
  env: EnvConfig,
  initialContext?: Partial<RunContext>
): Promise<ScenarioRunResult> {
  const startTime = new Date().toISOString();
  const steps: StepResult[] = [];
  
  let context: RunContext = {
    env,
    ...initialContext,
  };
  
  let finalStatus: 'completed' | 'failed' | 'challenge_required' = 'completed';
  
  for (const step of scenario.steps) {
    const { result, updatedContext } = await executeStep(step, context);
    steps.push(result);
    context = updatedContext;
    
    if (result.status === 'error') {
      finalStatus = 'failed';
      break;
    }
    
    if (result.status === 'redirect' && result.threeDSChallenge) {
      finalStatus = 'challenge_required';
      break;
    }
  }
  
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    startTime,
    endTime: new Date().toISOString(),
    status: finalStatus,
    steps,
    context: maskContextSensitiveData(context),
  };
}

/**
 * Mask sensitive data in request body for logging
 */
function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...data };
  
  // Mask checksum
  if (masked.checksum) {
    masked.checksum = '***masked***';
  }
  
  // Mask card data
  if (masked.paymentOption && typeof masked.paymentOption === 'object') {
    const paymentOption = { ...(masked.paymentOption as Record<string, unknown>) };
    if (paymentOption.card && typeof paymentOption.card === 'object') {
      const card = { ...(paymentOption.card as Record<string, unknown>) };
      if (card.cardNumber) {
        const num = String(card.cardNumber);
        card.cardNumber = `****${num.slice(-4)}`;
      }
      if (card.CVV) {
        card.CVV = '***';
      }
      paymentOption.card = card;
    }
    masked.paymentOption = paymentOption;
  }
  
  return masked;
}

/**
 * Mask sensitive data in context
 */
function maskContextSensitiveData(context: RunContext): Partial<RunContext> {
  const { env, ...rest } = context;
  return {
    ...rest,
    // Don't include merchant key in output
  };
}
