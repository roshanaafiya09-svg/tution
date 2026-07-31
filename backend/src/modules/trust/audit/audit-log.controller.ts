import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { AuditLogService } from './audit-log.service';

/**
 * Internal-only, read side of the audit trail. There is no write
 * endpoint by design — entries are recorded by services calling
 * AuditLogService.record() directly, never over HTTP.
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('support', 'trust_safety', 'finance', 'growth', 'superadmin')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  list(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.query({
      entity,
      entityId,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
