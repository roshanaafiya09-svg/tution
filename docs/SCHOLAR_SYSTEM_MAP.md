# Scholar — System Map

> **Update 2026-09-21 — ownership model changed.** This document describes the system as audited on 2026-09-16. Since then batches (and assessments) carry an explicit, immutable `academy_id` (NULL = the teacher's Individual context) and the Academy side is scoped by it instead of by "batches of my active teachers". Statements below that say a batch/session/student row "never points at an academy_id", that the Academy is only a delegation layer over teacher-owned data, or that academy stats span every member teacher's data, are **superseded** — see `docs/teaching-contexts.md`.

> Companion to `docs/SCHOLAR_SYSTEM_BULLETIN.md`. Compact visual/text architecture map derived from the actual codebase (backend `backend/src/modules/**`, frontend `web/src/app/**`), not a hypothetical design. See the bulletin for citations and detail on every relationship shown here.

---

## 1. Portals and who reaches whom

```
                              SUPER ADMIN  (/admin, role: superadmin)
                                    │
                    sees/impersonates ALL users, platform-wide
                    (backend-only: can also manage any academy directly —
                     no frontend page exists for this today)
                                    │
                                    ▼
                          ┌───────────────────┐
                          │   ACADEMY ADMIN    │  (/academy, role: academy)
                          │  (self-serve, owns │
                          │   nothing directly —│
                          │   delegates)        │
                          └─────────┬──────────┘
                                    │ active membership
                                    │ (academy_memberships)
                                    ▼
                          ┌───────────────────┐
                          │      TEACHER       │  (/dashboard, role: tutor)
                          │  owns batches,     │
                          │  sessions, leave    │
                          │  requests           │
                          └─────────┬──────────┘
                                    │ owns (tutor_id)
                                    ▼
                          ┌───────────────────┐
                          │      BATCHES        │
                          └─────────┬──────────┘
                          enrollments│
                                    ▼
                          ┌───────────────────┐
                          │      STUDENT        │  (/student, role: student)
                          └─────────┬──────────┘
                       consent-gated│ link (parent_child_links)
                                    ▼
                          ┌───────────────────┐
                          │      PARENT         │  (/parent, role: parent)
                          │  read-mostly view   │
                          └───────────────────┘
```

**Important nuance this diagram can't show as a strict tree**: the Academy Admin box does not sit "above" Teacher in an ownership sense — it sits beside it as a *delegated permission layer*. Every batch/session/student row still points at a `tutor_id`, never an `academy_id`. Academy Admin can manage these only because it resolves its own academy from the logged-in owner account and checks the target tutor is an active member — the same tutor-facing services are called either way.

---

## 2. Class lifecycle — the real shape of scheduling → cancellation → notification

```
TEACHER schedules a class
        │
        ▼
   class_sessions row  (status = 'scheduled')
        │
        ├──────────────────────────────────────────────────────────┐
        │                                                            │
   10 min before start                                    something cancels it:
        │                                                            │
        ▼                                            ┌───────────────┼───────────────┬──────────────────┐
 REMINDERS CRON                                       │               │               │                  │
 (@Cron every minute)                          Teacher manually   Academy declares   Government      Teacher-leave
        │                                       cancels it         a holiday          holiday cron    approved,
        ▼                                       (single/series)   (immediate)        (opt-in,daily,   NO substitute
 notify: class_reminder                                                               midnight IST)
 → students + active parents                          │               │               │                  │
   (never the tutor)                                  ▼               ▼               ▼                  ▼
                                                cancellation_reason='manual'   ='academy_holiday'  ='government_holiday'  ='teacher_leave'
                                                       │               │               │                  │
                                                       │               └───────┬───────┘                  │
                                                       │                       ▼                           ▼
                                               (no immediate            notify: academy_holiday /   notify: class_cancelled_leave
                                                notification —          government_holiday          → students + active parents
                                                only later via          → students + parents +       Teacher gets: teacher_leave_approved
                                                the reminder cron          teachers
                                                if still upcoming)

                                          Teacher-leave approved, WITH a substitute:
                                          session stays 'scheduled', substitute_tutor_id set,
                                          cancellation_reason cleared (never marked cancelled)
                                          → notify: class_substitute → students + active parents
```

Rejected/withdrawn leave and archived batches touch **none** of this — sessions are left exactly as they were.

---

## 3. Notification fan-out — the actual mechanism

```
                      ANY feature module
                      (holidays, leave, attendance,
                       announcements, messaging,
                       reminders, discovery, ...)
                              │
                              │ pre-resolves recipient user ids itself
                              │ (notify() does NO audience resolution)
                              ▼
                  ┌───────────────────────────┐
                  │  NotificationsService      │
                  │       .notify()            │
                  └─────────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 write `notifications`    try: push provider       try: whatsapp provider
 row — ALWAYS               │                            │
 (in-app bell/inbox)   ┌────┴────┐                  ┌─────┴──────┐
                        │ FCM real │                │ ConsoleWhatsApp │
                        │ (if      │                │ — ALWAYS a  │
                        │ configured)│              │ no-op logger │
                        │ else     │                │ (no real    │
                        │ console  │                │ provider    │
                        │ log-only │                │ exists yet) │
                        └─────────┘                  └────────────┘

  Dedup is NOT inside notify(). Each caller does:
    listRecentForUserByType(userId, type, sinceWindow)
      → skip user if a matching domain key (sessionId / holidayId /
        announcementId / studentId+batchId) is already in an existing
        notification's payload within the lookback window.

  Email exists ONLY for OTP login codes (Brevo) — a completely separate
  subsystem that never touches the notifications table or this service.
```

---

## 4. Academy Announcements (new system) — audience resolution

```
Academy Admin authors announcement
        │  picks exactly ONE audience:
        │  academy | teachers | students | parents | batch | teacher | student
        │  (DB CHECK enforces exactly one target id column matches)
        ▼
   status='draft'  ──publish (atomic: WHERE status='draft')──▶  status='published'
                                                                        │
                                                                        ▼
                                                        resolveRecipients(audience)
                                                                        │
             ┌──────────────┬───────────────┬───────────────┬─────────┴─────────┬───────────────┐
             ▼              ▼               ▼               ▼                   ▼               ▼
          'teacher'      'student'        'batch'         'teachers'         'students'      'parents' / 'academy'
        one tutor id   one student id  batch's enrolled  every active      every active     union of teachers ∪
                                        students ∪ their  member tutor      teacher's         students ∪ their
                                        active parents                     batches' students  active parents
                                        (SQL DISTINCT +                    (deduped by Set)
                                         Set → verified
                                         dedup for a parent
                                         with 2 kids in the
                                         same batch)
             │              │               │               │                   │               │
             └──────────────┴───────────────┴───────────────┴───────────────────┴───────────────┘
                                              ▼
                                   notify() fans out — transient Set only,
                                   NOTHING per-recipient is persisted
                                              │
                                              ▼
                        Recipient later opens GET /announcements/:id
                        Access = proof of receipt: "does a notification
                        of type academy_announcement naming this id exist
                        for me?" — not a live re-check of audience membership.
                        No match → 404 (indistinguishable from "doesn't exist").
                        No "list mine" endpoint exists — single-fetch only.
```

This is entirely disconnected from the OLD system:

```
OLD: delivery/announcements  (table: announcements, migration 0005)
  Teacher authors → tied to ONE batch → notify() → that batch's enrolled
  STUDENTS ONLY (parents never notified) → live immediately, no draft state.
  Still actively used today for ordinary per-batch announcements.
```

---

## 5. Database — core entity relationships

```
                                   users
                                     │
                    ┌────────────────┼────────────────┬─────────────────┐
                    ▼                ▼                 ▼                 ▼
               user_roles      profiles_tutor    profiles_student   (no profiles_parent —
          (multi-role join,                                          parent identity is
           e.g. tutor+academy)                                       just a user_roles row)

  academies (owner_user_id → users, nullable, unique)
      │
      ├──< academy_memberships >── users(tutor)         status: active | left
      ├──< academy_membership_requests >── users(tutor)  status: pending|accepted|rejected
      ├──< academy_kyc_verifications
      ├──< academy_photos, academy_contact_requests, academy_reviews
      └──< academy_announcements  (nullable audience_batch_id / _teacher_id / _student_id
                                    — exactly one set, DB CHECK enforced)

  batches (tutor_id → users)                — ALWAYS one owning tutor, never an academy_id
      │
      ├──< enrollments >── users(student)          status: active | left
      └──< class_sessions
                │
                ├── holiday_id ──────────────→ holidays (nullable)
                ├── teacher_leave_request_id → teacher_leave_requests (nullable)
                ├── substitute_tutor_id ─────→ users (nullable)
                └──< attendance >── users(student)

  holidays (academy_id nullable — NULL means a national government holiday)
      └──< holiday_batches >── batches            (junction: holiday scoped to specific batches)

  teacher_leave_requests (tutor_id, academy_id → users/academies)
      └──< teacher_leave_request_sessions >── class_sessions
            (snapshotted at APPLY time — immune to later session changes)

  parent_child_links: users(parent) ──< >── users(student)
      status: pending | active | revoked
      → consent_record_id → consent_records   (DPDP Act 2023 explicit consent required
                                                 before status can become 'active')

  payments ──exactly one of──▶ fee_ledger_id | subscription_id |
                                parent_subscription_id | booking_id
      (evolving DB CHECK constraint, one new payable type added per migration)
```

---

## 6. Who can reach what — condensed

```
SUPER ADMIN ──sees/impersonates──▶ every Teacher, Student, Parent account (no academy filter)
SUPER ADMIN ──(backend only, no UI)──▶ any Academy's data, any KYC review queue

ACADEMY ──delegates permission for──▶ its active member Teachers' Batches/Students/Sessions/Leave
ACADEMY ──reads (aggregated)──▶ its member Teachers' Attendance, Parents-of-its-Students
ACADEMY ──never touches──▶ a Teacher's own profile, reviews, or non-academy batches

TEACHER ──owns──▶ Batches → Sessions → Attendance → Materials/Assignments/Quizzes/Announcements(old)
TEACHER ──applies for──▶ Leave (academy decides)
TEACHER ──requests to join──▶ an Academy (academy decides)

STUDENT ──enrolls in──▶ Batches (via invite token or marketplace booking)
STUDENT ──generates invite token for──▶ a Parent to redeem

PARENT ──redeems token + grants DPDP consent for──▶ exactly the children they're linked to
PARENT ──read-mostly view of──▶ that child's sessions, attendance, fees, progress, messages
PARENT ──gated feature: Parent Premium──▶ unlocks richer digests + Student's AI "ask a tutor"
```

---

## 7. Confirmed fixed security issues (kept here for visibility, not as open risks)

```
[FIXED] AcademyOwnerLeaveService.listSessions IDOR
  Before: academy id resolved but discarded; any academy's requestId worked.
  Now:    academy id resolved from JWT owner_user_id → leave request looked up
          WHERE id = ? AND academy_id = ? → 404 on mismatch.

[FIXED] Teacher-leave double-decide TOCTOU race
  Before: read-then-write allowed two concurrent approve/reject calls to both succeed.
  Now:    single atomic UPDATE ... WHERE status='pending' — a losing concurrent
          caller's update matches zero rows and is rejected with 409 Conflict.
          Session mutation only happens after the atomic claim succeeds.
```
