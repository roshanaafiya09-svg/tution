import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ReferenceController } from './reference/reference.controller';
import { ReferenceRepository } from './reference/reference.repository';
import { TutorSubjectsController } from './tutor-subjects/tutor-subjects.controller';
import { TutorSubjectsService } from './tutor-subjects/tutor-subjects.service';
import { TutorSubjectsRepository } from './tutor-subjects/tutor-subjects.repository';
import { AvailabilityController } from './availability/availability.controller';
import { AvailabilityService } from './availability/availability.service';
import { AvailabilityRepository } from './availability/availability.repository';

/**
 * Bounded context: subjects, curricula, grade levels, tutor subject
 * offerings, tutor availability (weekly recurring + exceptions).
 * Owns tables: subjects, curricula, grade_levels, tutor_subjects,
 * tutor_availability, tutor_availability_exceptions.
 */
@Module({
  imports: [IdentityModule],
  controllers: [
    ReferenceController,
    TutorSubjectsController,
    AvailabilityController,
  ],
  providers: [
    ReferenceRepository,
    TutorSubjectsService,
    TutorSubjectsRepository,
    AvailabilityService,
    AvailabilityRepository,
  ],
  exports: [TutorSubjectsRepository, AvailabilityRepository],
})
export class CatalogModule {}
