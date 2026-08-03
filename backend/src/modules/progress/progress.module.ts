import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { ParentsModule } from '../parents/parents.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

/**
 * Bounded context: progress/trends dashboards (blueprint §3, §10
 * Phase 3 "richer progress/trends") — a pure read-side aggregator, owns
 * no table of its own. Composes AttendanceRepository (Scheduling),
 * AssignmentsRepository (Assessment), QuizAttemptsRepository
 * (Assessment), and ParentLinksRepository (Parents, for the consent
 * check on the parent-facing route) — every one of these already has a
 * "list everything for this student" method from an earlier feature
 * (digest stats, data export, attempt history), so this module adds no
 * new queries, just weekly bucketing over data those already expose.
 * A sink module like Digests/Quizzes/DoubtSolver; nothing imports it
 * back.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, AssessmentModule, ParentsModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
