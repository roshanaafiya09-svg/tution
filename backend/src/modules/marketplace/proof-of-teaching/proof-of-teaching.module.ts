import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { AssessmentModule } from '../../assessment/assessment.module';
import { ProofOfTeachingController } from './proof-of-teaching.controller';
import { ProofOfTeachingService } from './proof-of-teaching.service';

/**
 * Bounded context: the Proof-of-Teaching score (blueprint §10 Phase 4)
 * — a discovery-ranking signal computed from data that already exists
 * for other features (completed class minutes, attendance rate,
 * quiz-score trend), not a table of its own. Composes SchedulingModule
 * + AssessmentModule's exported repositories; DiscoveryModule will
 * import this module directly for its ranking pass.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, AssessmentModule],
  controllers: [ProofOfTeachingController],
  providers: [ProofOfTeachingService],
  exports: [ProofOfTeachingService],
})
export class ProofOfTeachingModule {}
