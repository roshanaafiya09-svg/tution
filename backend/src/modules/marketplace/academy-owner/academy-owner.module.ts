import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { BookingsModule } from '../bookings/bookings.module';
import { StorageModule } from '../../../common/storage/storage.module';
import { AcademiesModule } from '../academies/academies.module';
import { AcademyMembershipsModule } from '../academy-memberships/academy-memberships.module';
import { AcademyReviewsModule } from '../academy-reviews/academy-reviews.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CatalogModule } from '../../catalog/catalog.module';
import { AcademyOwnerController } from './academy-owner.controller';
import { AcademyOwnerService } from './academy-owner.service';
import { AcademyOwnerBatchesController } from './academy-owner-batches.controller';
import { AcademyOwnerBatchesService } from './academy-owner-batches.service';

/**
 * The self-serve Academy Dashboard (migration 0031) — closes the gap
 * migration 0030 explicitly left open. Imports AcademiesModule for its
 * now-exported repositories (AcademiesRepository/AcademyLocationsRepository/
 * AcademyPhotosRepository/AcademyContactRequestsRepository) rather than
 * duplicating those queries; AcademiesModule does NOT import this module,
 * so there's no cycle. Same for AcademyMembershipsModule (membership +
 * join-request repos) and AcademyReviewsModule (rating summary for
 * stats).
 */
@Module({
  imports: [
    IdentityModule,
    AcademiesModule,
    AcademyMembershipsModule,
    AcademyReviewsModule,
    SchedulingModule,
    BookingsModule,
    StorageModule,
    NotificationsModule,
    CatalogModule,
  ],
  controllers: [AcademyOwnerController, AcademyOwnerBatchesController],
  providers: [AcademyOwnerService, AcademyOwnerBatchesService],
})
export class AcademyOwnerModule {}
