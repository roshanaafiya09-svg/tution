import { validateEnv } from './env.validation';

/**
 * Config hardening: JWT_ACCESS_SECRET/JWT_REFRESH_SECRET already had a
 * 32-char minimum length via zod, but length alone doesn't catch a
 * secret that's still the .env.example placeholder, reused for both
 * access and refresh, or a degenerate low-entropy string (e.g. one
 * repeated character) that happens to clear 32 chars.
 */
const VALID_ACCESS_SECRET = 'aVeryRealRandomLookingAccessSecret1234';
const VALID_REFRESH_SECRET = 'aVeryRealRandomLookingRefreshSecret5678';

function baseConfig(overrides: Record<string, string> = {}) {
  return {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: VALID_ACCESS_SECRET,
    JWT_REFRESH_SECRET: VALID_REFRESH_SECRET,
    ...overrides,
  };
}

describe('validateEnv — JWT secret hardening', () => {
  it('accepts two distinct, high-variety secrets', () => {
    expect(() => validateEnv(baseConfig())).not.toThrow();
  });

  it('rejects identical access/refresh secrets', () => {
    expect(() =>
      validateEnv(
        baseConfig({
          JWT_ACCESS_SECRET: VALID_ACCESS_SECRET,
          JWT_REFRESH_SECRET: VALID_ACCESS_SECRET,
        }),
      ),
    ).toThrow(/must not be the same value/);
  });

  it('rejects the .env.example placeholder values', () => {
    expect(() =>
      validateEnv(
        baseConfig({
          JWT_ACCESS_SECRET: 'replace-with-a-random-32+-char-secret',
        }),
      ),
    ).toThrow(/placeholder value/);
  });

  it('rejects a low-variety secret that clears the length minimum but has near-zero entropy', () => {
    expect(() =>
      validateEnv(
        baseConfig({
          JWT_ACCESS_SECRET: 'a'.repeat(40),
        }),
      ),
    ).toThrow(/too little character variety/);
  });
});
