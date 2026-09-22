import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { configureApi, resetApiConfig } from '@/lib/api/config';
import { resetApiCaches, session } from '@/lib/api';
import { setApiLogger } from '@/lib/api/log';
import { onSessionLost, rearmSessionLost } from '@/lib/api/session-events';
import { teachingContext } from '@/lib/teaching-context';

beforeEach(() => {
  // No real waiting between retries; a short timeout so hung-request tests are fast.
  configureApi({ retryDelaysMs: [0, 0, 0], sleep: () => Promise.resolve(), timeoutMs: 2_000 });
  setApiLogger(() => undefined);
  session.clear();
  resetApiCaches();
  rearmSessionLost();
  // The app's root listener (ApiEventsBridge) does the redirect in production;
  // tests observe it via their own onSessionLost(spy) when they care.
  onSessionLost(() => undefined);
  teachingContext.reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetApiConfig();
  setApiLogger(null);
});
