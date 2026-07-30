import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaterialsController } from './materials/materials.controller';
import { MaterialsService } from './materials/materials.service';
import { MaterialsRepository } from './materials/materials.repository';
import { STORAGE_PROVIDER } from './materials/storage/storage-provider.interface';
import { LocalStorageProvider } from './materials/storage/local-storage.provider';
import { R2StorageProvider } from './materials/storage/r2-storage.provider';
import { AnnouncementsController } from './announcements/announcements.controller';
import { AnnouncementsService } from './announcements/announcements.service';
import { AnnouncementsRepository } from './announcements/announcements.repository';

const storageLogger = new Logger('DeliveryModule');

/**
 * Bounded context: materials (R2-backed uploads, per-batch visibility),
 * announcements. Assignment/submission grading lives in AssessmentModule.
 * Owns tables: materials, announcements.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, NotificationsModule],
  controllers: [MaterialsController, AnnouncementsController],
  providers: [
    MaterialsService,
    MaterialsRepository,
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider],
      useFactory: (
        config: ConfigService,
        localProvider: LocalStorageProvider,
      ) => {
        const configured = Boolean(
          config.get<string>('storage.accountId') &&
          config.get<string>('storage.bucket') &&
          config.get<string>('storage.accessKeyId') &&
          config.get<string>('storage.secretAccessKey'),
        );
        if (configured) {
          storageLogger.log(
            'Cloudflare R2 configured — using it for material storage',
          );
          return new R2StorageProvider(config);
        }
        storageLogger.warn(
          'R2 not configured — materials will be stored on local disk',
        );
        return localProvider;
      },
    },
    AnnouncementsService,
    AnnouncementsRepository,
  ],
  exports: [MaterialsRepository, STORAGE_PROVIDER],
})
export class DeliveryModule {}
