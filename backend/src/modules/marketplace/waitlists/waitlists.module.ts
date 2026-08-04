import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { CatalogModule } from '../../catalog/catalog.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { WaitlistsController } from './waitlists.controller';
import { WaitlistsService } from './waitlists.service';
import { WaitlistsRepository } from './waitlists.repository';

/**
 * Bounded context: waitlists for fully-booked tutor+subject offerings,
 * and their conversion into bookings (blueprint §10 Phase 4). Exports
 * only the service — imported directly by BookingsModule to trigger
 * cancellation fan-out and convert a joined booking, same precedent as
 * every other cross-module dependency in this codebase.
 * Owns table: booking_waitlists.
 */
@Module({
  imports: [IdentityModule, CatalogModule, NotificationsModule],
  controllers: [WaitlistsController],
  providers: [WaitlistsService, WaitlistsRepository],
  exports: [WaitlistsService],
})
export class WaitlistsModule {}
