import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ParentsModule } from '../parents/parents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesRepository } from './messages.repository';

/**
 * Bounded context: monitored-only adult<->minor messaging (blueprint
 * §9, Phase 2). A top-level module — imports SchedulingModule (batch
 * ownership/enrollment checks) and ParentsModule (consent status
 * checks) but nothing imports this one back, so it's a sink in the
 * module graph like BillingModule, with no cycle risk.
 * Owns table: messages.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    ParentsModule,
    NotificationsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesRepository],
})
export class MessagingModule {}
