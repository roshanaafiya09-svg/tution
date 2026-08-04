import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { TutorLocationsController } from './tutor-locations.controller';
import { TutorLocationsService } from './tutor-locations.service';
import { TutorLocationsRepository } from './tutor-locations.repository';

/**
 * Bounded context: a tutor's self-entered marketplace location
 * (blueprint §9/§10 Phase 4). No geocoding provider exists anywhere in
 * the app (mock-first) — lat/lng are entered directly by the tutor
 * rather than derived from a typed address. Owns table:
 * tutor_locations.
 */
@Module({
  imports: [IdentityModule],
  controllers: [TutorLocationsController],
  providers: [TutorLocationsService, TutorLocationsRepository],
  exports: [TutorLocationsRepository],
})
export class TutorLocationsModule {}
