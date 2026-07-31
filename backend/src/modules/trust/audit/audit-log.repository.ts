import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewAuditLogEntry {
  actorId: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  diff: Record<string, unknown> | null;
  ip: string | null;
}

export interface AuditLogQuery {
  entity?: string;
  entityId?: string;
  limit: number;
}

@Injectable()
export class AuditLogRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewAuditLogEntry) {
    return this.db
      .insertInto('audit_logs')
      .values({
        id: newId(),
        actor_id: input.actorId,
        actor_role: input.actorRole,
        action: input.action,
        entity: input.entity,
        entity_id: input.entityId,
        diff: input.diff ? JSON.stringify(input.diff) : null,
        ip: input.ip,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  query(params: AuditLogQuery) {
    let q = this.db.selectFrom('audit_logs').selectAll();
    if (params.entity) {
      q = q.where('entity', '=', params.entity);
    }
    if (params.entityId) {
      q = q.where('entity_id', '=', params.entityId);
    }
    return q.orderBy('created_at', 'desc').limit(params.limit).execute();
  }
}
