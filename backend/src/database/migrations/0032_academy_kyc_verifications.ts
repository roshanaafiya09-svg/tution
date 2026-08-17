import { Kysely, sql } from 'kysely';

/**
 * Academy owner identity verification (KYC) — Phase 1: the state machine
 * and consent linkage only. No KYC provider is wired in yet (see the
 * research/audit report); `provider`/`provider_verification_id`/
 * `result_code` stay null until one is. One row per submission attempt
 * (mirrors tutor_verifications, not a single mutable status column) so
 * a rejection-then-resubmission keeps its own history instead of
 * overwriting the record of what happened.
 *
 * Deliberately a new table, not a reuse of tutor_verifications: that
 * table is per-document (id_proof/qualification, many rows before a
 * tutor is verified), while this is per-submission-attempt with a
 * richer status than academies.verification_status needs to expose
 * publicly. academies.verification_status stays exactly as-is —
 * unchanged 3-state enum still gating discovery — and is only ever
 * synced from a terminal state here (verified/rejected), so existing
 * discovery/profile-badge behavior is untouched.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table academy_kyc_verifications (
      id uuid primary key,
      academy_id uuid not null references academies(id) on delete cascade,
      status text not null default 'pending'
        check (status in ('pending', 'under_review', 'verified', 'rejected', 'needs_manual_review')),
      consent_record_id uuid null references consent_records(id),
      provider text null,
      provider_verification_id text null,
      result_code text null,
      reason text null,
      reviewed_by uuid null references users(id),
      reviewed_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index academy_kyc_verifications_academy_id_idx
      on academy_kyc_verifications(academy_id, created_at desc);
    create trigger set_updated_at before update on academy_kyc_verifications
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists academy_kyc_verifications;`.execute(db);
}
