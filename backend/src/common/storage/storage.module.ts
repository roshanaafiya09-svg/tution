import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import type { StorageProvider } from './storage-provider.interface';
import { LocalStorageProvider } from './local-storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';

const storageLogger = new Logger('StorageModule');

/**
 * Extracted from the DI factory below so it's testable without booting
 * Nest's container. SEC-08: this used to fall back to
 * LocalStorageProvider with only a log warning, regardless of
 * environment — an unauthenticated local-disk server (see
 * LocalStorageProvider) could silently take over file storage in
 * production on a missing env var, with no startup failure to catch
 * it. Local disk is also ephemeral on Render, so every uploaded file
 * would vanish on the next deploy/restart even if this went unnoticed.
 * Local disk stays a legitimate, credential-free dev convenience — just
 * never reachable from a production boot.
 */
export function resolveStorageProvider(
  config: ConfigService,
  localProvider: LocalStorageProvider,
): StorageProvider {
  const configured = Boolean(
    config.get<string>('storage.projectRef') &&
    config.get<string>('storage.bucket') &&
    config.get<string>('storage.region') &&
    config.get<string>('storage.accessKeyId') &&
    config.get<string>('storage.secretAccessKey'),
  );
  if (configured) {
    storageLogger.log(
      'Supabase Storage configured — using it for file storage',
    );
    return new SupabaseStorageProvider(config);
  }

  if (config.get<string>('app.nodeEnv') === 'production') {
    throw new Error(
      'Supabase Storage is not configured (missing one or more of ' +
        'SUPABASE_PROJECT_REF/SUPABASE_STORAGE_BUCKET/SUPABASE_STORAGE_REGION/' +
        'SUPABASE_STORAGE_ACCESS_KEY_ID/SUPABASE_STORAGE_SECRET_ACCESS_KEY) — ' +
        'refusing to start with an unauthenticated local-disk storage ' +
        'fallback in production.',
    );
  }

  storageLogger.warn(
    'Supabase Storage not configured — files will be stored on local disk',
  );
  return localProvider;
}

/**
 * One shared StorageProvider (Supabase Storage, or local-disk in dev —
 * see storage-provider.interface.ts) for every feature that needs file
 * uploads: course materials (DeliveryModule) and tutor avatars
 * (IdentityModule). A single DI registration, not one per feature, so
 * there's exactly one bucket/provider instance to configure.
 */
@Module({
  providers: [
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider],
      useFactory: resolveStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER, LocalStorageProvider],
})
export class StorageModule {}
