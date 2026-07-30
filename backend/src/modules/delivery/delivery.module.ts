import { Module } from '@nestjs/common';

/**
 * Bounded context: materials (R2-backed uploads, per-batch visibility),
 * announcements. Assignment/submission grading lives in AssessmentModule.
 * Owns tables: materials, announcements.
 */
@Module({})
export class DeliveryModule {}
