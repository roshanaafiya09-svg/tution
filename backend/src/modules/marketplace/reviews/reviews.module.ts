import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './reviews.repository';

/**
 * Bounded context: verified-session-only tutor reviews (blueprint §10
 * Phase 4). Composes IdentityModule (tutor existence via UsersRepository),
 * SchedulingModule (batch-attendance half of the verified-session check)
 * and BookingsModule (1:1-booking half). Exports the service for
 * DiscoveryModule's public tutor pages (commit 7).
 * Owns table: reviews.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, BookingsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsRepository],
  exports: [ReviewsService],
})
export class ReviewsModule {}
