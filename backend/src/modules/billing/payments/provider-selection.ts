/**
 * Which money provider a process runs (audit C1/H5). Pure, so the rule is
 * unit-testable: PRODUCTION NEVER GETS THE MOCK.
 *
 *  - Razorpay keys present            -> the real provider (any environment)
 *  - no keys, NODE_ENV=production     -> the DISABLED provider: money
 *                                        operations fail loudly with 503, the
 *                                        app still boots, nothing is faked
 *  - no keys, anywhere else           -> the mock (local dev and tests only)
 *
 * A half-configured production (key id set but secret/webhook secret missing)
 * is rejected by env validation at startup — see env.validation.ts.
 */
export type ProviderChoice = 'real' | 'mock' | 'disabled';

export function chooseProvider(input: {
  keyId?: string;
  keySecret?: string;
  nodeEnv?: string;
}): ProviderChoice {
  if (input.keyId && input.keySecret) return 'real';
  return input.nodeEnv === 'production' ? 'disabled' : 'mock';
}
