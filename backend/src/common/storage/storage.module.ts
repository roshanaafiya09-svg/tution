import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import { LocalStorageProvider } from './local-storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';

const storageLogger = new Logger('StorageModule');

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
      useFactory: (
        config: ConfigService,
        localProvider: LocalStorageProvider,
      ) => {
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
        storageLogger.warn(
          'Supabase Storage not configured — files will be stored on local disk',
        );
        return localProvider;
      },
    },
  ],
  exports: [STORAGE_PROVIDER, LocalStorageProvider],
})
export class StorageModule {}
