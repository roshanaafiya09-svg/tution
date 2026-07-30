import { Module } from '@nestjs/common';

/**
 * Bounded context: assignments, student submissions, grading/feedback.
 * Phase 3 adds quizzes + quiz_attempts here.
 * Owns tables: assignments, submissions.
 */
@Module({})
export class AssessmentModule {}
