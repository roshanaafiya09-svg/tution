import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { CatalogModule } from '../../catalog/catalog.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { WaitlistsModule } from '../waitlists/waitlists.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsRepository } from './bookings.repository';

/**
 * Bounded context: 1:1 marketplace bookings (blueprint §5/§9/§10 Phase
 * 4). Reads tutor bookable windows from CatalogModule's
 * AvailabilityRepository (no new availability data) and checks
 * SchedulingModule's class_sessions for double-booking across the two
 * scheduling systems. Exports only the service (state-machine-owning
 * module, same precedent as SubscriptionsModule/ParentPremiumModule) —
 * imported directly by BillingModule for the payments/take-rate flow,
 * not separately registered in AppModule (same reasoning as
 * ParentPremiumModule: it's reachable through BillingModule already).
 * Owns table: bookings.
 */
@Module({
  imports: [IdentityModule, CatalogModule, SchedulingModule, WaitlistsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository],
  exports: [BookingsService],
})
export class BookingsModule {}
