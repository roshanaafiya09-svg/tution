import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { IdentityModule } from '../identity/identity.module';

/**
 * Super Admin dashboard: teacher/student/parent management, "view as
 * user" impersonation, and test-account deletion. Depends on
 * IdentityModule for UsersRepository/TokensService/JwtAuthGuard/
 * RolesGuard (all already exported there) rather than duplicating any
 * of them.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
