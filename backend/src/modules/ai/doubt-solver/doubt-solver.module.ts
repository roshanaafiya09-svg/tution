import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { DeliveryModule } from '../../delivery/delivery.module';
import { AiModule } from '../ai.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { ParentPremiumModule } from '../../billing/parent-premium/parent-premium.module';
import { DoubtSolverController } from './doubt-solver.controller';
import { DoubtSolverService } from './doubt-solver.service';
import { MaterialChunksRepository } from './material-chunks.repository';
import { AiInteractionsRepository } from './interactions.repository';

/**
 * Bounded context: AI doubt solver (blueprint §8/§10 Phase 3) — RAG
 * over a tutor's own materials with a server-enforced Socratic gate.
 * A sink module like Digests/Quizzes — imports SchedulingModule
 * (enrollment checks), DeliveryModule (material PDF read),
 * AiModule (Socratic hint/answer + moderation calls), EmbeddingsModule
 * (chunk/query vectors), and ParentPremiumModule (this feature is
 * entirely Parent Premium-gated, blueprint §5/§10 Phase 3 — see
 * ParentPremiumForStudentGuard on the ask route below); nothing imports
 * this back.
 * Owns tables: material_chunks, ai_interactions.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    DeliveryModule,
    AiModule,
    EmbeddingsModule,
    ParentPremiumModule,
  ],
  controllers: [DoubtSolverController],
  providers: [
    DoubtSolverService,
    MaterialChunksRepository,
    AiInteractionsRepository,
  ],
})
export class DoubtSolverModule {}
