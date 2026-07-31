import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { VerificationsController } from './verifications/verifications.controller';
import { VerificationsService } from './verifications/verifications.service';
import { VerificationsRepository } from './verifications/verifications.repository';
import { ConsentController } from './consent/consent.controller';
import { ConsentService } from './consent/consent.service';
import { ConsentRepository } from './consent/consent.repository';
import { AuditLogController } from './audit/audit-log.controller';
import { AuditLogService } from './audit/audit-log.service';
import { AuditLogRepository } from './audit/audit-log.repository';

/**
 * Bounded context: tutor verification queue, DPDP consent records,
 * immutable admin audit log. AuditLogService is the shared write path
 * other modules should call into as their own admin actions land —
 * audit_logs itself rejects UPDATE/DELETE at the database level
 * (migration 0006), so this is the only way an entry is ever written.
 * Owns tables: tutor_verifications, consent_records, audit_logs.
 *
 * Imports DeliveryModule to reuse its STORAGE_PROVIDER for verification
 * document upload/download — same presigned-URL contract as materials,
 * not worth a second storage seam for one more document type.
 */
@Module({
  imports: [IdentityModule, DeliveryModule],
  controllers: [VerificationsController, ConsentController, AuditLogController],
  providers: [
    VerificationsRepository,
    VerificationsService,
    ConsentRepository,
    ConsentService,
    AuditLogRepository,
    AuditLogService,
  ],
  exports: [AuditLogService],
})
export class TrustModule {}
