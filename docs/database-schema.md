# Database Schema

PostgreSQL 16, migrated with `kysely` via `npm run migrate:up` / `migrate:down` (`backend/src/database/migrate.ts`). Migrations live in `backend/src/database/migrations/` and run in filename order. Money = integer minor units + ISO-4217 currency code, never floats. Timestamps = `timestamptz` UTC (+ IANA zone column wherever wall-clock/local-time matters). IDs = app-generated UUIDv7.

## Phase 1 — core (blueprint §7)

| # | Migration | Adds |
|---|---|---|
| 0001 | `0001_extensions_and_helpers.ts` | Postgres extensions + `set_updated_at()` trigger helper; establishes UUIDv7 ID convention |
| 0002 | `0002_identity_and_trust.ts` | `users`, `user_roles`, `profiles_tutor`, `profiles_student`, `tutor_verifications`, `consent_records` |
| 0003 | `0003_catalog.ts` | `subjects`, `curricula`, `grade_levels`, `tutor_subjects` |
| 0004 | `0004_scheduling.ts` | `tutor_availability`, `tutor_availability_exceptions`, `batches`, `enrollments`, `invites`, `class_sessions`, `attendance` |
| 0005 | `0005_delivery_and_assessment.ts` | `materials`, `assignments`, `submissions`, `announcements` |
| 0006 | `0006_billing_and_platform.ts` | `fee_ledger`, `subscriptions`, `audit_logs`, `notifications` |
| 0007 | `0007_auth_infra.ts` | Postgres-backed `otp_challenges` / `refresh_tokens` (pragmatic Phase-1 stand-in) |
| 0008 | `0008_drop_postgres_auth_infra.ts` | Drops 0007's tables — OTP/refresh-token storage moved to Redis instead |
| 0009 | `0009_seed_catalog.ts` | Seeds reference data: CBSE / TN State Board / ICSE curricula + subjects |
| 0010 | `0010_device_tokens.ts` | `device_tokens` (push tokens, android/ios) |
| 0011 | `0011_retool_readonly_role.ts` | `retool_readonly` Postgres role, SELECT-only grants for admin DB browsing via Retool — password set manually per environment, never committed |

Full column-level detail for these is in [`BLUEPRINT 2.md`](../BLUEPRINT%202.md) §7 — this table exists only to keep migration ordering visible alongside Phase 2+.

## Phase 2 — money + parents

| # | Migration | Adds |
|---|---|---|
| 0012 | `0012_phase2_billing_and_parents.ts` | `payments` (Razorpay fee-collection orders, FK to `fee_ledger`), `payouts` (tutor payout runs), `parent_child_links` (parent↔student, status + `consent_record_id`), `digests` (weekly AI parent digest — narrative + stats, unique per parent/student/period) |
| 0013 | `0013_messaging.ts` | `messages` — thread keyed by `(batch_id, student_id)`, `sender_role` constrained to tutor/student/parent. Enforces "no unmonitored adult↔minor DM" at the schema level, not just in application code |
| 0014 | `0014_subscription_payments.ts` | Alters `payments`: `fee_ledger_id` becomes nullable, adds `subscription_id` + `plan_id`, adds an XOR check constraint (a payment settles exactly one target) |
| 0015 | `0015_payouts.ts` | Adds `payments.payout_id` (which payout aggregated a captured payment); adds `tutor_payout_accounts` (Razorpay Route linked-account KYC status) |

## Phase 3 — student depth + parent premium

| # | Migration | Adds |
|---|---|---|
| 0016 | `0016_quiz_drafts.ts` | `quiz_drafts` (tutor_id, material_id, batch_id, status pending_review/approved/rejected), `quiz_draft_questions` (MCQ text, choices JSONB, correct_choice_index, difficulty) — AI-generated, never student-visible until approved |
| 0017 | `0017_student_quizzes.ts` | `quizzes` (published/immutable snapshot of an approved draft), `quiz_questions`, `quiz_attempts` (one attempt per student per quiz, auto-graded) |
| 0018 | `0018_doubt_solver.ts` | Enables `vector` extension. `material_chunks` (pgvector `vector(1024)`, HNSW cosine index, Voyage AI voyage-3 embeddings), `ai_interactions` (Socratic-gate audit trail — 'hint' vs 'full_answer' rows, token counts, `flagged` bool, self-referencing `parent_id`) |
| 0019 | `0019_parent_premium.ts` | `parent_premium_subscriptions` (no trial concept, starts `inactive`); widens `payments` XOR check to three-way, adding `parent_subscription_id` |

## Phase 4 — marketplace (density-gated)

| # | Migration | Adds |
|---|---|---|
| 0020 | `0020_tutor_locations.ts` | Enables `postgis` extension. `tutor_locations` (city, area_label, lat/lng, `geog geography(Point,4326)` + GIST index) — deliberately no FK to bookings/reviews |
| 0021 | `0021_bookings.ts` | `bookings` (1:1 session: tutor/student/subject, snapshotted hourly_rate/amount/platform_fee, status `pending_payment`→`confirmed`→`completed`/`cancelled`/`no_show`, reschedule tracking, `refund_percent`); widens `payments` XOR check to four-way, adding `booking_id` |
| 0022 | `0022_booking_waitlists.ts` | `booking_waitlists` (tutor_subject_id + student_id, status `waiting`/`notified`/`converted`/`expired`/`cancelled`, partial unique index limiting one active row per pair, `converted_booking_id`) |
| 0023 | `0023_reviews.ts` | `reviews` (tutor_id, student_id, rating 1–5, comment, unique per tutor/student pair — a repeat review updates in place rather than duplicating) |
| 0024 | `0024_marketplace_discovery_indexes.ts` | Indexes on `tutor_subjects.subject_id`/`curriculum_id`, `profiles_tutor.verification_status` (partial, verified only), `reviews.student_id` — the public marketplace search had none, a sequential scan on the highest-traffic query |

## Post-launch — auth channels

| # | Migration | Adds |
|---|---|---|
| 0025 | `0025_otp_contact_channels.ts` | `users.telegram_chat_id` (nullable) — Email OTP already had `users.email` (0002) to send to; Telegram needed its own per-user destination the same way |

## `payments` XOR settlement target

The `payments` table is shared across four money paths and enforces via check constraint that exactly one of these is set per row: `fee_ledger_id` (0012) → `subscription_id`/`plan_id` (0014) → `parent_subscription_id` (0019) → `booking_id` (0021). Each migration widened the same constraint rather than creating a parallel table — check the latest migration (`0021`) for the current constraint definition before adding a fifth settlement target.

## Extensions in use

- `vector` (pgvector) — doubt-solver RAG embeddings, migration 0018
- `postgis` — marketplace geo-search, migration 0020
- Both are layered onto the base Postgres 16 image in `docker/postgres.Dockerfile` (`postgis/postgis:16-3.4` base + pgvector added on top), so one container serves both.

## Running migrations

```bash
cd backend
npm run migrate:up      # apply all pending
npm run migrate:down    # roll back the last migration
```
