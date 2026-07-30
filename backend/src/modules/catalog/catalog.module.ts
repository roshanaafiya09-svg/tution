import { Module } from '@nestjs/common';

/**
 * Bounded context: subjects, curricula, grade levels, tutor subject
 * offerings, tutor availability (weekly recurring + exceptions).
 * Owns tables: subjects, curricula, grade_levels, tutor_subjects,
 * tutor_availability, tutor_availability_exceptions.
 */
@Module({})
export class CatalogModule {}
