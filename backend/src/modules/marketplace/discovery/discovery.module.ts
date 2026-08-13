import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { TutorLocationsModule } from '../locations/tutor-locations.module';
import { ProofOfTeachingModule } from '../proof-of-teaching/proof-of-teaching.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { StorageModule } from '../../../common/storage/storage.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { DiscoveryRepository } from './discovery.repository';
import { ContactRequestsRepository } from './contact-requests.repository';

/**
 * Bounded context: public discovery search + ranking + the public SEO
 * tutor page, the Phase 4 density gate (blueprint §10), and — additive
 * for Find a Teacher — the "Contact Teacher" lead list
 * (teacher_contact_requests). Composes ProofOfTeachingModule (ranking +
 * students-taught), ReviewsModule (rating display), TutorLocationsModule
 * (geo search), SchedulingModule (available-batches), StorageModule
 * (avatar URLs), NotificationsModule (contact-request alerts), and
 * IdentityModule (tutor profiles + the gate's active-user counts). The
 * tutors/* routes stay public (no JwtAuthGuard, by design — open to
 * search engines); the contact-request routes are the one guarded slice
 * of this controller.
 */
@Module({
  imports: [
    IdentityModule,
    TutorLocationsModule,
    ProofOfTeachingModule,
    ReviewsModule,
    SchedulingModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, DiscoveryRepository, ContactRequestsRepository],
})
export class DiscoveryModule {}
