import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { AssessmentModule } from '../../assessment/assessment.module';
import { ParentsModule } from '../../parents/parents.module';
import { AiModule } from '../ai.module';
import { DigestsController } from './digests.controller';
import { DigestsService } from './digests.service';
import { DigestsRepository } from './digests.repository';

/**
 * Bounded context: AI weekly parent digest (blueprint §8, §10 Phase 2).
 * A sink module like Billing/Messaging — imports Scheduling (attendance),
 * Assessment (submissions), Parents (consent check), and AiModule (the
 * narrative call), and nothing imports this back.
 * Owns table: digests.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, AssessmentModule, ParentsModule, AiModule],
  controllers: [DigestsController],
  providers: [DigestsService, DigestsRepository],
})
export class DigestsModule {}
