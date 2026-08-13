import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../common/storage/storage.module';
import { MaterialsController } from './materials/materials.controller';
import { MaterialsService } from './materials/materials.service';
import { MaterialsRepository } from './materials/materials.repository';
import { AnnouncementsController } from './announcements/announcements.controller';
import { AnnouncementsService } from './announcements/announcements.service';
import { AnnouncementsRepository } from './announcements/announcements.repository';

/**
 * Bounded context: materials (Supabase Storage-backed uploads, per-batch
 * visibility), announcements. Assignment/submission grading lives in
 * AssessmentModule. Owns tables: materials, announcements. File storage
 * itself is owned by the shared StorageModule (also used by
 * IdentityModule for tutor avatars) — this module just consumes it.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [MaterialsController, AnnouncementsController],
  providers: [
    MaterialsService,
    MaterialsRepository,
    AnnouncementsService,
    AnnouncementsRepository,
  ],
  exports: [MaterialsRepository, StorageModule],
})
export class DeliveryModule {}
