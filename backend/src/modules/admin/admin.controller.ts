import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';

/**
 * Super Admin only, enforced here (not just hidden in the UI):
 * JwtAuthGuard identifies the caller, RolesGuard's superadmin bypass is
 * what actually lets them through — @Roles('superadmin') makes that
 * explicit and future-proof rather than relying on the bypass alone.
 * Every other role gets a 403 from RolesGuard before any handler runs.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('teachers')
  listTeachers(@Query('q') q?: string) {
    return this.adminService.listTeachers(q);
  }

  @Get('students')
  listStudents(@Query('q') q?: string) {
    return this.adminService.listStudents(q);
  }

  @Get('parents')
  listParents(@Query('q') q?: string) {
    return this.adminService.listParents(q);
  }

  @Post('impersonate/:userId')
  @HttpCode(200)
  impersonate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    return this.adminService.impersonate(user.sub, userId);
  }

  @Delete('users/:id')
  @HttpCode(200)
  async deleteUser(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.adminService.deleteUser(user.sub, id);
    return { deleted: true };
  }
}
