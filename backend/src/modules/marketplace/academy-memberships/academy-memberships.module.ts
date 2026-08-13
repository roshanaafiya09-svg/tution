import { Module } from '@nestjs/common';
import { AcademyMembershipsRepository } from './academy-memberships.repository';

/**
 * Leaf module — just the teacher<->academy membership repository, no
 * controller, no other imports. Both AcademiesModule and
 * AcademyReviewsModule need membership lookups; if either owned this
 * repository directly, the other importing it would create a module
 * cycle (AcademiesModule <-> AcademyReviewsModule). Extracting it here
 * avoids that entirely — see AcademiesModule's doc comment.
 */
@Module({
  providers: [AcademyMembershipsRepository],
  exports: [AcademyMembershipsRepository],
})
export class AcademyMembershipsModule {}
