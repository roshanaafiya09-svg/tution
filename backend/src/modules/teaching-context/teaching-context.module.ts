import { Global, Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AcademyMembershipsModule } from '../marketplace/academy-memberships/academy-memberships.module';
import { TeachingContextController } from './teaching-context.controller';
import { TeachingContextGuard } from './teaching-context.guard';
import { TeachingContextService } from './teaching-context.service';

/** Global so any tutor-facing controller can `@UseGuards(TeachingContextGuard)`
 *  without every feature module importing this one. */
@Global()
@Module({
  imports: [IdentityModule, AcademyMembershipsModule],
  controllers: [TeachingContextController],
  providers: [TeachingContextService, TeachingContextGuard],
  exports: [TeachingContextService, TeachingContextGuard],
})
export class TeachingContextModule {}
