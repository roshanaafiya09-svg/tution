import { Module } from '@nestjs/common';

/**
 * Bounded context: batches, enrollments, invite links, class sessions
 * (RRULE recurrence, UTC + IANA timezone), attendance.
 * Owns tables: batches, enrollments, invites, class_sessions, attendance.
 */
@Module({})
export class SchedulingModule {}
