import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustModule } from '../trust/trust.module';
import { ParentLinksController } from './parent-links.controller';
import { ParentLinksService } from './parent-links.service';
import { ParentLinksRepository } from './parent-links.repository';
import { ParentInviteRepository } from './parent-invite.repository';

/**
 * Bounded context: parent↔student account linking + the DPDP verifiable
 * parental consent that activates it (blueprint §3, §9, Phase 2).
 * A top-level module (not nested under Identity or Trust) importing both,
 * the same shape as BillingModule — avoids the cycle that would result
 * from either of those importing this one back.
 * Owns table: parent_child_links. Invite tokens are ephemeral (Redis),
 * not persisted relationally until redeemed.
 */
@Module({
  imports: [IdentityModule, TrustModule],
  controllers: [ParentLinksController],
  providers: [ParentLinksService, ParentLinksRepository, ParentInviteRepository],
  exports: [ParentLinksRepository],
})
export class ParentsModule {}
