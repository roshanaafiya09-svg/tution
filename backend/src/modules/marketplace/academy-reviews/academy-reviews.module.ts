import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { BookingsModule } from '../bookings/bookings.module';
import { AcademyMembershipsModule } from '../academy-memberships/academy-memberships.module';
import { AcademyReviewsController } from './academy-reviews.controller';
import { AcademyReviewsService } from './academy-reviews.service';
import { AcademyReviewsRepository } from './academy-reviews.repository';

/**
 * Bounded context: verified-session-only academy reviews — mirrors
 * ReviewsModule exactly, but the verified-session check spans every
 * active member tutor of an academy (AcademyMembershipsModule), not one
 * fixed tutor. Imports AcademyMembershipsModule directly (NOT
 * AcademiesModule) to avoid a module cycle — see AcademiesModule's doc
 * comment. Exports the service for AcademiesModule's public academy
 * page (rating display) and this module's own controller.
 * Owns table: academy_reviews.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    BookingsModule,
    AcademyMembershipsModule,
  ],
  controllers: [AcademyReviewsController],
  providers: [AcademyReviewsService, AcademyReviewsRepository],
  exports: [AcademyReviewsService],
})
export class AcademyReviewsModule {}
