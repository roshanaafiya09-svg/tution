import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { BookingsModule } from '../bookings/bookings.module';
import { StorageModule } from '../../../common/storage/storage.module';
import { AcademyMembershipsModule } from '../academy-memberships/academy-memberships.module';
import { AcademyReviewsModule } from '../academy-reviews/academy-reviews.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AcademiesController } from './academies.controller';
import { AcademyAdminController } from './academy-admin.controller';
import { AcademiesService } from './academies.service';
import { AcademyAdminService } from './academy-admin.service';
import { AcademiesRepository } from './academies.repository';
import { AcademyLocationsRepository } from './academy-locations.repository';
import { AcademyPhotosRepository } from './academy-photos.repository';
import { AcademyContactRequestsRepository } from './academy-contact-requests.repository';

/**
 * Bounded context: public academy discovery search + ranking + the
 * public academy page ("Find an Academy" — same shape as
 * DiscoveryModule, applied to the new academies entity instead of
 * tutors), the teacher-facing "request to join an academy" endpoints,
 * plus the superadmin-only academy management surface
 * (AcademyAdminController).
 *
 * Imports AcademyMembershipsModule (leaf, also imported independently
 * by AcademyReviewsModule and AcademyOwnerModule) and AcademyReviewsModule
 * (rating display — a separate trust signal from teacher reviews, never
 * mixed). Neither of those two modules imports this one, so there's no
 * cycle — see AcademyMembershipsModule's doc comment for why the
 * membership repositories were pulled out into their own leaf module
 * instead of living here directly.
 *
 * Exports the repositories too (not just the service) so AcademyOwnerModule
 * — the self-serve Academy Dashboard, see migration 0031 — can reuse the
 * same queries instead of duplicating them, mirroring how the membership
 * leaf module is already shared this way.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    BookingsModule,
    StorageModule,
    AcademyMembershipsModule,
    AcademyReviewsModule,
    NotificationsModule,
  ],
  controllers: [AcademiesController, AcademyAdminController],
  providers: [
    AcademiesService,
    AcademyAdminService,
    AcademiesRepository,
    AcademyLocationsRepository,
    AcademyPhotosRepository,
    AcademyContactRequestsRepository,
  ],
  exports: [
    AcademiesService,
    AcademiesRepository,
    AcademyLocationsRepository,
    AcademyPhotosRepository,
    AcademyContactRequestsRepository,
  ],
})
export class AcademiesModule {}
