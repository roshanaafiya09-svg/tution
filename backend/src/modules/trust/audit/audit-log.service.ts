import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';

export interface AuditLogInput {
  actorId: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  diff?: Record<string, unknown> | null;
  ip?: string | null;
}

export interface AuditLogQueryInput {
  entity?: string;
  entityId?: string;
  limit?: number;
}

const MAX_QUERY_LIMIT = 200;
const DEFAULT_QUERY_LIMIT = 50;

/**
 * Shared write path for the immutable audit trail (blueprint §9: "every
 * admin action writes an immutable audit-log entry"). Any module can
 * inject this service to record one — audit_logs itself rejects UPDATE
 * and DELETE at the database level (see migration 0006), so this is the
 * only way an entry is ever written.
 *
 * Only trust module's own verification review calls this today, since
 * it's the one admin-style action Phase 1 ships; other modules should
 * start calling AuditLogService.record() as admin actions land in them.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  record(input: AuditLogInput) {
    return this.repository.create({
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      diff: input.diff ?? null,
      ip: input.ip ?? null,
    });
  }

  query(params: AuditLogQueryInput) {
    return this.repository.query({
      entity: params.entity,
      entityId: params.entityId,
      limit: Math.min(params.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT),
    });
  }
}
