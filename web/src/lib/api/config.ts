/**
 * Tunables for the API client. Kept in one mutable object so the test suite
 * can zero the retry back-off and swap `fetch`, and so the numbers a
 * production incident cares about (how long we wait, how often we retry)
 * live in one obvious place.
 */
export interface ApiConfig {
  /** Give up on a single attempt after this long. Generous on purpose: the
   *  production backend (Render free plan) can take 30–60s to wake, and a
   *  premature abort would just make the next attempt wake it again. */
  timeoutMs: number;
  /** Back-off before each automatic retry of a transient failure; its length
   *  is the maximum number of retries. */
  retryDelaysMs: number[];
  sleep: (ms: number) => Promise<void>;
  /** Resolved at call time (not import time) so `vi.stubGlobal('fetch')` works. */
  fetch: typeof fetch;
}

const DEFAULTS: ApiConfig = {
  timeoutMs: 30_000,
  retryDelaysMs: [400, 1200, 3000],
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  fetch: (...args) => globalThis.fetch(...args),
};

export const apiConfig: ApiConfig = { ...DEFAULTS };

export function configureApi(overrides: Partial<ApiConfig>): void {
  Object.assign(apiConfig, overrides);
}

export function resetApiConfig(): void {
  Object.assign(apiConfig, DEFAULTS);
}
