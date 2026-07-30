import { Module } from '@nestjs/common';

/**
 * Bounded context: tutor verification queue, DPDP consent records,
 * immutable admin audit log, safeguarding. Every admin action across every
 * other module writes here — this module owns the audit_logs table and
 * exposes the write path other modules call into.
 * Owns tables: tutor_verifications, consent_records, audit_logs.
 */
@Module({})
export class TrustModule {}
