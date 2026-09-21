# Teaching contexts — Individual vs Academy

One Scholar account, separate contexts. Migrations `0040_teaching_contexts`, `0041_academy_subscriptions`.

> **Primary rule.** A teacher has one Scholar account but separate Individual and Academy teaching contexts.
> Individual teaching is paid for and managed by the teacher and stays completely private. Academy teaching is paid
> for by the Academy and belongs to that Academy. The teacher can switch between them, but the data, ownership,
> billing, permissions and activity of one context never leak into or clash with the other.

## Ownership model

`tutor_id` says **who taught** something. It is not an ownership boundary — the same `tutor_id` appears on
Individual and Academy rows. The **context** is an explicit, immutable column on the root record:

| Root record   | Column                | Meaning                                          |
|---------------|-----------------------|--------------------------------------------------|
| `batches`     | `academy_id` (nullable) | `NULL` = Individual, set = owned by that academy |
| `assessments` | `academy_id` (nullable) | same; all its batches must share the context     |

Everything hanging off a batch — `class_sessions`, `enrollments`, `attendance`, `teacher_attendance`, `invites`,
`materials`, `fee_ledger`, `quizzes`, `announcements`, `messages`, cancellations, leave-request session snapshots —
derives its context from `batches.academy_id` through its `batch_id`. There is one place the context is stored, so a
denormalised copy can never drift, and because `academy_id` is immutable no downstream row ever changes context.

Database enforcement (migration 0040), independent of application code:

* `academy_id` cannot be updated after insert (`batches`, `assessments`) — no Individual⇄Academy conversion, no
  reassigning to another academy, and leaving an academy moves nothing.
* `assessment_batches` — an assessment can't straddle two contexts.
* `holiday_batches` — a holiday can only target batches its academy owns.
* `teacher_leave_request_sessions` — a leave request can only snapshot its academy's classes.
* `academy_announcements.audience_batch_id` — must be one of that academy's batches.
* `batches.academy_id` is `ON DELETE RESTRICT`: an academy that owns batches can't be deleted from under its history.

**No backfill.** Every batch/assessment that existed before the migration stays Individual. Membership alone is never
read as ownership, and nothing marked "created from the academy dashboard", so guessing could expose a teacher's
private data. Academy batches are created in the Academy context from now on.

## Who can reach what

* **Academy side** — every Academy read/write is keyed by `batches.academy_id = <caller's academy>` (resolved from
  the JWT's `owner_user_id`, never from the client), never by `tutor_id IN (active members)`. A foreign or Individual
  id is *not found* (404), read or write. Repositories: `listForAcademy`, `listEnrollmentsForAcademy`,
  `listForAcademyBetween`, `listScheduledForAcademyBetween`, `findByIdInAcademy`, `getAcademyBatch` …
  Academy views also cover historical records of teachers who have since left.
* **Teacher side** — the browser sends `X-Teaching-Context: individual | academy:<id>` on every request
  (`web/src/lib/api.ts`). `TeachingContextScope()` (guard + interceptor) verifies it — an academy context is only
  honoured for an **active** member — and `BatchesService.getOwnedBatch` (the choke point every batch-addressed
  teacher operation goes through) rejects a batch from the *other* context. A missing header means Individual.
  Lists (`/batches/me`, `/sessions/me`, `/fees/period`, `/assessments/*/me`, `/messages/mine`, …) return one
  context's data only.
* **Leaving** ends the teacher's Academy context (`GET /teaching-contexts/me` no longer offers it; the academy's
  batches are no longer operable by them) but deletes/moves nothing. Rejoining restores only that academy's records.

## Billing

| Context    | Payer   | Plan table              | Gate                                            |
|------------|---------|-------------------------|-------------------------------------------------|
| Individual | teacher | `subscriptions`         | `ActiveSubscriptionGuard` when context is Individual |
| Academy    | academy | `academy_subscriptions` | same guard when the context is an academy; also the academy dashboard's own batch creation |

Neither is consulted for the other. Trial-recap numbers (value recap, proof-of-teaching, payouts) count Individual
activity only. **Not built:** an Academy plan checkout — `academy_subscriptions` gets a 90-day trial lazily, and
nothing moves a row to `active` yet.

## Tests

* `backend/test/teaching-contexts.e2e-spec.ts` — boots the real app + dev DB, drives it over HTTP, covers the 16
  required scenarios plus DB-trigger and public-discovery checks. `npx jest --config ./test/jest-e2e.json test/teaching-contexts.e2e-spec.ts --runInBand`
* `backend/src/modules/teaching-context/teaching-context.spec.ts` — context parsing/verification and `getOwnedBatch` rules.
* Existing academy/holiday/leave unit specs were rewritten around the academy-id boundary.
