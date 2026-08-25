import type { ConfigService } from '@nestjs/config';
import { resolveStorageProvider } from './storage.module';
import { LocalStorageProvider } from './local-storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';

/**
 * SEC-08: production must never silently fall back to the
 * unauthenticated local-disk provider just because a Supabase env var
 * is missing — that used to be a log warning, not a startup failure.
 */
function buildConfig(
  values: Record<string, string | undefined>,
): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

const FULLY_CONFIGURED = {
  'storage.projectRef': 'ref',
  'storage.bucket': 'bucket',
  'storage.region': 'region',
  'storage.accessKeyId': 'key',
  'storage.secretAccessKey': 'secret',
};

describe('resolveStorageProvider', () => {
  const localProvider = {} as LocalStorageProvider;

  it('uses Supabase Storage when fully configured, in any environment', () => {
    const config = buildConfig({
      ...FULLY_CONFIGURED,
      'app.nodeEnv': 'production',
    });
    expect(resolveStorageProvider(config, localProvider)).toBeInstanceOf(
      SupabaseStorageProvider,
    );
  });

  it('falls back to local disk when unconfigured outside production', () => {
    const config = buildConfig({ 'app.nodeEnv': 'development' });
    expect(resolveStorageProvider(config, localProvider)).toBe(localProvider);
  });

  it('throws instead of falling back to local disk when unconfigured in production', () => {
    const config = buildConfig({ 'app.nodeEnv': 'production' });
    expect(() => resolveStorageProvider(config, localProvider)).toThrow(
      /Supabase Storage is not configured/,
    );
  });

  it('throws in production even with only one Supabase var missing', () => {
    const config = buildConfig({
      ...FULLY_CONFIGURED,
      'storage.secretAccessKey': undefined,
      'app.nodeEnv': 'production',
    });
    expect(() => resolveStorageProvider(config, localProvider)).toThrow(
      /Supabase Storage is not configured/,
    );
  });
});
