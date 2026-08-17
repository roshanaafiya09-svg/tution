import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { IdentityModule } from '../identity/identity.module';
import { TrustModule } from '../trust/trust.module';

/**
 * Super Admin dashboard: teacher/student/parent management, "view as
 * user" impersonation, and test-account deletion. Depends on
 * IdentityModule for UsersRepository/TokensService/JwtAuthGuard/
 * RolesGuard (all already exported there) rather than duplicating any
 * of them. Imports TrustModule for AuditLogService — impersonation and
 * account deletion are exactly the kind of admin action blueprint §9
 * says needs an immutable audit-log entry (see AdminService).
 */
@Module({
  imports: [IdentityModule, TrustModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
