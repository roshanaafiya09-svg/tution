# Tuition App — Revised Product Blueprint (v2, Practical)

> Working name: **Tuition App**. **Web + mobile** (Flutter for students/parents, Next.js web for tutors + public pages).
> Launch market: **Chennai / Tamil Nadu, India**. Status: pre-code. This document replaces v1 and is the deliverable a small dev team (or solo builder) picks up on day one.

---

## 0. What changed from v1, and why

| v1 said | v2 says | Reason |
|---|---|---|
| Mobile-only Flutter, no public website | **Web + mobile.** Flutter mobile for students/parents; Next.js web for the tutor dashboard and public tutor profile pages | Tutors do admin on laptops; web subscriptions escape the 15–30% app-store cut; SEO-indexable tutor pages are how discovery eventually works |
| Global from day one (multi-currency, i18n, payment adapters) | **One state first.** INR only, IST only, English + Tamil, DPDP-compliant | "Global" infra before a single paying user is where small teams die. Money as minor-unit integers and UTC timestamps are kept as cheap insurance |
| Native live video (LiveKit) in MVP | **Paste-a-link classes** (Zoom/Google Meet) in MVP; native video only if tutors demand it | Video is ~30% of the build and the #1 support burden. Most tuition is in-person or already on Meet/Zoom |
| Full offline-first sync engine | **Offline reading cache only**; submissions require connectivity | Conflict-resolution sync is one of mobile's hardest problems; caching materials gives 90% of the value |
| Stripe + Stripe Connect | **Razorpay + Razorpay Route** | Stripe marketplace onboarding and payouts in India are restrictive; Razorpay Route is built for exactly this |
| Student/parent subscription as primary revenue | **Tutor pays** (flat or per-student) after trial | In the Indian tuition market the parent pays the tutor; the tutor is the buyer of admin software. Parent premium comes later, attached to proven AI value |
| 90-day trial for everyone via a Trial Policy Engine subsystem | 90-day trial **for tutors** via a `trial_ends_at` column + one config table | Same flexibility, one day of work instead of a subsystem |
| Payment *processing* in MVP | **Fee tracking first** (tutor records payments manually), processing in Phase 2 | Tutors' #1 pain is remembering who paid; solvable with zero payment regulation |
| Twilio Verify OTP | **WhatsApp OTP (Meta API) primary**, SMS fallback | Far cheaper in India; every tutor and parent has WhatsApp; less SMS-pumping exposure |
| ~14 weeks, funded team | **Phase 1 in 8–10 weeks for a 1–2 person team**, honest phasing after | Scope sized to the actual builder |

**Unchanged from v1 (these were right):** the Tutor-OS wedge and cold-start analysis · invite-link student import with no empty states · AI parent weekly digest as the retention crown-jewel · monitored-only adult↔minor messaging · immutable admin audit logs · Retool admin instead of custom · NestJS modular monolith · Postgres for everything (no MongoDB) · UTC + IANA + RRULE scheduling discipline · Socratic AI doubt solver · tutor-reviewed AI quiz generation.

---

## 1. Strategy in one line

> **A tutor runs their whole teaching business from their laptop and phone. Their students come with them. Once the city is dense enough, everyone else can find them.**

| Phase | Product | Who pays | Unlock |
|---|---|---|---|
| **A. Tutor OS** | Batches, scheduling, attendance, materials, homework, fee tracking, parent updates | Tutor subscription after 90-day trial | Ships first |
| **B. Closed network** | Students/parents of connected tutors; referrals between parents | Tutor per-student pricing; optional parent premium (AI features) | After A |
| **C. Open marketplace** | Public search by subject / time / area; SEO tutor pages | Take rate on 1:1 bookings | Per-city density gate (≥25 active tutors + 250 active students) |

**North Star Metric: Weekly Student-Hours Taught.** Unchanged — it only moves when supply, demand, and delivered value all move.

---

## 2. Platforms

| Surface | Tech | Audience | Why |
|---|---|---|---|
| **Mobile app** (iOS + Android) | Flutter 3.x / Dart 3 | Students, parents; tutor on-the-go (attendance, announcements) | Single codebase, good cheap-Android behaviour |
| **Tutor web dashboard** | Next.js 14 (App Router) + Tailwind | Tutors (primary work surface) | Bulk grading, quiz authoring, material upload, fee reconciliation belong on a laptop |
| **Public web** | Same Next.js app, SSR | Prospective parents/students | SEO tutor profile pages (`/tutor/priya-physics-anna-nagar`), landing page, pricing page, **web checkout** |
| **Admin** | Retool over Postgres + internal API | Internal only | ~1 week instead of ~6. SSO + MFA, every action audit-logged |

**Billing-rail consequence of having web:** subscriptions are sold **on the web via Razorpay** (~2% fees). The mobile apps do not sell subscriptions at MVP — they are companion apps to an account managed on web, which keeps them outside IAP requirements. If/when in-app purchase of subscriptions is added, it goes through IAP + RevenueCat at that point, priced for the haircut. (Re-verify Apple's reader/companion-app and P2P-services rules with current policy text before store submission — these rules shift.)

---

## 3. Users (unchanged in substance, trimmed)

**Tutor — the customer. Build for them first.**
MVP: profile + verification, subjects/curricula (CBSE, State Board, ICSE to start), availability calendar, batch creation, session scheduling (RRULE, DST-safe), paste-a-link live classes, attendance, materials upload, assignments (photo/PDF submit → grade), announcements + push, **fee tracking ledger**, AI quiz generator (Phase 2).
**Activation: ran one session with ≥3 attending students.**

**Student.**
MVP: Today view, class join (opens tutor's meeting link, records attendance), materials with offline reading cache, assignment submission, progress view, bookmarks.
**Activation: attended one class + submitted one assignment within 7 days.**

**Parent — the payer of tuition, the reader of digests.**
MVP (Phase 2): child link + DPDP-compliant consent, **AI weekly digest**, attendance and results view, fee history, monitored tutor messaging.

**Admin (internal).** Support / Trust & Safety / Finance / Growth / Superadmin roles. Verification queue, safeguarding queue, refunds, coupons, flags. **Every admin action writes an immutable audit-log entry.**

---

## 4. MVP — the brutal cut (Phase 1, 8–10 weeks, 1–2 devs)

### IN

**Identity & trust**
- WhatsApp OTP (Meta Cloud API) with SMS fallback; Google Sign-In on web
- Roles & RBAC (multi-role users)
- Tutor verification: Aadhaar-masked ID + qualification upload → manual review queue → verified badge. **SLA <24h.**

**Tutor OS (web-first)**
- Profile, subjects, grades, languages, bio, rate
- Availability (weekly recurring + exceptions), stored UTC + IANA
- Batches (capacity + waitlist) and sessions with RRULE recurrence
- **Live class = tutor's own Meet/Zoom link** on the session; "Join" tap records attendance (manually overridable)
- Materials: PDF/image upload → R2, per-batch visibility, offline reading cache on mobile
- Assignments: create → student photo/PDF submit → grade + feedback
- Announcements + push (FCM/APNs)
- **Fee ledger:** tutor records expected fees and received payments per student; monthly "who hasn't paid" view. *No payment processing yet.*

**Student/parent mobile**
- Today view (home), class join, materials, assignment submit, simple progress (attendance %, assignment completion)

**Growth loop**
- **Invite link:** tutor shares on WhatsApp → student installs → lands pre-enrolled in the batch. No empty states, ever.

**Platform**
- English + Tamil; dark mode; in-app account deletion + data export (DPDP + Apple requirement)
- Retool admin; Sentry; PostHog (analytics + feature flags)

### OUT of Phase 1 (deferred, with target)

| Deferred | Target |
|---|---|
| Payment processing & payouts (Razorpay + Route) | Phase 2 |
| Subscriptions & trial enforcement (tutors) | Phase 2 |
| Parent accounts + AI weekly digest | Phase 2 |
| AI quiz generator | Phase 2 |
| AI doubt solver (RAG, Socratic) | Phase 3 |
| Quizzes (MCQ auto-graded) | Phase 3 |
| Native live video (LiveKit) + recording + consent | Phase 3, **only if tutors ask** |
| 1:1 marketplace bookings + take rate | Phase 4 |
| Public discovery/search, reviews, Proof-of-Teaching score | Phase 4 (density-gated) |
| Certificates, mock-exam engine, video library, institution plans, extra languages | Later / on demand |
| Full offline sync with conflict resolution | Only if field data demands it |

---

## 5. Business model

- **Tutor trial:** 90 days full access (`trial_ends_at` on the subscription row; reminder jobs at 30/14/7/3/1 days; cadence in a config table).
- **Tutor pricing (validate in pilot):** ₹499/mo flat up to 25 students → ₹999/mo up to 100 → per-student add-on beyond. Annual = 2 months free.
- **Trial-end = value-recap paywall,** not a countdown: "You ran 41 classes, 380 attendances marked, ₹62,000 in fees tracked. Keep it for ₹499/month." (v1's best idea — kept.)
- **Parent premium (Phase 3):** ₹99–149/mo for AI doubt solver + rich digests, sold on web.
- **Marketplace take rate (Phase 4):** 15–20% on 1:1 bookings processed through the platform.
- **Trial abuse:** phone-number hash + device fingerprint; one trial per tutor identity. Referral rewards on *referee's* qualifying activity (3 attended classes), never on signup.

**Unit-economics guardrails:** total COGS (AI + storage + comms) ≤ 25% of ARPU · AI ≤ ₹12 (~$0.15) per active student per month, hard-capped server-side.

---

## 6. Technical architecture

### Backend — NestJS modular monolith (TypeScript, Fastify)
Bounded-context modules: `identity`, `catalog`, `scheduling`, `delivery`, `assessment`, `billing`, `ai`, `notifications`, `trust`. No cross-module DB access — service interfaces only. Extract `ai`/`notifications` later if scaling demands. Async work on **BullMQ (Redis)**: reminders, digests, batch AI, webhooks.

### Data layer
| Component | Choice |
|---|---|
| Primary DB | **PostgreSQL 16** (Neon at MVP → RDS later). JSONB, pgvector (Phase 3 RAG), FTS. PostGIS deferred to Phase 4 |
| Cache/queue | Redis (Upstash) |
| Object storage + CDN | **Cloudflare R2 + CDN** — zero egress fees; signed direct-to-R2 upload, media never touches the API |
| Search | Postgres FTS → Typesense only at marketplace phase |

Money = **integer minor units (paise) + ISO-4217 code**, never floats. Timestamps = `timestamptz` UTC + IANA zone wherever wall-clock matters. IDs = UUIDv7.

### Auth
Self-hosted in NestJS. WhatsApp OTP (Meta Cloud API) + SMS fallback; Google Sign-In (web). Access JWT 15 min + rotating device-bound refresh token; `jti` revocation in Redis. AuthZ at service layer **and** Postgres RLS.
(Add Sign in with Apple only when iOS social login ships — Apple mandates it alongside other social logins.)

### Mobile (Flutter)
Riverpod · go_router · Drift (SQLite) for the reading cache · Dio + OpenAPI-generated client (server drift = compile error) · freezed · Shorebird code push · golden tests on design-system components.

### Web (Next.js 14)
App Router, Tailwind, server components for public SEO pages, same OpenAPI-generated client.

### Payments (Phase 2)
**Razorpay** for subscriptions and fee collection; **Razorpay Route** for splitting tuition payments tutor/platform. Adapter interface kept thin (one interface, one implementation) so a second PSP can be added when expansion actually happens.

### Supporting
FCM/APNs behind a notification service (preferences + quiet hours) · Sentry · PostHog · OpenTelemetry → Grafana Cloud · GitHub Actions + Codemagic · Fly.io + Neon at MVP, containerised + Terraform from day one so a later AWS move is boring.

---

## 7. Database core (Phase 1 tables)

```
users(id, phone_e164 UQ, email NULL, locale, timezone, dob NULL, status, created_at, deleted_at)
user_roles(user_id, role, granted_at)
profiles_tutor(user_id PK, display_name, headline, bio, years_experience,
      verification_status, slug UQ)            -- slug feeds the public SEO page
profiles_student(user_id PK, display_name, grade_level, curriculum_id, school_name)
tutor_verifications(id, tutor_id, type, document_key, status, reviewed_by, reviewed_at)
consent_records(id, user_id, consent_type, policy_version, granted_at, ip, user_agent)

subjects(id, slug UQ, name_i18n JSONB)
curricula(id, slug UQ, name, country_code)     -- CBSE, TN State Board, ICSE
grade_levels(id, curriculum_id, ordinal, label)
tutor_subjects(id, tutor_id, subject_id, curriculum_id, grade_min, grade_max,
      hourly_rate_minor, currency)
tutor_availability(id, tutor_id, weekday, start_time, end_time, timezone,
      effective_from, effective_to)
tutor_availability_exceptions(id, tutor_id, date, is_available, start_time, end_time)

batches(id, tutor_id, title, subject_id, grade_level_id, capacity, fee_minor,
      currency, fee_period, status)
enrollments(id, batch_id, student_id, status, joined_at, left_at, UQ(batch_id, student_id))
invites(id, tutor_id, batch_id, token UQ, expires_at, max_uses, used_count)
class_sessions(id, batch_id, tutor_id, scheduled_start_utc, timezone, duration_min,
      meeting_url, recurrence_rule, recurrence_parent_id, status)
attendance(id, session_id, student_id, status, joined_at, marked_by, method)
      -- PARTITION BY RANGE when volume demands

materials(id, batch_id, tutor_id, title, object_key, mime, size_bytes, created_at)
assignments(id, batch_id, title, instructions, due_at_utc, timezone)
submissions(id, assignment_id, student_id, object_keys JSONB, submitted_at,
      grade, feedback, graded_at, UQ(assignment_id, student_id))
announcements(id, batch_id, tutor_id, body, created_at)

fee_ledger(id, tutor_id, student_id, batch_id, period_label, expected_minor,
      currency, status, recorded_paid_minor, paid_at, note)   -- Phase 1: tracking only

subscriptions(id, tutor_id, plan_id, status, trial_ends_at, current_period_end,
      provider, provider_ref)                                  -- enforced Phase 2
audit_logs(id, actor_id, actor_role, action, entity, entity_id, diff JSONB,
      ip, created_at)                                          -- immutable, append-only
notifications(id, user_id, type, payload JSONB, read_at, created_at)
```

Phase 2 adds: `payments`, `payouts`, `parent_child_links`, `digests`. Phase 3 adds: `quizzes`, `quiz_attempts`, `ai_interactions`, pgvector `material_chunks`. Phase 4 adds: `bookings`, `reviews`, `tutor_locations` (PostGIS).

---

## 8. AI layer (Phase 2–3)

All Claude, routed by task; **model IDs and prices live in server config, verified at build time — never hardcoded in the client and never budgeted from this document.**

- **Small/fast model:** moderation, PII scrub, intent routing.
- **Mid model (workhorse):** doubt solver, quiz generation, weekly digests.
- Use **prompt caching** (tutor's materials + rubric is a large stable prefix), the **Batch API** for digests/nightly analysis (≈50% off), and low/medium effort settings for interactive calls.

**Phase 2 — AI Quiz Generator (tutor-facing):** PDF chapter in → 10 draft MCQs with keys + difficulty. **Tutor must review and approve; never auto-publish AI content to students.**

**Phase 2 — AI Weekly Parent Digest:** attendance, submissions, score trend, one narrative paragraph, in English or Tamil. Batch job, Sunday evening push. *The renewal argument, delivered weekly.*

**Phase 3 — AI Doubt Solver:** RAG over the tutor's own materials (pgvector). **Socratic gate:** no final answer until the student attempts — enforced in the system prompt *and* server-side. Every answer cites source material and offers one-tap "ask your tutor". Small-model pre-screen for abuse/PII.

**Guardrails (non-negotiable):** PII scrubbed pre-call, student names tokenised · every student-visible output carries a citation or "check with your tutor" affordance · per-user monthly token budgets hard-stopped server-side · all AI interactions logged for safeguarding review · structured outputs for anything parsed.

---

## 9. Trust, safety & compliance (India-first)

- **DPDP Act 2023** is the governing framework: verifiable parental consent for users under 18, purpose limitation, data-principal rights (export + deletion — also an Apple mandate). Consent records versioned and stored.
- **No unmonitored adult↔minor DM. Ever.** Messaging is thread-based and tutor-visible/parent-visible by design. (Phase 2, when messaging ships.)
- Tutor verification before any student contact; verified badge; re-verification on document expiry.
- Content moderation for uploaded materials: automated scan + report button + admin review queue.
- Safeguarding report queue with <4h response target; suspension tooling in admin from day one.
- If native video ships (Phase 3): recording on by default for 1:1 sessions with minors, 90-day retention, per-participant pre-session consent.
- Immutable audit logs on all admin actions; SAST + dependency + secret scanning per PR; pen test before marketplace phase.

---

## 10. Roadmap

**Phase 1 — Tutor OS core (weeks 1–10).**
Everything in §4 IN. Success: 10 pilot tutors in Chennai; ≥55% tutor activation; ≥70% of scheduled classes actually run through the app (join-tap recorded).

**Phase 2 — Money + parents (weeks 11–18).**
Razorpay subscriptions + trial enforcement + value-recap paywall · fee *collection* (student/parent pays through the app, Route split, tutor payout) · parent accounts + consent + AI weekly digest · AI quiz generator · monitored messaging.
Success: ≥25% tutor trial→paid; digest open rate ≥50%; involuntary churn recovery ≥50% via dunning.

**Phase 3 — Student depth (weeks 19–26).**
AI doubt solver · quizzes + attempt history · richer progress/trends · parent premium tier · native live video *only if* ≥30% of pilot tutors request it.
Success: student W4 retention ≥40%; doubt-solver resolution ≥70%; AI cost ≤ budget.

**Phase 4 — Marketplace (when density gate passes).**
Public SEO tutor pages open to search engines · discovery search + ranking (Proof-of-Teaching score: verified hours, attendance retention, measured improvement) · 1:1 bookings with take rate · verified-session-only reviews · reschedule/cancellation policy engine · waitlists → booking conversion.
Gate: **≥25 active tutors + 250 active students in the metro.** Below gate, Discover shows curated/waitlist state, never an empty search.

**Phase 5 — Expansion.** Second city/state (adds a language + possibly a PSP) · institution plans · remaining AI features · custom admin if Retool strains · AWS migration rehearsed at ~100k MAU.

---

## 11. KPIs (trimmed to what a small team can actually watch)

**North Star:** Weekly Student-Hours Taught.

| Area | Metric | Target |
|---|---|---|
| Activation | Tutor ran 1 session ≥3 students | ≥55% of signups |
| Activation | Student attended 1 class + 1 submission in 7d | ≥60% |
| Growth | Invite link → activated student | ≥45% |
| Reality check | **% of scheduled classes actually run in-app** | ≥70% |
| Retention | Tutor W4 / M6 | ≥60% / ≥40% |
| Retention | Student W4 | ≥40% |
| Revenue | Tutor trial→paid | ≥25% |
| Revenue | Renewal (annual/monthly) | ≥85% / ≥75% |
| Quality | Crash-free sessions · cold start · API p95 | >99.7% · <2s · <300ms |
| Cost | COGS / ARPU | ≤25% |
| Safety | Safeguarding response · verification SLA | <4h · <24h |

---

## 12. Top risks

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| 1 | Tutors revert to WhatsApp + paper | **Critical** | Obsess over the tutor daily loop; watch "% classes run in-app"; fee ledger is the hook |
| 2 | Child-safety incident | **Critical** | §9 in full from Phase 1, not deferred |
| 3 | Scope creep back toward v1 | **High** | This document is the contract; anything moved IN re-baselines the timeline explicitly |
| 4 | Cold start at marketplace phase | High | Wedge + invites + density gate (unchanged from v1) |
| 5 | App-store policy on subscriptions/companion apps | High | Web-checkout posture; verify current store rules before each submission |
| 6 | WhatsApp OTP delivery issues | Medium | SMS fallback path tested in CI |
| 7 | Timezone/DST bugs in RRULE | Medium | UTC+IANA discipline; DST regression tests even in one-timezone launch |
| 8 | AI cost creep | Medium | Server-side budgets, caching, batch API, config-driven models |

---

## 13. Verification gates

**Before build:**
1. Confirm Razorpay Route terms for tuition splitting + tutor KYC flow.
2. Confirm DPDP minor-consent implementation pattern (what "verifiable parental consent" means operationally).
3. Confirm Meta WhatsApp Cloud API OTP pricing + template approval for India.
4. Price one AI digest + one quiz generation against current model pricing; check against the ₹12/student/month cap.
5. Recruit 10 named Chennai pilot tutors *before* writing code. If you cannot find 10, that is the most important finding this plan can produce.

**During build:** unit + widget tests on domain rules · golden tests on design system · integration tests on the money paths (Phase 2: subscribe, renew, fail-and-grace, refund) · DST regression suite · accessibility pass (TalkBack/VoiceOver) · CI-enforced budgets: app <40MB, cold start <2s on mid-range Android.

**Pilot verdict metric:** % of scheduled classes actually run in the app. **<70% = not ready**, regardless of every other dashboard.

---

## 14. Immediate next steps

1. Recruit the 10 Chennai pilot tutors (gate #5 above).
2. Answer verification gates 1–4.
3. Approve this scope. Anything moved from OUT to IN gets an explicit cost and a re-baselined timeline.
4. First build artefacts on approval: OpenAPI 3.1 spec · SQL migrations for §7 · design tokens · Flutter shell (routing/theming/auth) · Next.js shell (auth + tutor dashboard skeleton).
