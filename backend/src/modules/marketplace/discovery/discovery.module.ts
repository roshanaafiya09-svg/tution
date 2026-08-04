import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { TutorLocationsModule } from '../locations/tutor-locations.module';
import { ProofOfTeachingModule } from '../proof-of-teaching/proof-of-teaching.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { DiscoveryRepository } from './discovery.repository';

/**
 * Bounded context: public discovery search + ranking + the public SEO
 * tutor page, and the Phase 4 density gate (blueprint §10). No table of
 * its own — composes ProofOfTeachingModule (ranking signal),
 * ReviewsModule (rating display), TutorLocationsModule (geo search) and
 * IdentityModule (tutor profiles + the gate's active-user counts).
 * Entirely public routes — this is the one marketplace controller with
 * no JwtAuthGuard, by design (open to search engines).
 */
@Module({
  imports: [
    IdentityModule,
    TutorLocationsModule,
    ProofOfTeachingModule,
    ReviewsModule,
  ],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, DiscoveryRepository],
})
export class DiscoveryModule {}
