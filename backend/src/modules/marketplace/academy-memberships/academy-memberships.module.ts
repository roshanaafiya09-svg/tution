import { Module } from '@nestjs/common';
import { AcademyMembershipsRepository } from './academy-memberships.repository';
import { AcademyMembershipRequestsRepository } from './academy-membership-requests.repository';

/**
 * Leaf module — just the teacher<->academy membership + join-request
 * repositories, no controller, no other imports. AcademiesModule (public
 * discovery + teacher-side join requests), AcademyReviewsModule, and
 * AcademyOwnerModule (self-serve academy dashboard) all need these
 * lookups; if any of them owned the repositories directly, the others
 * importing it would create a module cycle. Extracting them here avoids
 * that entirely — see AcademiesModule's doc comment.
 */
@Module({
  providers: [
    AcademyMembershipsRepository,
    AcademyMembershipRequestsRepository,
  ],
  exports: [AcademyMembershipsRepository, AcademyMembershipRequestsRepository],
})
export class AcademyMembershipsModule {}
