# Scholar — Complete System Bulletin

> **Update 2026-09-21 — ownership model changed.** This document describes the system as audited on 2026-09-16. Since then batches (and assessments) carry an explicit, immutable `academy_id` (NULL = the teacher's Individual context) and the Academy side is scoped by it instead of by "batches of my active teachers". Statements below that say a batch/session/student row "never points at an academy_id", that the Academy is only a delegation layer over teacher-owned data, or that academy stats span every member teacher's data, are **superseded** — see `docs/teaching-contexts.md`.

> Audit date: 2026-09-16. This document describes the Scholar application **exactly as its code exists today** (backend: NestJS in `backend/src`, frontend: Next.js in `web/src`). It does not describe a planned or hypothetical architecture. Every claim below was checked against actual source files; file:line citations are given where useful for verification. Nothing here was fixed or changed as part of producing this document — it is audit output only.

---

## 1. What Scholar Does

Scholar is a tuition/coaching marketplace and management platform for India, connecting five kinds of people:

- **Independent tutors** ("Teachers") who run their own batches (classes) of students, on the platform's own scheduling/attendance/materials/fees tools, and who can also be discovered by new students through a marketplace.
- **Coaching academies** ("Academy Admins") — organizations that employ multiple tutors and want one dashboard to manage all of them, their combined students, parents, timetable, attendance, leave, holidays, and announcements.
- **Students**, who enroll in batches (either an independent tutor's or one taught under an academy), attend classes, do homework/quizzes, and can browse the marketplace to find a new tutor or academy.
- **Parents**, who link to their children's student accounts (with explicit consent, per India's DPDP Act 2023), and get a read-mostly view of their child's classes, attendance, fees, and progress.
- **Super Admin** (one hardcoded operator account) who can see and manage every user on the platform, impersonate any account for support purposes, and administratively manage academies at the backend level.

The core loop is: a tutor (independently or as an academy's member) creates a **batch**, students **enroll** (via an invite link or marketplace booking), the tutor schedules **class sessions**, records **attendance**, assigns **homework/quizzes**, and the platform layers on billing, discovery/marketplace, reviews, messaging, holidays, teacher leave, and notifications on top of that same data.

---

## 2. Dashboards

Five distinct portals exist, each its own Next.js route tree, its own sidebar, and its own guarded backend surface:

| Portal | Route | Backend role | Who |
|---|---|---|---|
| Super Admin | `/admin` | `superadmin` | The one seeded operator account |
| Academy Admin | `/academy` | `academy` | An academy's owner account |
| Teacher (called "tutor" in the backend) | `/dashboard` | `tutor` | An independent or academy-affiliated teacher |
| Student | `/student` | `student` | A learner |
| Parent | `/parent` | `parent` | A student's parent/guardian |

A single **user account** can hold **multiple roles** at once — roles are stored in a separate `user_roles` join table (`backend/src/database/migrations/0002_identity_and_trust.ts:22-29`), not baked into the `users` row. In practice this matters for exactly one case in the current app: an academy owner's account also gets a `tutor`-adjacent `academy` role grant, and a superadmin bypasses every `@Roles(...)` check on every route (`backend/src/modules/identity/auth/guards/roles.guard.ts:26-32`).

All authentication is **passwordless email/phone OTP** (no passwords anywhere in the schema) — see §11/§17 for detail. Every dashboard's route guard is a **client-side convenience only**; the real enforcement is the backend's `@Roles(...)` guard on each endpoint.

---

## 3. Dashboard Connection Map

This is not a strict management hierarchy — it is closer to a set of independent relationships that share underlying data:

```
SUPER ADMIN
   │  sees/manages ALL users platform-wide (no academy scoping)
   │  can impersonate any tutor/student/parent
   │  (backend-only: can also manage academies directly — no frontend page)
   ▼
ACADEMY ADMIN  ──manages (delegated permission, NOT ownership)──▶  batches/students/sessions
   │
   │  active membership (academy_memberships table)
   ▼
TEACHER (tutor) ──owns──▶ BATCHES ──enrolls──▶ STUDENTS ──consent-linked──▶ PARENTS
```

Concretely:

- **Super Admin → everyone**: `/admin/teachers`, `/admin/students`, `/admin/parents` list *every* account on the platform with no per-academy filter — this is genuinely cross-academy (`backend/src/modules/admin/admin.controller.ts`). Super Admin can also impersonate any of them (mints a scoped 15-minute JWT, `backend/src/modules/admin/admin.service.ts:52-103`) and hard-delete an account. A **separate, superadmin-only backend controller** (`backend/src/modules/marketplace/academies/academy-admin.controller.ts`, prefix `admin/academies`) can create/edit any academy, link an owner, and manage memberships directly — but **there is no frontend page for this**; it is reachable only via direct API calls today.
- **Academy Admin → Teachers/Students/Parents**: an Academy Admin never owns a batch, student enrollment, or session directly. Every one of these is still owned by a `tutor_id` on the underlying row. The Academy dashboard is a **delegation layer**: `AcademyOwnerBatchesService` resolves "my academy" from the caller's JWT, checks the target tutor is an *active* member of that academy, and then calls the exact same `BatchesService`/`SessionsService`/`InvitesService` methods a tutor would call for themselves (`backend/src/modules/marketplace/academy-owner/academy-owner-batches.service.ts:20-32,56-80`). This is a deliberate, explicit invariant repeated across the codebase's history: **academy and tutor data never merge**.
- **Teacher → Batches → Students → Parents**: a tutor creates batches; students enroll via invite link or marketplace booking; a parent links to a student via an invite token generated on the student's side, then must grant explicit DPDP consent before the link becomes "active" and usable.
- **Academy ↔ Teacher membership**: a teacher requests to join an academy (`academy_membership_requests`, status pending/accepted/rejected); the academy owner accepts or rejects; only on accept does a row appear in `academy_memberships` (status active/left). Removing a teacher from an academy only flips this row to `'left'` — it never touches the teacher's own batches, students, reviews, or profile.

---

## 4. Feature Connection Map

| Feature | Owner Dashboard | Connected Dashboard(s) | Backend module | Database | Notifications |
|---|---|---|---|---|---|
| Batches | Teacher (owns), Academy (delegated manage) | Student (enrolled), Parent (via child) | `scheduling/batches` | `batches`, `enrollments` | none on create; archive has none either |
| Students | Teacher, Academy (delegated) | Parent, Academy | `scheduling/batches`, `admin` | `users`, `profiles_student`, `enrollments` | — |
| Teachers | Academy (membership mgmt), Super Admin (platform-wide) | — | `marketplace/academy-memberships`, `admin` | `users`, `profiles_tutor`, `academy_memberships` | `academy_join_request/accepted/rejected` |
| Parents | Student (link), Academy (read-only view) | Teacher (indirect, via attendance alerts) | `parents` | `parent_child_links`, `consent_records` | `attendance_absence_alert` |
| Timetable / Calendar | Teacher, Academy | Student, Parent (read) | `scheduling/sessions` | `class_sessions` | `class_reminder` |
| Sessions/Classes | Teacher (owns), Academy (delegated create/cancel) | Student, Parent | `scheduling/sessions` | `class_sessions` | `class_reminder`, cancellation notifications |
| Attendance | Teacher (records) | Student, Parent (view), Academy (monitor) | `scheduling/attendance` | `attendance` | `attendance_absence_alert` (parent only, ≥3 absences/30 days) |
| Teacher Leave | Teacher (applies), Academy (approves/rejects) | Student/Parent (affected classes) | `holidays` (teacher-leave), `marketplace/academy-owner` (approval) | `teacher_leave_requests`, `teacher_leave_request_sessions` | `teacher_leave_requested/approved/rejected`, `class_cancelled_leave`/`class_substitute` |
| Holidays | Academy (declares academy holidays), System (govt, cron) | Student, Parent, Teacher | `holidays` | `holidays`, `holiday_batches` | `academy_holiday`/`government_holiday`, `holiday_class_reminder` |
| Class Cancellation | Teacher (manual), System (holiday), Academy (via leave approval) | Student, Parent | `scheduling/sessions`, `holidays` | `class_sessions.cancellation_reason` | see §5/Flow G |
| Class Reminders | System (cron) | Student, Parent | `reminders` | reads `class_sessions` | `class_reminder`, `class_cancelled_reminder`, `holiday_class_reminder` |
| Announcements (NEW, academy-wide) | Academy | Teacher, Student, Parent (as audience) | `marketplace/academy-owner` (announcements + recipient view) | `academy_announcements` | `academy_announcement` |
| Announcements (OLD, batch-scoped) | Teacher | Student only (not Parent) | `delivery/announcements` | `announcements` | `announcement` |
| Notifications | System-wide | All portals | `notifications` | `notifications`, `device_tokens` | (the delivery mechanism itself) |
| Messaging | Teacher, Student, Parent | — | `messaging` | `messages` | `new_message` |
| Contact Requests | Student/Parent (initiate) | Teacher or Academy (receive) | `marketplace/discovery`, `marketplace/academies` | `teacher_contact_requests`, `academy_contact_requests` | `teacher_contact_request`, `academy_contact_request_received` |
| Academy Profile | Academy | Student/Parent (public view) | `marketplace/academies`, `marketplace/academy-owner` | `academies` | — |
| Verification (Teacher) | Teacher | Academy, Super Admin/Trust&Safety (review) | `trust/verifications` | `tutor_verifications` | — |
| Verification (Academy KYC) | Academy | Super Admin/Trust&Safety (review) | `marketplace/academy-verification` | `academy_kyc_verifications` | — |
| Photos | Academy, Teacher (profile only) | Student/Parent (public view) | `marketplace/academy-owner`, presigned upload | `academy_photos` | — |
| Reviews | Student (writes) | Teacher or Academy (subject), public | `marketplace/reviews`, `marketplace/academy-reviews` | `reviews`, `academy_reviews` | none — no moderation |
| Reports | Academy | — | `marketplace/academy-owner` (reports) | reads across many tables | — |
| Account | Every portal | — | `account` | reads across owned tables (DPDP export/delete) | — |
| Settings | Every portal | — | varies per portal | varies | — |
| Billing / Fees | Teacher (fee tracking + Razorpay collection) | Parent (pays/views), Academy (reports) | `billing/fees`, `billing/payments` | `fee_ledger`, `payments`, `subscriptions` | — |
| Marketplace/Discovery | Teacher, Academy (public listing) | Student, Parent (search/contact) | `marketplace/discovery` | reads `tutor_subjects`/`academies` | `teacher_contact_request` |
| Bookings/Waitlists | Student (books) | Teacher | `marketplace/bookings`, `marketplace/waitlists` | `bookings`, `booking_waitlists` | `waitlist_slot_open` |
| Progress dashboard | Student | Parent (consent-gated view) | `progress` | reads attendance/assignments/quizzes | — |
| Quizzes/Assignments | Teacher (creates, incl. AI-drafted) | Student (does), Parent (progress view) | `assessment` | `assignments`, `submissions`, `quizzes`, `quiz_attempts`, `quiz_drafts` | `assignment_created`, `submission_graded`, `quiz_published` |
| AI Doubt Solver | Student | (Parent Premium gates "ask a tutor" hint) | `ai` / doubt-solver | `ai_interactions`, `material_chunks` | — |
| Parent Premium | Parent | Student (doubt-solver gate) | `billing/payments` (parent-premium) | `parent_premium_subscriptions` | — |

---

## 5. End-to-End Workflows

### Flow A — Teacher Creates/Uses a Class

1. Tutor calls `SessionsService.create` (`backend/src/modules/scheduling/sessions/sessions.service.ts:21-50`), which verifies they own the batch, expands any recurrence rule into concrete UTC occurrences, checks for scheduling conflicts (same tutor or same batch double-booked), then inserts the whole series in one transaction (`sessions.repository.ts:31-62`) — the first occurrence is the "parent" row; the rest reference it via `recurrence_parent_id`.
2. **No notification fires at creation time.** Students/parents only hear about an upcoming class 10 minutes before it starts, via the reminder cron (Flow described in §7, "class_reminder").
3. The session immediately appears on: the tutor's own Calendar/Timetable, the batch's Student Workspace schedule, the Parent's "What's next" (via a consent-gated read endpoint), and (if the tutor is an academy member) the Academy's Calendar/Timetable, which reads across every active member tutor's sessions via `GET /academy/me/sessions`.
4. Attendance can only be recorded once the session exists; a substitute tutor can later be attached to it via the Teacher-Leave approval flow (Flow E), which does not create a new session — it mutates the existing row's `substitute_tutor_id`.

### Flow B — Academy Creates/Manages a Batch

A batch is **always** created under a specific tutor_id, never under the academy itself. When an Academy Admin uses the Batches page, `AcademyOwnerBatchesController` first resolves the caller's own academy (`resolveOwnAcademy`, from `owner_user_id`, never from a client-supplied id), validates the chosen tutor is an *active* member, then calls `BatchesService.create(tutorId, dto)` — the identical method a tutor uses for themselves. Visibility: the batch shows up on that tutor's own Batches page immediately (nothing academy-specific is stored on the batch row itself); it appears on the Academy's Batches/Students/Timetable pages because those pages fan out across every active member tutor's data. **Archiving a batch only flips `batches.status`** — it does **not** cascade to existing enrollments (left untouched, still `active`) or to already-scheduled sessions (left untouched, still `scheduled`); it only blocks *new* enrollments going forward.

### Flow C — Student Joins/Is Enrolled in a Batch

1. Tutor (or an academy admin acting for that tutor) generates an invite: `InvitesService.create` — random token, default 30-day expiry, default 50 max uses.
2. A student can preview the invite (`GET` by token, unauthenticated) to see the batch title before committing.
3. On redeem, `InvitesRepository.claimUse` does an **atomic conditional UPDATE** (`WHERE used_count < max_uses AND expires_at > now()`) so two students racing for the last slot can't both succeed — only one claim wins.
4. A successful claim calls `BatchesService.enroll`, which re-checks the batch is `active` and has capacity, then upserts an `enrollments` row (reactivating a previously-left enrollment if the student had left before).
5. Chain of visibility: Student ↔ Batch (enrollment row) ↔ Teacher (batch's `tutor_id`) ↔ Academy (if that tutor is an active member) ↔ Parent (only once a separate parent-child link is active, and only for that specific child).

### Flow D — Attendance

1. Teacher marks attendance manually (`AttendanceService.markManually`) or the student self-marks via a "Join" tap (`joinSession`, sets `status='present', method='join_tap'`) — both reject a cancelled session and require active enrollment.
2. **Normal attendance marking (present/late/absent) generates no notification at all.** The only exception:
3. `maybeAlertOnRepeatedAbsence` fires **only** when a mark is `'absent'`: it counts absences for that student in that batch over a trailing 30-day window, and once the count reaches **3**, sends a `attendance_absence_alert` — but **only to the student's actively-linked parent(s), never to the student or the tutor** — and dedupes so a given parent gets at most one alert per (student, batch) pair per rolling 30-day window even if further absences accrue.
4. Academy attendance monitoring (`/academy/me/attendance`) and reports are read-only aggregations across every active member tutor's `attendance` rows — no separate storage.

### Flow E — Teacher Leave

1. Teacher applies (`TeacherLeaveService.create`): the affected sessions are computed **at request time** and snapshotted into `teacher_leave_request_sessions` — for a full-day leave, every scheduled session that day; for specific classes, the caller's chosen session ids intersected with that day's actual sessions (so a client can't smuggle in someone else's sessions). The academy owner is notified (`teacher_leave_requested`), best-effort.
2. Academy Admin approves or rejects. Both actions use an **atomic conditional UPDATE** (`WHERE status='pending'`) so two concurrent decisions on the same request can't both succeed (a confirmed fix for a previously-reported double-decide race — see §16).
3. **Approve, with a substitute assigned**: the affected sessions stay `status='scheduled'` — `substitute_tutor_id` is set and the session is **not** cancelled. Students/parents get `class_substitute`.
4. **Approve, no substitute**: affected sessions are cancelled (`cancellation_reason='teacher_leave'`). Students/parents get `class_cancelled_leave`.
5. **Reject**: only the leave request's own status changes — the snapshotted sessions are left completely untouched (still scheduled, teacher still expected to teach). Only the tutor is notified (`teacher_leave_rejected`).
6. **Withdraw** (teacher-initiated, only while still pending): no session mutation, no notification to students/parents.
7. All of this then surfaces on the Calendar (substitute name or cancellation badge) and, if a class is still upcoming, on the 10-minute reminder cron (which sends a different message for a leave-cancelled class vs. a substituted one — a substituted class still gets the normal `class_reminder`, naming the substitute).

### Flow F — Holiday

**Government holiday**: seeded, TN-2026 data only (23 rows), scoped by `country_code`/`state_code` (a `state_code=NULL` row is national). Applied by a **daily cron at midnight IST**, but *only* for academies that have opted in via `auto_observe_govt_holidays` — it is never automatic platform-wide. When it fires, every scheduled session that day for that academy's active tutors gets cancelled (`cancellation_reason='government_holiday'`), and every affected student/parent/teacher is notified once (deduped by holiday+academy id, so a re-run of the sweep is safe).

**Academy holiday**: declared by an Academy Admin (single day or range, whole-academy or specific batches), and applied **immediately** at creation time — not on a delayed sweep. Same cancellation + notification mechanics as government holidays, tagged `cancellation_reason='academy_holiday'`.

Neither type ever assigns a substitute — that mechanic exists only for Teacher Leave. Both later also trigger a grouped `holiday_class_reminder` from the same 10-minute reminder cron (grouping several affected classes for one recipient into a single message, not one per class).

### Flow G — Class Cancellation (every reason currently supported)

| Reason | Who triggers | `cancellation_reason` value | Notified? | Substitute possible? | Reversible? |
|---|---|---|---|---|---|
| Manual, single class | Owning tutor | `manual` | No immediate notification (only later via reminder cron if still upcoming) | No | No un-cancel exists |
| Manual, whole recurring series | Owning tutor | `manual` | Same as above | No | No |
| Academy holiday | Academy Admin (on declare) | `academy_holiday` | Yes, immediately | No | No |
| Government holiday | System cron (opt-in per academy) | `government_holiday` | Yes, immediately | No | No |
| Approved teacher leave, no substitute | Academy Admin (on approve) | `teacher_leave` | Yes, immediately (`class_cancelled_leave`) | N/A (absence of one is the trigger) | Academy can later call "assign substitute" to un-cancel it |

A rejected or withdrawn leave request **never** cancels anything. Archiving a batch **never** cancels its sessions.

### Flow H — Announcement (the NEW academy system)

1. Academy Admin authors an announcement (title/body) and picks exactly one audience: `academy` (everyone), `teachers`, `students`, `parents`, `batch` (one specific batch), `teacher` (one specific teacher), or `student` (one specific student) — enforced by a database CHECK constraint that only the matching target-id column may be non-null.
2. On publish, `resolveRecipients` computes a `Set` of user ids for that audience (e.g. `batch` → that batch's enrolled students ∪ their active parents; `academy` → union of all active teachers, students, and parents). The `Set` construction plus a `SELECT DISTINCT` on the parent-lookup query means **a parent with two children in the same batch is only notified once** — verified, not assumed.
3. `notify()` fans out to every resolved user id (`academy_announcement`), then the transient recipient set is discarded — **no per-recipient row is ever persisted**.
4. A recipient reads the announcement later via `GET /announcements/:id`, open to any authenticated role. Access is granted purely by **proof of receipt**: the endpoint checks whether that user has an `academy_announcement` notification whose payload names this announcement id. No such notification → 404, indistinguishable from "doesn't exist." This means there is **no "list my announcements" inbox** — only fetching one by id, as reached from tapping a notification.

This is entirely separate from the **OLD** batch-scoped announcement system (`delivery/announcements`), which any tutor still uses today for their own batches: single audience (that batch's enrolled students only — **parents are never notified** by the old system), no draft/publish state (live the instant it's created), no title field. The two systems share no table, no repository, and no notification type string.

---

## 6. Notification System

`NotificationsService.notify()` (`backend/src/modules/notifications/notifications.service.ts:34-74`) is the single fan-out point every feature above uses. Every call:
- **Always** writes one row per recipient into the `notifications` table (this is the in-app inbox/bell).
- **Always attempts** a push notification via whichever provider is configured.
- **Always attempts** a WhatsApp send via whichever provider is configured.
- Each channel's failure is caught independently — a push or WhatsApp failure never blocks the in-app row or the other channel.

There is **no caller-selectable channel list** and **no email channel** inside this service. The only email in the whole app is the OTP login code (via Brevo), which is a completely separate subsystem that never touches the `notifications` table.

**Push**: real, working Firebase Cloud Messaging integration (`FcmPushProvider`) when a service-account credential is configured; otherwise falls back to a console-log-only provider. Automatically prunes device tokens FCM reports as stale/invalid.

**WhatsApp**: **always** a no-op — `ConsoleWhatsAppProvider` just logs the message; there is no config toggle to a real provider because none has been built yet (a clean interface exists for one, deliberately mirroring how the push provider is swapped). **Any claim that a notification "sends via WhatsApp" should be read as "would send, once a real provider is implemented" — today it only logs.**

**Deduplication** is not built into `notify()` itself — every caller that needs "don't repeat this" implements the same pattern: look up that user's recent notifications of the same type (via `listRecentForUserByType`) and skip if a matching domain key (session id, holiday id, announcement id, etc.) is already present in an existing notification's payload within a bounded lookback window.

### Complete Notification Matrix

| Event | Triggered by | Recipient(s) | In-app | Push | WhatsApp | Email | Dedup |
|---|---|---|---|---|---|---|---|
| OTP login code | System (auth) | The user logging in | No | No | No | **Yes** (only email channel in the app) | N/A — separate subsystem |
| New message in monitored thread | Teacher/Student/Parent (sender) | Every other thread participant | Yes | Yes (best-effort) | Yes (no-op today) | No | None |
| Teacher leave requested | Teacher | Academy owner | Yes | Yes | Yes (no-op) | No | None (best-effort try/catch) |
| Teacher leave approved | Academy Admin | The tutor | Yes | Yes | Yes (no-op) | No | None |
| Teacher leave rejected | Academy Admin | The tutor | Yes | Yes | Yes (no-op) | No | None |
| Class cancelled (leave, no substitute) | Approval side-effect | Batch's students + active parents | Yes | Yes | Yes (no-op) | No | None found beyond the reminder cron's own dedup |
| Class substitute assigned | Approval side-effect | Batch's students + active parents | Yes | Yes | Yes (no-op) | No | None |
| Academy/government holiday cancels classes | Academy Admin (declare) / System cron (govt, opt-in) | Affected students, parents, teachers | Yes | Yes | Yes (no-op) | No | Per-user, by holiday+academy id |
| Class reminder (10 min before, not cancelled) | System cron, every minute | Batch's students + active parents | Yes | Yes | Yes (no-op) | No | Per session id, 1h lookback |
| Cancelled-class reminder (10 min before) | System cron | Same | Yes | Yes | Yes (no-op) | No | Per session id |
| Holiday-caused reminder, grouped | System cron | Same | Yes | Yes | Yes (no-op) | No | Per session id(s), grouped per recipient |
| Repeated-absence alert (≥3/30 days) | Teacher marks a 3rd+ absence | Student's active parent(s) only | Yes | Yes | Yes (no-op) | No | Per (student, batch), 30-day window |
| Academy announcement published | Academy Admin | Resolved audience (see Flow H) | Yes | Yes | Yes (no-op) | No | None (relies on publish being one-time) |
| Academy join request | Teacher requests to join | Academy owner (if one exists) | Yes | Yes | Yes (no-op) | No | Best-effort only |
| Academy join accepted / rejected | Academy Admin decision | The requesting teacher | Yes | Yes | Yes (no-op) | No | None |
| Academy contact request received | Student/Parent lead form | Academy owner (**silently dropped if no owner linked**) | Yes | Yes | Yes (no-op) | No | None |
| Teacher contact request (Find a Teacher) | Student/Parent lead form | The tutor | Yes | Yes | Yes (no-op) | No | None |
| Waitlist slot opens | System (booking cancelled/freed) | Waitlisted student(s), 24h exclusivity window | Yes | Yes | Yes (no-op) | No | Implicit via waitlist status transitions |
| Quiz published | Teacher | Active students in batch | Yes | Yes | Yes (no-op) | No | None |
| Assignment created | Teacher | Active students in batch | Yes | Yes | Yes (no-op) | No | None |
| Submission graded | Teacher | The submitting student | Yes | Yes | Yes (no-op) | No | None |
| OLD batch announcement posted | Teacher | Active students in batch only (never parents) | Yes | Yes | Yes (no-op) | No | None |

**Deep-link destination**: each portal's nav config maps a notification `type` to a frontend route (e.g. `academy_announcement` deep-links to the announcement detail page on Teacher/Student/Parent, but is deliberately mapped to nothing on the Academy portal itself, since that type never targets the academy's own inbox).

---

## 7. Academy Dashboard

Route `/academy`, role `academy`, self-serve (an account gets the `academy` role at signup and creates its own academy via the Profile page's creation form — the only place that form renders).

Sidebar (`web/src/components/dashboard/academy-nav.ts`), verified against the live nav config:

- **Main**: Today · Teachers · Students · Parents · Contact Requests
- **Academy**: Academy Profile · Verification · Photos · Reviews
- **Academic**: Batches · Timetable · Attendance · Calendar · Leave Requests · Holidays
- **Communication**: Announcements · Notifications
- **Reports**: Reports
- **Footer**: Settings · Account

Every single page in this portal calls a real, specific `/academy/me/...` backend endpoint (or a shared `/notifications`, `/marketplace/...`, `/account/...` endpoint) — **no placeholder/"coming soon" page exists anywhere in this dashboard.** Highlights:

- **Today**: aggregates stats, pending teacher requests, contact requests, active teachers, today's/upcoming sessions across every member tutor, and today's attendance summary in one batched fetch.
- **Teachers**: active/pending/removed membership tabs; accept/reject a join request; remove an active member (only flips membership to `left`, never deletes the teacher's own data).
- **Batches/Students**: full CRUD via the tutor-delegation pattern described in §3/Flow B.
- **Leave Requests**: approve (optionally with a substitute)/reject pending teacher leave; scoped strictly to the caller's own academy (verified fixed IDOR — see §16).
- **Holidays**: declare an academy holiday (immediately cancels + notifies affected classes) or view government holidays; toggle auto-observance in Settings.
- **Announcements**: full author/publish/archive workflow for the new academy-wide announcement system (§5 Flow H).
- **Verification**: academy KYC (PAN/optional GSTIN) — an automated check that is either real (via Setu, if configured) or a format-only mock, followed by a human reviewer fallback for anything not an unambiguous pass.
- **Reviews**: read-only display of student reviews of the academy (no moderation exists).
- **Reports**: read-only aggregations (students/teachers/batches/attendance/sessions/leave/holidays/contact-requests) — genuinely computed from live data, not mocked.

---

## 8. Teacher Dashboard

Route `/dashboard` (backend role `tutor`).

Sidebar (`web/src/components/dashboard/teacher-nav.ts`):

- **Main**: Today · Batches · Students · Calendar · Messages
- **Teaching**: Teacher Profile · Subjects & Rates · Availability · Leave · Materials · Quizzes
- **Business**: Fees · Earnings · Marketplace
- **Trust**: Verification
- **Footer**: Settings · Account
- (No sidebar entry, but reachable): Subscription & Billing, Find an Academy, individual Class/Assignment/Announcement detail pages.

Every page verified real (no placeholders found). Connections: Batches/Students/Sessions/Attendance are the tutor's own data, which the Academy dashboard can read/manage-by-delegation if the tutor is an active academy member; Leave requests go to the academy for approval if affiliated; Materials/Quizzes/Announcements are batch-scoped and visible to that batch's enrolled students; Marketplace/Verification/Subjects feed the public discovery listing and Proof-of-Teaching ranking score; Fees/Earnings/Billing are the tutor's own Razorpay-backed fee tracking and subscription payments.

---

## 9. Student Dashboard

Route `/student`.

Sidebar (`web/src/components/dashboard/student-nav.ts`):

- **Main**: Today
- **Discover**: Find a Teacher · Find an Academy
- **My Learning**: My Batches · Schedule · Assignments · Quizzes · Materials
- **Progress**: Attendance · Announcements · Doubts & Help
- **Footer**: Settings (a thin stub deferring to Account) · Account

Notable architecture: each enrolled batch gets a full **Batch Workspace** (`/student/batches/[id]/{overview,schedule,assignments,materials,quizzes,attendance,announcements,doubts}`) built from the same shared list components the global "all batches" pages use, just scoped to one batch — no duplicated logic.

Connections: sees the OLD batch announcements (not the new academy ones directly — those arrive via notification click-through) and the new academy announcements when it/they are the audience; attendance history feeds the parent's absence-alert notifications and the Progress dashboard; the AI Doubt Solver's "ask a tutor" (full-answer unlock) is gated behind the linked parent's Parent Premium subscription status (a real 402 response, not just a UI lock). No placeholder pages were found in this portal.

---

## 10. Parent Dashboard

Route `/parent`.

Sidebar (`web/src/components/dashboard/parent-nav.ts`):

- **Main**: Today
- **Discover**: Find a Teacher · Find an Academy
- **My Children**: Link a Child
- **Communication**: Messages
- **Premium**: Premium
- **Footer**: Settings (thin stub) · Account

**Parent → Child linking** (`/parent/link`): the parent enters an **invite token generated on the student's side** (not something the parent creates), redeems it (`POST /parent-links/redeem`), and — critically — the link is created in a `pending` state. It only becomes `active` (and thus usable to view any of the child's data) after the parent explicitly grants **DPDP Act 2023 consent** in a required second step (`POST /parent-links/:id/consent`). **One parent can link multiple children** (no uniqueness on parent alone, only on the parent+student pair), and the UI genuinely supports this: a `ChildSwitcher` component appears whenever a parent has 2+ active links, and the Today page fetches and aggregates data per active child.

**Two confirmed placeholder gaps** in an otherwise fully-real dashboard: the Today page's "Announcements" section and the Child-detail page's "Upcoming classes" section are both hardcoded empty states with no data fetch behind them — even though the Today page's own "What's next" section elsewhere *does* fetch real per-child session data. See §16.

**Parent Premium** is a real, Razorpay-backed paid feature — not a placeholder. It unlocks richer weekly digests and, cross-portal, is the actual paywall behind the Student dashboard's AI doubt-solver "ask a tutor" full-answer unlock (verified via a real HTTP 402 response, not just a UI-side lock).

---

## 11. Super Admin

Route `/admin`, role `superadmin`, granted to exactly one hardcoded account by a one-time migration (email/phone baked into `backend/src/database/migrations/0028_super_admin_seed.ts`). A dev-only auto-login endpoint (disabled in production, excluded from the production build) logs straight into this account with no OTP when running locally.

**Frontend** (`AdminShell` — a real top-nav shell, not bare pages): Dashboard (count cards), Teachers, Students, Parents. Each list is **platform-wide, no academy filter** — genuinely cross-academy. Each row supports "View Dashboard" (mints an impersonation token and opens that account's own dashboard) and "Delete" (hard-deletes the account, cascading via FKs).

**What Super Admin can modify**: grant impersonation tokens, hard-delete any non-superadmin account. Both actions write an entry to the DB-enforced append-only `audit_logs` table.

**What exists only in the backend, with no frontend page at all**: a full academy-management controller (create/edit any academy, link an owner account, manage memberships directly) and an academy-KYC review queue (`admin/academy-verifications`) — both gated `superadmin`/`trust_safety`, both fully implemented, neither reachable through `/admin/**` today. This is a genuine gap, not an oversight assumption — confirmed by an exhaustive grep of the frontend finding zero references to either route.

**Cross-academy access**: yes, explicitly and by design for the three controllers above — these are the only cross-academy surfaces in the app; every other "manage X" endpoint (Academy Admin's own `/academy/me/*`) is server-side scoped to the caller's own academy.

---

## 12. Database Relationship Map

54 tables across 37 migrations. Selected core relationships (see `docs/SCHOLAR_SYSTEM_MAP.md` for the visual):

```
users ──< user_roles                              (a user can hold many roles)
users ──1:1── profiles_tutor                       (no equivalent table for parent)
users ──1:1── profiles_student

academies ──(owner_user_id, nullable, unique)── users
academies ──< academy_memberships >── users        (active | left)
academies ──< academy_membership_requests >── users (pending | accepted | rejected)
academies ──< academy_kyc_verifications
academies ──< academy_photos, academy_contact_requests, academy_reviews

batches.tutor_id ── users                          (a batch always has exactly one owning tutor)
batches ──< enrollments >── users (student)
batches ──< class_sessions
class_sessions.holiday_id ──> holidays (nullable)
class_sessions.teacher_leave_request_id ──> teacher_leave_requests (nullable)
class_sessions.substitute_tutor_id ──> users (nullable)
class_sessions ──< attendance >── users (student)

holidays ──< holiday_batches >── batches           (junction, used when a holiday targets specific batches)
teacher_leave_requests ──< teacher_leave_request_sessions >── class_sessions  (junction, snapshotted at apply-time)

parent_child_links: users(parent) ──< >── users(student)   (consent-gated, many:many)

academy_announcements: nullable target columns (audience_batch_id/audience_teacher_id/audience_student_id) — exactly one set, enforced by a DB CHECK

fee_ledger / payments / payouts / subscriptions / parent_premium_subscriptions / bookings — all reference users + one of {fee_ledger, subscription, parent_subscription, booking} via an evolving "exactly one of" CHECK constraint on payments
```

Notable design choices: no `profiles_parent` table exists — a parent's identity is just their `user_roles` row plus whatever `parent_child_links` rows they have. Subjects "offered by an academy" are never stored directly; they are derived at read time from active member tutors' own `tutor_subjects`. IDs are app-generated UUIDv7 everywhere (not `gen_random_uuid()`), for future Postgres-provider portability.

---

## 13. Who Can See What

✅ = can view · ✏️ = can modify · — = no access. All server-enforced via `@Roles(...)` guards, not just UI hiding.

| Feature | Super Admin | Academy | Teacher | Student | Parent |
|---|---|---|---|---|---|
| Academy profile | ✅ (any, via backend-only endpoint) | ✏️ (own) | ✅ (public page) | ✅ (public page) | ✅ (public page) |
| Teachers | ✅ (all, platform-wide) | ✏️ (own academy's members) | ✏️ (own profile) | ✅ (public) | ✅ (public) |
| Students | ✅ (all) | ✅ (own academy's, via member tutors) | ✏️ (own batches' roster) | ✏️ (own) | ✅ (own child) |
| Parents | ✅ (all) | ✅ (own academy's students' parents) | — (no direct parent view) | — | ✏️ (own) |
| Batches | ✅ (via impersonation only) | ✏️ (delegated, own academy) | ✏️ (own) | ✅ (enrolled) | ✅ (child's) |
| Sessions/Classes | ✅ (via impersonation) | ✏️ (delegated) | ✏️ (own) | ✅ (enrolled) | ✅ (child's) |
| Timetable/Calendar | — | ✅ (academy-wide) | ✅ (own) | ✅ (own) | ✅ (child's) |
| Attendance | ✅ (via impersonation) | ✅ (academy-wide, read) | ✏️ (own batches) | ✅ (own, + self-mark via join) | ✅ (child's) |
| Holidays | — | ✏️ (academy holidays) | ✅ (read, via `/holidays/me`) | ✅ (implicit, sessions disappear) | ✅ (implicit) |
| Teacher Leave | — | ✏️ (approve/reject/substitute, own academy) | ✏️ (apply/withdraw, own) | — (no direct visibility) | — (no direct visibility) |
| Announcements (new, academy-wide) | — | ✏️ (author, own academy) | ✅ (if in audience) | ✅ (if in audience) | ✅ (if in audience) |
| Announcements (old, batch) | — | — | ✏️ (own batches) | ✅ (own batches) | — (never notified) |
| Notifications | — (own admin actions only) | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (own) |
| Contact Requests | — | ✏️ (own academy's leads) | ✏️ (own leads) | ✏️ (can initiate) | ✏️ (can initiate) |
| Reports | — | ✅ (own academy) | — (has own Earnings/Fees instead) | — | — |
| Messaging | — | — (not a thread participant by design) | ✏️ (own batches' threads) | ✏️ (own threads) | ✏️ (own children's threads) |
| Academy KYC review | ✅ | ✏️ (submits own) | — | — | — |
| Impersonate a user | ✏️ | — | — | — | — |
| Hard-delete a user | ✏️ | — | — | — | — |

---

## 14. If Something Changes (Dependency Impact Map)

**If a batch is archived**:
→ Existing enrollments are left `active` — untouched.
→ Existing scheduled sessions are left `scheduled` — untouched, will still run and still send reminders.
→ No new students can enroll (invite redemption / marketplace enroll are both rejected against a non-`active` batch).
→ Appears immediately on Academy/Teacher dashboards as "archived"; students already enrolled keep full access to materials/history.

**If a teacher goes on leave (approved)**:
→ With a substitute: affected sessions stay `scheduled`, reassigned; students/parents get `class_substitute`; the substitute's own Calendar gains the class.
→ Without a substitute: affected sessions become `cancelled` (`teacher_leave`); students/parents get `class_cancelled_leave`; if the class is still &lt;10 minutes out when the reminder cron runs, they'd instead get `class_cancelled_reminder`.
→ The applying teacher gets `teacher_leave_approved`/`rejected` regardless.
→ Rejected or withdrawn leave changes nothing about sessions at all.
→ Calendar reflects substitute name or cancellation badge on both the Teacher's and Academy's views.

**If a student is removed from a batch**:
→ Historical `attendance` rows are untouched (foreign-keyed to the session, not the live enrollment state) — attendance history survives.
→ The enrollment row flips to `left`; upcoming sessions no longer show the student as enrolled and they won't be included in future reminder/notification fan-outs for that batch.
→ Parent immediately loses "current" visibility into that batch's live schedule (their own read path is consent-gated per-student, not per-enrollment, so historical progress data for that student likely remains visible — this specific historical-data-after-removal boundary was not separately verified against live behavior and should be treated as inferred, not confirmed).

**If an academy holiday is created**:
→ Applied **immediately**, not on a delayed job: every matching scheduled session that day (academy-wide, or just the chosen batches) is cancelled with `cancellation_reason='academy_holiday'`.
→ Every affected student/parent/teacher gets one notification immediately (deduped by holiday+academy id), plus a grouped `holiday_class_reminder` later if the cancelled class is still in the future when the 10-minute cron runs.
→ Calendar shows the holiday and the cancelled classes on Teacher/Academy/Student/Parent views alike.

**If an announcement is published (new academy system)**:
→ Recipients are computed once, at publish time, from current membership/enrollment/consent state — not re-evaluated later.
→ Everyone in the resolved set gets one `academy_announcement` notification; the announcement itself becomes readable only by those who received that notification (proof-of-receipt gate), not by re-checking "are you still in the audience" at read time — so someone who leaves the batch afterward can still open an announcement they already received, but someone who joins afterward cannot retroactively see it.

---

## 15. Implemented / Partial / Future

### IMPLEMENTED (confirmed working end-to-end in code)
Passwordless OTP auth + JWT rotation + CSRF + RBAC (incl. superadmin bypass) · Batches/Sessions/Enrollments/Invites (with atomic race-safe redemption) · Attendance (manual + self-join) + repeated-absence alerting · Academy self-serve signup + owner linkage · Academy↔Teacher join/accept/reject/remove workflow · Academy Batches/Students/Parents/Attendance/Reports (all via tutor-delegation, not a new ownership model) · Holidays (government, cron-driven, opt-in per academy; academy, immediate) with cancellation + notification · Teacher Leave (apply/approve/reject/withdraw/reassign-substitute), with a confirmed-fixed IDOR and a confirmed-fixed double-decide race · Reminders cron (class / cancelled-class / holiday-grouped, all deduped) · Academy Announcements (new, 7-value audience enum, transient recipient resolution, dedup verified, proof-of-receipt read access) · OLD batch announcements (still active, narrower, no parent notification) · Monitored Messaging (tutor/student/consented-parent only, keyset-paginated) · Notifications (in-app always; push real via FCM when configured) · Discovery/Find-a-Teacher/Find-an-Academy with density-gated curated fallback · Bookings + Waitlists (with exclusivity window) · Reviews (tutor and academy, separate tables, no moderation) · Fees tracking + Razorpay payment/subscription/webhook handling (code-complete) · Progress dashboard (consent-gated for parents) · Assignments/Quizzes incl. AI-drafted quiz generation with human review gate · AI Doubt Solver with hint/full-answer gating · Parent-Child linking with mandatory DPDP consent step, multi-child support · Parent Premium (Razorpay-gated) · Academy KYC (two-phase: automated + human-reviewer fallback) · Super Admin platform-wide user management, impersonation, audit-logged hard-delete · Analytics event tracking (PostHog, real integration) · DPDP data export/delete for every account.

### PARTIALLY IMPLEMENTED
- **WhatsApp notifications**: full interface + call sites exist everywhere; the actual provider is **permanently** a console-log no-op — no environment or config makes it send a real message today.
- **Push notifications**: real when Firebase credentials are configured; silently degrades to console-log-only otherwise.
- **Razorpay payments**: real SDK, real webhook verification, production-shaped code — but never exercised against a live Razorpay account in this environment; a mock provider fills the gap until keys are set.
- **Academy KYC automated check**: real Setu integration exists but is bypassed by a format-only mock provider unless `SETU_CLIENT_ID`/`SECRET` are configured.
- **AI features (quiz drafting, doubt solver)**: real Anthropic integration, config-gated; falls back to a mock provider if unconfigured.
- **Super Admin academy management + KYC review queue**: fully built on the backend, **zero frontend page** — API-only today.
- **Parent dashboard**: two sections (Today's "Announcements", Child-detail's "Upcoming classes") are hardcoded empty states with no real data behind them, despite similar real data being fetched elsewhere on the same portal.
- **Class rescheduling**: no `CLASS_RESCHEDULED` workflow exists — only cancel (with or without substitute); moving a class to a new time is not a supported action.
- **Government holiday data**: migration-seeded only (2026 Tamil Nadu); no admin UI to add future years.

### NOT IMPLEMENTED / FUTURE
Real WhatsApp delivery (Meta Cloud API or equivalent) · iOS/APNs push (interface only supports the Android/FCM shape today) · Any general-purpose email notification channel (OTP is the only email sent) · Review moderation/flagging queue · A "list my announcements" recipient inbox endpoint (only single-by-id fetch exists) · Multi-admin-per-academy (one `owner_user_id` only) · A cooldown on re-requesting academy membership after rejection · Frontend for the existing backend academy-management/KYC-review superadmin surface.

---

## 16. Known Risks / Bugs (documentation only — nothing here was fixed)

1. **[RESOLVED, verified in current code] IDOR in `AcademyOwnerLeaveService.listSessions`** — a previously-reported issue where an academy admin could view another academy's leave-request sessions. Current code (`backend/src/modules/marketplace/academy-owner/academy-owner-leave.service.ts:40-49`) resolves the academy strictly from the authenticated caller's `owner_user_id`, then filters the leave request by both id and that resolved academy id, throwing `NotFoundException` on mismatch. Confirmed against the actual diff of the fixing commit. **No longer present.**
2. **[RESOLVED, verified in current code] Double-decide TOCTOU race on teacher leave requests** — approve/reject/withdraw all now use a single atomic `UPDATE ... WHERE status = 'pending'` (not a read-then-write), and the substitute-session mutation only happens after that atomic claim succeeds. **No longer present.**
3. **Super Admin academy-management and KYC-review backend controllers have zero frontend UI.** A superadmin today can only exercise these via direct API calls — not a security bug, but a functional gap worth flagging since the audit found the backend fully built.
4. **Academy contact-request notifications are silently dropped if the academy has no linked `owner_user_id`.** A superadmin-created academy with no owner account yet will lose leads with no error surfaced anywhere — called out as a "known gap" in the code's own comments.
5. **WhatsApp is unconditionally a no-op.** Any stakeholder-facing claim that a feature "notifies via WhatsApp" is only true for the in-app/push legs today; nothing is ever actually sent over WhatsApp.
6. **Academy KYC's "automated" check silently degrades to a format-only mock** whenever Setu credentials aren't configured for an environment — worth confirming production configuration explicitly rather than assuming the pipeline is doing real verification.
7. **No moderation exists on either review system** (tutor or academy) — a submitted review is immediately public.
8. **Two Parent-dashboard sections are non-functional placeholders** (Today's "Announcements", Child-detail's "Upcoming classes") despite the surrounding page being fully real — a user-visible inconsistency, not a security issue.
9. **A stale code comment** in `academy-admin.controller.ts` claims "no self-serve Academy Dashboard/owner role exists yet" — this is no longer true (the `academy` role and self-serve dashboard have existed since migration 0031) and should be corrected or removed to avoid misleading future readers of that file.
10. **`AuditLogService` adoption is thin.** The audit log itself is real and DB-enforced append-only, but only Super Admin's impersonate/delete actions and Academy KYC review currently write to it — most other administrative actions in the app leave no audit trail.

---

## 17. API Connection Map (selected, high-traffic routes)

| Frontend page | Backend route(s) | Controller |
|---|---|---|
| Academy Today | `GET /academy/me`, `/me/stats`, `/me/teachers/pending`, `/me/contact-requests`, `/me/teachers/active`, `/me/sessions`, `/me/batches` | `AcademyOwnerController`, `AcademyOwnerBatchesController` |
| Academy Batches | `GET/POST /academy/me/batches`, `PATCH .../{id}`, `POST .../{id}/archive`, `.../{id}/sessions`, `.../{id}/students`, `.../{id}/invites` | `AcademyOwnerBatchesController` |
| Academy Leave Requests | `GET /academy/me/leave-requests`, `/pending`, `/{id}/sessions`, `POST .../{id}/approve`, `/reject` | `AcademyOwnerLeaveController` |
| Academy Holidays | `GET/POST /academy/me/holidays`, `DELETE .../{id}` | `AcademyOwnerHolidaysController` |
| Academy Announcements | `GET/POST /academy/me/announcements`, `PATCH .../{id}`, `POST .../publish`, `/archive` | `AcademyOwnerAnnouncementsController` |
| Any portal — read an announcement | `GET /announcements/:id` | `AnnouncementRecipientController` |
| Teacher Today/Batches/Sessions | `/batches/me`, `/sessions/me`, `POST /sessions`, `POST /sessions/:id/cancel` | `BatchesController`, `SessionsController` |
| Teacher Leave | `/leave/*` | `TeacherLeaveController` |
| Teacher Attendance | `POST /attendance/session/:id`, `/attendance/join` | `AttendanceController` |
| Student Today/Batches | `/batches/enrolled`, `/sessions/upcoming` | `BatchesController`, `SessionsController` |
| Student Doubts | `POST /doubt-solver/ask` | doubt-solver controller |
| Parent Today | `/parent-links/me`, `/progress/student/:id`, `/fees/student/:id`, `/sessions/student/:studentId` | `ParentLinksController`, `ProgressController`, `FeesController`, `SessionsController` |
| Parent Link a Child | `POST /parent-links/redeem`, `POST /parent-links/:id/consent` | `ParentLinksController` |
| Super Admin Teachers/Students/Parents | `GET /admin/teachers`, `/students`, `/parents`, `POST /admin/impersonate/:id`, `DELETE /admin/users/:id` | `AdminController` |
| (Backend-only, no frontend) Academy management | `/admin/academies/*` | `AcademyAdminController` |
| (Backend-only, no frontend) Academy KYC review | `/admin/academy-verifications/*` | `AcademyAdminVerificationController` |
| Notifications (every portal) | `GET /notifications`, `/unread-count`, `POST /:id/read`, `/read-all` | `NotificationsController` |

Auth: every request is a `Bearer` JWT (15-min access token, in-memory on the client) plus an httpOnly refresh-token cookie; a 401 triggers one silent `/auth/refresh` retry.

---

## 18. Backend Module Map

| Dashboard feature area | NestJS module |
|---|---|
| Auth/OTP/JWT/roles | `identity` (`auth`, `otp`, `profiles`, `users`) |
| Batches/Sessions/Attendance/Invites | `scheduling` |
| Holidays + Teacher Leave (teacher-facing) | `holidays` |
| Academy self-serve dashboard, batch/leave/holiday/announcement delegation | `marketplace/academy-owner` |
| Academy entity, membership, join workflow | `marketplace/academies`, `marketplace/academy-memberships` |
| Academy KYC | `marketplace/academy-verification` |
| Academy/tutor reviews | `marketplace/academy-reviews`, `marketplace/reviews` |
| Find-a-Teacher/Find-an-Academy discovery | `marketplace/discovery` |
| Bookings, waitlists, locations, proof-of-teaching | `marketplace/bookings`, `waitlists`, `locations`, `proof-of-teaching` |
| Old batch announcements | `delivery/announcements` |
| Materials/Assignments/Quizzes | `delivery` (materials), `assessment` |
| AI (quiz drafting, doubt solver, digests) | `ai` |
| Notifications fan-out (in-app/push/WhatsApp) | `notifications` |
| Reminders cron (class/cancelled/holiday) | `reminders` |
| Monitored messaging | `messaging` |
| Fees, payments, payouts, subscriptions | `billing` |
| Parent-child linking, consent | `parents`, `trust/consent` |
| Progress dashboard | `progress` |
| Audit log, verifications (tutor KYC) | `trust/audit`, `trust/verifications` |
| Reference data (subjects, curricula, grades) | `catalog` |
| Analytics events | `analytics` |
| Super Admin (users, impersonation, academies, KYC review) | `admin`, plus `marketplace/academies` (`academy-admin.controller.ts`) and `marketplace/academy-verification` (`academy-admin-verification.controller.ts`) |
| DPDP export/delete | `account` |

---

## 19. Quick Reference

- **A batch is always owned by a `tutor_id`.** Academy management is a permission-delegation layer, never a second ownership model.
- **A student's parent link is not automatically active** — it needs an explicit DPDP consent step after redeeming the invite token.
- **Notifications always write an in-app row; push and WhatsApp are best-effort side attempts.** WhatsApp never actually sends today.
- **Dedup for any repeating notification is the caller's job**, done by checking recent notifications of the same type against a domain key in the payload — there's no dedup inside `notify()` itself.
- **A cancelled class always has a `cancellation_reason`**; a substituted class is never marked cancelled at all.
- **The old (`delivery/announcements`) and new (`academy_announcements`) announcement systems are completely separate** — different tables, different audiences, different notification types, and the old one never reaches parents.
- **Two fully-built backend surfaces have no frontend today**: Super Admin academy management, and Super Admin academy-KYC review.
- **The previously reported Academy Leave-Sessions IDOR and the teacher-leave double-decide race are both confirmed fixed** as of this audit.
- **Government holidays only apply to an academy that has opted in** (`auto_observe_govt_holidays`); they are never automatically enforced.
- **Every `@Roles(...)` check is bypassed by `superadmin`** — there is no route in the app a superadmin cannot call.
