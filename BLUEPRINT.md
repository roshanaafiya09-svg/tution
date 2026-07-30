# Tuition Marketplace — Product Blueprint

> Working name: **Tuition App**. Mobile-only (Flutter, iOS + Android). Internal admin dashboard only — no public website.
> Status: pre-code. This document is the deliverable a dev team picks up on day one.

---

## 1. Context

`E:\projects\tution` is empty. This is a true greenfield build with no existing code, schema, or design to conform to.

You confirmed four things that shape everything below:

| Decision | Your answer | Consequence |
|---|---|---|
| Market | Global — "convenient across the world" | Multi-currency, multi-timezone, i18n from day one; payment rails behind an adapter interface |
| Business shape | **Open marketplace** — any tuition teacher creates their own page; students find teachers by **time and subject** | Two-sided; discovery is the product; cold-start is the #1 risk |
| Framework | Flutter | Single codebase, pixel-identical premium UI, strong offline story |
| Deliverable | Plan file only | No docs/ folder, no scaffold — this file is it |

The goal is a premium tuition marketplace that can eventually compete with the best education platforms. The path to that is **not** launching a global marketplace on day one. It's launching a tool tutors love, letting them bring their own students, and switching on discovery once each city has enough supply to make search worth using.

---

## 2. Three things in the brief I'd change, and why

I'm building all of what you asked for. But three items will cost you money or users as specified, so here's the honest read plus the alternative I've designed in.

### 2.1 A marketplace has a cold-start problem that will kill it before the features matter

Your framing — "any tuition teacher can create a page so students can find them by time and subject" — is a classic two-sided marketplace. The failure mode is brutal and well-documented: a student opens search, sees four tutors, none teaching their subject at their time, and never returns. Tutors see no bookings and stop maintaining their page. Both sides leave within a fortnight.

**The fix — the Tutor-OS wedge.** Ship the tutor's side first as a genuinely valuable standalone product: batches, scheduling, attendance, materials, homework, fee tracking, parent updates. A tutor gets real value on day one with **zero** other users on the platform. Then:

1. Tutors invite their **existing offline students** via a WhatsApp/SMS link. Those students arrive pre-enrolled in a real batch. Supply arrives carrying its own demand — the cold-start problem is bypassed, not solved.
2. Public discovery (search by subject/time/language) stays **geo-gated**. It unlocks per-metro only when a density threshold is met — my recommendation: **25 active tutors + 250 active students** in a city. Below that, the Discover tab shows a curated/waitlist state rather than an empty search.
3. This also makes the 3-month trial rational: it becomes a **supply-acquisition** instrument aimed at tutors, which is where marketplace CAC actually belongs.

This is the single most important strategic decision in this document. Everything downstream assumes it.

### 2.2 The 3-month trial for *every* user is the wrong shape — but it's tunable, so I've made it configurable rather than argued about it

For **tutors**, 3 months free is excellent. Tutors churn slowly, migrate their whole workflow in, and by month three the switching cost is real. Keep it.

For **students**, 3 months of everything-unlocked is 90 days of subsidised inference and video with no purchase signal. Students who join through a tutor already have the tutor relationship — that's the value, not the trial. Students who join through Discover have shown no intent yet.

**What I've designed:** a server-driven **Trial Policy Engine** (§13.2). Trial duration, which features are gated, and reminder cadence are all config rows — per role, per region, per acquisition cohort — changeable without an app release or a backend deploy. It ships configured exactly as you specified (**90 days, all premium features, reminders at 30/14/7/3/1 days**). When the data says students should get 30 days, or that tutors should get 6 months in a new market, you change a row. You are not locked in, and you never ship a hardcoded `TRIAL_DAYS = 90`.

**One thing I'd hold firm on:** the trial-end experience. Do not use a countdown-pressure paywall. Use a **value-recap paywall** — "Aarav attended 24 classes, submitted 31 assignments, and moved from 62% to 78% in Physics. Keep going for ₹X/month." It converts better and doesn't feel adversarial. Details in §13.4.

### 2.3 App Store billing rules will decide your margins — this is not a detail

This is the highest-leverage technical/legal fact in the whole project, and it is routinely discovered too late.

Under Apple's App Store Review Guidelines §3.1.3(e) (Person-to-Person Services), **realtime person-to-person services between two individuals — explicitly including tutoring — may use payment methods other than in-app purchase.** But the same clause states that **one-to-few and one-to-many realtime services must use in-app purchase.**

Read that carefully, because it splits your product down the middle:

| Revenue stream | Billing rail | Platform cut |
|---|---|---|
| **1:1 tutoring session bookings** | Stripe / regional PSP (exempt) | 0% platform, ~2.9% PSP |
| **Group batch classes** (one-to-many) | Must use IAP | 15–30% |
| **App subscription** (premium features) | Must use IAP | 15–30% (15% under Small Business Program) |
| **Institution / B2B plans** | Off-platform invoicing | 0% |

Google Play has an analogous but not identical position, with User Choice Billing available in some jurisdictions. **Both policies change; verify current text with counsel before launch.**

**Design consequences, built into this plan:**
- 1:1 booking is a first-class product, not an afterthought — it's your highest-margin stream.
- Subscription pricing must be set assuming a ~15–30% haircut. Price the annual plan to clear the Small Business Program threshold economics.
- **Use RevenueCat** for IAP. Do not hand-roll receipt validation, entitlement sync, grace periods, billing retry, or cross-platform restore. This is a solved problem and hand-rolling it is where subscription apps lose revenue silently.
- Never link out to external payment from inside a flow that Apple classifies as IAP-required. That's a rejection, and a repeat offence is an account risk.

---

## 3. Positioning & the one-line strategy

> **A tutor runs their whole teaching business from their phone. Their students come with them. Once a city is dense enough, everyone else can find them.**

Three phases of the same product:

| Phase | Product | Who pays | Unlock condition |
|---|---|---|---|
| **A. Tutor OS** | Batch/class/attendance/materials/homework manager | Tutor subscription (after trial) | Ships first |
| **B. Closed marketplace** | Students discover tutors they're connected to; referrals between parents | Student/family subscription | Immediately after A |
| **C. Open marketplace** | Public search by subject / time / language / price | Take rate on 1:1 bookings | Per-city density threshold |

**North Star Metric: Weekly Student-Hours Taught.** One number that only moves when supply, demand, and delivered value all move together. Vanity-proof — you cannot inflate it with signups.

---

## 4. Users

### 4.1 Tutor — *the primary customer. Build for them first.*

| | |
|---|---|
| **Goals** | Fill their timetable; stop losing hours to admin, chasing fees, and re-sending materials on WhatsApp; look credible to new parents |
| **Problems** | Attendance in a paper register; fee collection by memory; materials scattered across WhatsApp groups; no proof of results; no way to be found by new students |
| **Daily workflow** | Morning: check today's classes → run 3–5 classes (in-person or live) → mark attendance → post materials/homework → answer doubts in the evening → reconcile fees weekly |
| **Permissions** | Full CRUD on own batches, courses, sessions, materials, assignments. Read student profiles **only** for enrolled students. Cannot see other tutors' data. Cannot message an unlinked minor. |
| **MVP features** | Profile + verification, subjects & curricula, availability calendar, batch creation, session scheduling (RRULE), live class, attendance, materials upload, assignments, quizzes, announcements, earnings dashboard, AI quiz generator |
| **Journey** | Install → phone OTP → "What do you teach?" (subject/curriculum/grade) → availability → **create first batch** → **invite students via link** (the activation moment) → run first class → mark first attendance → *activated* |

**Activation definition: a tutor who has run one session with ≥3 attending students.** Everything in onboarding optimises for that single event.

### 4.2 Student

| | |
|---|---|
| **Goals** | Pass the exam. Understand the thing they're stuck on, now, at 10pm. Not fall behind. |
| **Problems** | Stuck on homework with no one to ask; missed a class and lost the thread; doesn't know what to revise; materials buried in a chat scroll |
| **Daily workflow** | Check today's classes → attend → download notes → attempt homework → get stuck → ask AI doubt solver → take a practice quiz |
| **Permissions** | Read own enrolments, own materials, own results. Submit assignments. Message tutor **within a monitored, tutor-visible thread only**. Cannot see other students' results. |
| **MVP features** | Today view, class join, materials + offline download, assignment submission, quizzes, progress, AI doubt solver, bookmarks, search |
| **Journey** | Receives invite link → installs → OTP → **lands pre-enrolled in the batch** (no empty state, ever) → sees today's class → attends → submits first homework → *activated* |

**Activation: attended one class AND submitted one assignment within 7 days.**

### 4.3 Parent — *the payer. The most under-served user in EdTech.*

| | |
|---|---|
| **Goals** | Know the money is working. See attendance and improvement without nagging their child. |
| **Problems** | Zero visibility; only hears about problems at exam time; can't judge whether the tutor is good |
| **Daily workflow** | Mostly passive. Opens on the weekly digest push. Occasionally messages the tutor. |
| **Permissions** | Read-only on linked child's attendance, results, reports, fees. Manage subscription/billing. Message tutor. **Cannot** see the child's private AI chats (see §12.4 — this is a deliberate trust decision). |
| **MVP features** | Child link + consent, **AI weekly digest**, attendance view, results view, fee/payment history, subscription management, tutor messaging |
| **Journey** | Invited by tutor or child → OTP → verify relationship → link child → receives first weekly digest → *activated* |

**The AI Weekly Digest is the single highest-ROI feature in this product.** Parents pay; parents are otherwise invisible; a good weekly digest is the entire renewal argument delivered as a push notification. Prioritise it accordingly.

### 4.4 Administrator (internal only — no public web app)

Roles: **Support** (read + impersonate-with-consent), **Trust & Safety** (moderation, suspension, safeguarding queue), **Finance** (payouts, refunds, revenue), **Growth** (coupons, campaigns, flags), **Superadmin** (RBAC, all of the above).

Capabilities: active/expired subscriptions, trial→paid conversion funnel, promo code issuance, pricing management, revenue analytics, tutor verification queue, safeguarding reports, refund/dispute handling, feature flags, audit log search.

**Every admin action writes an immutable audit log entry. No exceptions.** This is non-negotiable in a product handling minors' data.

---

## 5. The MVP — brutal scope

Your brief lists ~40 features plus 9 AI capabilities. Shipping all of it before launch means 18 months and no market feedback. Here is the cut.

### 5.1 IN — MVP (target: 14 weeks of build)

**Identity & trust**
- Phone OTP auth (Twilio Verify) + Sign in with Apple + Google Sign-In
- Roles & RBAC; a person may hold multiple roles (a parent can also be a tutor)
- Tutor verification: government ID + qualification upload, manual review queue, verified badge
- Parent↔child linking with jurisdiction-aware consent capture

**Teaching (the Tutor OS)**
- Tutor profile: subjects, curricula, grade range, languages, bio, intro video, rate
- Availability calendar (weekly recurring + exceptions), stored UTC + IANA timezone
- Batches (group) and 1:1 bookings
- Session scheduling with RRULE recurrence, DST-safe
- **Live classes** — LiveKit Cloud, with a low-bandwidth ladder (§9.6)
- Attendance — auto-captured from live join/leave, manually overridable
- Materials: PDF + video upload, per-batch visibility, **offline download**
- Assignments: create, submit (photo/PDF), grade, feedback
- Quizzes: MCQ + short answer, auto-graded, attempt history
- Announcements + push

**Student & parent**
- Today view (the home screen)
- Progress: attendance %, quiz scores, assignment completion, simple trend
- Parent weekly digest (AI-generated)
- Monitored messaging (tutor↔student, tutor↔parent) — **never unmonitored adult↔minor DM**

**Money**
- Subscription via IAP + **RevenueCat** (monthly / quarterly / annual)
- 1:1 booking payment via Stripe (the §2.3 exemption)
- **Trial Policy Engine** — 90 days, full unlock, 30/14/7/3/1-day reminders
- Coupons + referral codes
- Tutor earnings dashboard; **Stripe Connect Express** payouts

**AI (exactly two — see §8)**
- AI Doubt Solver (Socratic, RAG over the tutor's own materials)
- AI Quiz Generator (tutor productivity — upload a PDF, get a reviewable quiz)

**Platform**
- Offline-first with sync queue
- Dark mode, 3 languages (English + 2 chosen by pilot market), RTL-ready
- WCAG 2.2 AA
- **In-app account deletion** (Apple mandates this; it is a top-5 rejection cause)
- Help centre, feedback, settings
- Admin dashboard on **Retool** (see §9.3 — deliberately not custom)

### 5.2 OUT of MVP — deferred, with reasons

| Deferred | Why | Target |
|---|---|---|
| Public discovery/search | Geo-gated on density; useless before it | Phase 6 |
| Certificates | No credibility until you have outcome data | Phase 6 |
| Mock tests / formal examinations engine | Quizzes cover 80% of value at 20% of build | Phase 6 |
| Video library as a product | Materials cover it; a content library is a different company | Phase 6 |
| Family & Institution plans | Zero demand signal pre-launch; complex entitlement logic | Phase 5–6 |
| 7 of the 9 AI features | Cost and quality risk before you understand usage | Phase 5–6 |
| Free-form in-app chat | Safeguarding risk with minors; monitored threads only at MVP | Never in current form |
| Offline **video** download | DRM licensing cost and complexity; PDFs offline is enough | Phase 6 |
| Tutor ratings & reviews | Meaningless without booking volume; gameable early | Phase 6 (verified-session-only) |
| Multi-language beyond 3 | Translation ops cost; add on demand | Phase 6 |

### 5.3 Prioritisation (impact × effort)

**Do first (high impact, low effort):** Today view · attendance · materials + offline · announcements + push · parent weekly digest · trial reminders · invite-link student import

**Do next (high impact, high effort):** Live classes · offline sync engine · payments + entitlements · AI doubt solver · tutor verification

**Cheap wins (low impact, low effort):** Dark mode · bookmarks · share-a-material · haptics

**Resist (low impact, high effort):** Certificates · examinations engine · video library · gamified leaderboards · public tutor ratings pre-density

---

## 6. Missing from the brief — features you need and didn't list

These are not nice-to-haves. Each one is a launch blocker or a support-cost bomb.

1. **Reschedule & cancellation policy engine.** Tutoring runs on rescheduling. Who can cancel, how late, refund/credit rules, no-show handling. Without it, support drowns.
2. **Global timezone & DST correctness.** Store UTC + IANA zone, render local, expand RRULE **after** timezone resolution. Get this wrong and every recurring class breaks twice a year. Budget real test time.
3. **Payout coverage is a hard constraint.** Stripe Connect supports payouts to a limited country set (~46). "Global tutors" is aspirational until you map payout rails. Define **Tier 1** (payouts live) vs **Tier 2** (tutor can teach and be found, cannot yet be paid through the platform).
4. **Trial-abuse prevention.** Device fingerprint + payment instrument + phone hash. Without it, one user gets infinite 3-month trials.
5. **Referral fraud controls.** Reward on *referee's* qualifying activity (first paid period or 3 attended classes), never on signup. Otherwise you fund a bot farm.
6. **Waitlists & batch capacity.** Full batches need a queue, not an error.
7. **Class-didn't-happen handling.** Tutor no-show, student no-show, tech failure → automatic credit/refund path.
8. **Data export & account deletion.** GDPR/DPDP right + Apple requirement.
9. **Content moderation for tutor-uploaded materials.** Automated scan + report button + review queue.
10. **Session recording consent.** Required in many jurisdictions; must be per-participant and pre-session.
11. **Low-bandwidth degradation ladder.** Global means bad networks (§9.6).
12. **Tutor onboarding SLA.** Verification must clear in <24h or supply churns during the wait.
13. **Multi-currency + FX display.** Show local currency; settle in tutor's payout currency; store minor units as integers, never floats.
14. **App size & cold-start budgets.** <40MB download, <2s cold start on a 4-year-old Android. Enforce in CI.

---

## 7. Innovations worth building

1. **"Bring your students" import.** Tutor generates a link → shares on WhatsApp → student installs and lands *pre-enrolled*. This is the growth loop. No empty states, ever.
2. **Proof-of-Teaching credential.** Verified hours taught, attendance retention, measured student improvement — accrues into a portable tutor reputation score. Creates real lock-in and gives discovery a ranking signal that isn't gameable.
3. **Socratic-mode AI by default.** The doubt solver never gives a final answer before the student attempts. Defensible pedagogy, and it keeps tutors on-side rather than feeling replaced.
4. **Value-recap paywall.** Trial ends with evidence, not a countdown. (§13.4)
5. **Referral at the moment of joy.** The share prompt fires right after a *good* progress report, not on a random home-screen banner.
6. **Offline class packs.** Pre-download the week's materials + assignments on Wi-Fi. Submissions queue and sync.
7. **Low-bandwidth ladder.** Video → screenshare+audio → audio-only → post-class recording. Never a hard failure.
8. **Shorebird code push.** Flutter hotfixes without a store review cycle. Enormous for a small team.
9. **Tutor "office hours" slots.** Bookable 15-min 1:1 doubt sessions inside a group-class subscription — this is the natural upsell and it lands on the **exempt** billing rail.

---

## 8. AI layer

### 8.1 Model routing

All Claude, routed by task. Current IDs and list pricing (per million tokens):

| Model ID | Input | Output | Context | Used for |
|---|---|---|---|---|
| `claude-haiku-4-5` | $1 | $5 | 200K | Moderation, classification, intent routing, tagging, PII scrub |
| `claude-sonnet-5` | $3 ($2 intro¹) | $15 ($10 intro¹) | 1M | Doubt solver, quiz generation, tutor assistant — the workhorse |
| `claude-opus-5` | $5 | $25 | 1M | Weekly parent digests, deep performance analysis, study plans |

¹ Introductory Sonnet 5 pricing runs through 2026-08-31; model your unit economics on the standard $3/$15 so the step-up isn't a surprise.

**Three cost levers, all of which you must use:**

- **Prompt caching.** Cache reads cost ~0.1× input; writes cost 1.25× (5-min TTL) or 2× (1-hour TTL). The tutor's materials + rubric + system prompt is a large stable prefix reused across every doubt in a batch — this is the ideal caching shape. **Minimum cacheable prefix differs by model: 512 tokens on Opus 5, 1024 on Sonnet 5, 4096 on Haiku 4.5.** Short Haiku moderation prompts will silently not cache — don't budget for a saving you won't get.
- **Batch API — 50% off.** Weekly parent digests, nightly performance analysis, and bulk quiz generation are all non-interactive. Run them through Message Batches overnight. This roughly halves the cost of your single most expensive AI feature.
- **Adaptive thinking + effort.** `thinking: {type: "adaptive"}` with `output_config: {effort: ...}` — `low`/`medium` for doubt-solving, `high` for report generation. Do not default everything to max effort.

**Budget guardrail: AI COGS ≤ $0.15 per active student per month.** Enforce with per-user monthly token budgets, hard-stopped server-side. Total COGS (AI + video + storage) ≤ 25% of ARPU or the unit economics don't work.

### 8.2 The two MVP AI features

**AI Doubt Solver (student-facing, Sonnet 5)**
- RAG over **the tutor's own uploaded materials** via pgvector. Grounded, cited, and it reinforces the tutor rather than bypassing them.
- **Socratic mode:** must not produce a final answer until the student has attempted. Enforced in the system prompt *and* by a server-side attempt gate.
- Every response cites the source material and offers "ask your tutor" as a one-tap escalation.
- Haiku 4.5 pre-screens input for abuse/PII before it reaches Sonnet.

**AI Quiz Generator (tutor-facing, Sonnet 5)**
- Tutor uploads a PDF chapter → gets 10 draft MCQs with answer keys and difficulty tags.
- **Tutor must review and approve before publishing.** Never auto-publish AI content to students.
- Drives supply retention: it saves a tutor an hour a week, which is the thing that makes them stay.

### 8.3 Phase 5–6 AI features

AI Study Planner (Opus 5, weekly batch) · AI Performance Analysis (Opus 5, batch) · AI Parent Insights — *this is the weekly digest, promote it to MVP if capacity allows* · AI Learning Recommendations (Sonnet 5) · AI Tutor Productivity Assistant (lesson plans, feedback drafting) · Full AI Tutor (conversational, long-horizon)

### 8.4 AI guardrails (non-negotiable)

- PII scrubbed before any model call; student names replaced with tokens.
- No AI output shown to a student without a citation or a "this may be wrong, check with your tutor" affordance.
- Per-user and per-org token budgets, hard-enforced server-side.
- All AI interactions logged for safeguarding review (retention per policy).
- Structured outputs (`output_config.format`) for anything parsed programmatically — never regex a model response.
- Model IDs live in server config, not client code. Model choice must be changeable without an app release.

---

## 9. Technical architecture

### 9.1 Mobile — Flutter

Flutter 3.x / Dart 3. Chosen because its own rendering engine gives pixel-identical premium UI on both platforms *and* on cheap Android hardware, which matters enormously for a globally-distributed education product.

| Concern | Choice | Why |
|---|---|---|
| State | Riverpod | Compile-safe, testable, no BuildContext coupling |
| Navigation | go_router | Declarative, deep-link and push-notification friendly |
| Local DB | Drift (SQLite) | Typed SQL, migrations, reactive queries — the offline backbone |
| Networking | Dio + Retrofit + OpenAPI codegen | Client generated from the API spec; drift between client and server becomes a compile error |
| Models | freezed + json_serializable | Immutable, exhaustive union handling |
| Media | `just_audio`, `video_player`, LiveKit SDK | |
| Hotfix | Shorebird | Ship a fix without a store review |
| Testing | flutter_test, mocktail, integration_test, golden tests | Golden tests are how you keep a design system honest |

### 9.2 Backend — NestJS modular monolith

**NestJS (TypeScript) on Fastify.** Deliberately a **modular monolith**, not microservices.

Justification: a well-partitioned monolith with read replicas comfortably serves millions of users. Premature microservices are the most reliable way for a small team to burn a year on infrastructure. Modules are bounded contexts (`identity`, `catalog`, `scheduling`, `delivery`, `assessment`, `billing`, `ai`, `notifications`, `trust`) with no cross-module DB access — only service interfaces. When one genuinely needs independent scaling (`ai` and `notifications` first), extracting it is a deploy config change, not a rewrite.

TypeScript specifically: one language across backend + admin, a large hiring pool, and end-to-end type safety into Dart via OpenAPI generation.

Async work: **BullMQ on Redis** — notifications, digests, transcoding callbacks, batch AI, webhook processing.

### 9.3 Admin dashboard — Retool for MVP

Deliberately not custom. Retool (or Appsmith self-hosted) over your Postgres + internal API gives you subscription views, promo issuance, verification queue, and revenue analytics in ~1 week instead of ~6. Migrate to a custom Next.js admin at Phase 6 when workflow complexity justifies it. **This is the single biggest scope saving in the plan.**

SSO + MFA mandatory. Every action audit-logged.

### 9.4 Data layer

| Component | Choice | Why |
|---|---|---|
| Primary DB | **PostgreSQL 16** (managed: Neon or AWS RDS) | Enrolments, schedules, payments need ACID + joins. JSONB for flexible content. **pgvector** for RAG. **PostGIS** for geo tutor search. Native full-text search. One database does four jobs. |
| Cache / queue | Redis (Upstash or ElastiCache) | Sessions, rate limits, BullMQ, entitlement cache |
| Search | Postgres FTS + PostGIS → Typesense at scale | Typesense over Elasticsearch: a fraction of the ops burden |
| Object storage | **Cloudflare R2** | **Zero egress fees.** For a global media-heavy app this is a very large recurring saving vs S3 |
| CDN | Cloudflare | Bundled with R2, global PoPs, signed URLs |

Explicitly **not** MongoDB: this domain is deeply relational and the consistency requirements around money and attendance are real.

### 9.5 Auth

Self-hosted in NestJS. Identity is your asset — don't rent it.

- **Phone OTP via Twilio Verify** — global coverage, and it handles SMS-pumping fraud, which is a genuine and expensive attack.
- **Sign in with Apple** (mandatory if you offer any social login) + **Google Sign-In**.
- Access JWT 15 min + rotating refresh token in secure storage (Keychain / EncryptedSharedPreferences), device-bound, `jti` revocation list in Redis.
- Authorization enforced at the **service layer** *and* via **Postgres RLS** as defence in depth.

*(Faster alternative if timeline pressure bites: Firebase Auth as the IdP, mint your own session JWTs, keep RBAC in your DB. Costs you some control over the phone-auth bill at scale.)*

### 9.6 Video

| | Choice | Why |
|---|---|---|
| Live | **LiveKit Cloud** | WebRTC SFU, good low-end Android behaviour, server-side recording, open-source escape hatch. *(Zoom Video SDK is the fallback if reliability at scale disappoints.)* |
| VOD | **Cloudflare Stream** | Flat per-minute pricing, signed URLs, integrates with R2/CDN |

**Low-bandwidth ladder — build this, don't bolt it on:**
`HD video → SD video → screenshare + audio → audio-only → "class recorded, watch later"`
Degrade automatically on measured bandwidth. Never show a hard failure.

Recording: on by default for **all 1:1 sessions with minors** (safeguarding), retained 90 days, with pre-session consent capture from every participant.

### 9.7 Supporting infrastructure

| Concern | Choice | Why |
|---|---|---|
| Push | Firebase Cloud Messaging (+ APNs) behind a notification service | Free, universal; the service layer adds preferences, quiet hours, and an in-app inbox |
| Payments | **Stripe + Stripe Connect Express** primary; **RevenueCat** for IAP | Connect handles KYC and payouts. RevenueCat handles the entire IAP nightmare. |
| Regional PSPs | `PaymentProvider` adapter interface | Razorpay, PayHere, Paystack, Mercado Pago plug in without touching billing logic |
| Product analytics | **PostHog** (EU region) | Analytics + feature flags + A/B + session replay in one tool. EU hosting simplifies GDPR. |
| Attribution | Firebase/GA4 → AppsFlyer at scale | |
| Errors | Sentry (Flutter + Node) | |
| Observability | OpenTelemetry → Grafana Cloud | Traces, metrics, logs, one vendor |
| Uptime | Better Stack | Public status page |
| CI/CD | GitHub Actions (backend) + **Codemagic** (Flutter) | Codemagic is Flutter-native and far cheaper than GH macOS minutes |
| Infra | Fly.io + Neon at MVP → AWS ECS Fargate + RDS at scale | Containerised + Terraform from day one so the migration is boring |

### 9.8 Scaling to millions

- **Stateless API** behind a load balancer; scale horizontally.
- **Postgres**: primary + read replicas. Route analytics and reporting to replicas.
- **Partition the hot tables** by month: `attendance`, `audit_logs`, `messages`, `notifications`, `ai_interactions`.
- **Cache entitlements aggressively** — the "is this user premium?" check happens on nearly every request. Redis, 60s TTL, invalidated on subscription webhook.
- **Media never touches your API** — signed direct-to-R2 upload and CDN download.
- **Video is the cost cliff, not the DB.** Live minutes and VOD delivery dominate COGS. Instrument per-tenant video cost from day one.
- **Queue everything non-interactive.** Digests, reports, batch AI, transcoding.
- **Rehearse the migration** to AWS at ~100k MAU rather than discovering it at 500k.

---

## 10. Database design

Postgres 16. All IDs `uuid` (v7 for time-ordering). All money stored as **integer minor units + ISO-4217 currency code** — never floats. All timestamps `timestamptz` in UTC, always paired with an IANA timezone where a wall-clock time matters.

### 10.1 Core tables

**Identity & trust**
```
users(id, phone_e164 UQ, email UQ NULL, country_code, locale, timezone,
      date_of_birth, status, created_at, deleted_at)
user_roles(user_id, role, granted_at)                  -- multi-role by design
profiles_tutor(user_id PK, display_name, headline, bio, intro_video_key,
      years_experience, verification_status, rating_avg, rating_count,
      proof_of_teaching_score)
profiles_student(user_id PK, display_name, grade_level, curriculum_id, school_name)
profiles_parent(user_id PK, display_name)
parent_child_links(id, parent_id, child_id, relationship, consent_status,
      consent_jurisdiction, verified_at)               -- UQ(parent_id, child_id)
tutor_verifications(id, tutor_id, type, document_key, provider, status,
      reviewed_by, reviewed_at, expires_at)
consent_records(id, user_id, consent_type, policy_version, granted_at, ip, user_agent)
```

**Catalog & discovery**
```
subjects(id, slug UQ, name_i18n JSONB)
curricula(id, slug UQ, name, country_code)             -- CBSE, IGCSE, IB, A/L…
grade_levels(id, curriculum_id, ordinal, label)
tutor_subjects(id, tutor_id, subject_id, curriculum_id, grade_min, grade_max,
      hourly_rate_minor, currency)
tutor_availability(id, tutor_id, weekday, start_time, end_time, timezone,
      effective_from, effective_to)
tutor_availability_exceptions(id, tutor_id, date, is_available, start_time, end_time)
tutor_locations(id, tutor_id, mode, geog GEOGRAPHY(POINT), radius_km)  -- online|in_person
```

**Teaching & delivery**
```
batches(id, tutor_id, title, subject_id, curriculum_id, grade_level_id,
      capacity, price_minor, currency, status, created_at)
enrollments(id, batch_id, student_id, status, joined_at, left_at)   -- UQ(batch_id, student_id)
bookings(id, tutor_id, student_id, slot_start_utc, duration_min,
      price_minor, currency, status)                   -- the 1:1 (exempt-rail) product
class_sessions(id, batch_id NULL, booking_id NULL, tutor_id,
      scheduled_start_utc, timezone, duration_min, mode,
      recurrence_rule, recurrence_parent_id,
      livekit_room, recording_asset_id, status)
      -- CHECK (batch_id IS NOT NULL) <> (booking_id IS NOT NULL)
attendance(id, session_id, student_id, status, joined_at, left_at,
      duration_seconds, marked_by, method)             -- PARTITION BY RANGE(joined_at)
session_participants_consent(session_id, user_id, recording_consent, granted_at)
```

**Content & assessment**
```
materials(id, owner_tutor_id, batch_id NULL, type, title, storage_key,
      size_bytes, visibility, moderation_status, created_at)
material_chunks(id, material_id, chunk_index, content, embedding VECTOR(1024))
assignments(id, batch_id, title, instructions, due_at_utc, max_score)
submissions(id, assignment_id, student_id, storage_key, submitted_at,
      score, feedback, graded_by, graded_at)           -- UQ(assignment_id, student_id)
quizzes(id, batch_id NULL, tutor_id, title, source_material_id NULL,
      ai_generated BOOL, reviewed_by, published_at)
quiz_questions(id, quiz_id, ordinal, stem, type, difficulty, explanation)
quiz_options(id, question_id, ordinal, text, is_correct)
quiz_attempts(id, quiz_id, student_id, started_at, submitted_at, score)
quiz_answers(id, attempt_id, question_id, option_id NULL, text_answer NULL, is_correct)
skill_mastery(student_id, subject_id, skill_tag, mastery_score, updated_at)
progress_snapshots(id, student_id, period_start, period_end, metrics JSONB)
```

**Money**
```
plans(id, code UQ, name, audience, features JSONB, active)
plan_prices(id, plan_id, currency, region, amount_minor, interval,
      store_product_id_ios, store_product_id_android)
subscriptions(id, user_id, plan_id, status, provider, provider_sub_id,
      trial_start, trial_end, current_period_end, cancel_at, grace_until)
trial_policies(id, role, region, cohort, duration_days, features JSONB,
      reminder_days INT[], active)                     -- the config engine
trials(id, user_id, policy_id, started_at, ends_at, extended_by_days, source,
      device_fingerprint, abuse_score)
entitlements(user_id, feature_key, source, expires_at)  -- PK(user_id, feature_key)
transactions(id, user_id, type, amount_minor, currency, provider,
      provider_ref UQ, status, created_at)
ledger_entries(id, transaction_id, account, direction, amount_minor, currency, created_at)
payout_accounts(id, tutor_id, provider, provider_account_id, status, country)
payouts(id, tutor_id, amount_minor, currency, status, provider_ref, paid_at)
refunds(id, transaction_id, amount_minor, reason, status, created_at)
coupons(id, code UQ, type, value, currency, max_redemptions, per_user_limit,
      valid_from, valid_to, campaign_id)
coupon_redemptions(id, coupon_id, user_id, transaction_id, redeemed_at)
referrals(id, referrer_id, referee_id, code, status, reward_state, qualified_at)
```

**Communication, ops, safety**
```
conversations(id, type, batch_id NULL, created_at)
conversation_members(conversation_id, user_id, role, joined_at)
messages(id, conversation_id, sender_id, body, attachment_key,
      moderation_status, created_at)                   -- PARTITION BY RANGE(created_at)
announcements(id, batch_id, tutor_id, title, body, published_at)
notifications(id, user_id, type, payload JSONB, read_at, created_at)
notification_preferences(user_id, channel, category, enabled, quiet_hours)
device_tokens(id, user_id, platform, token UQ, last_seen_at)
audit_logs(id, actor_id, actor_role, action, entity_type, entity_id,
      before JSONB, after JSONB, ip, user_agent, created_at)  -- append-only, partitioned
safeguarding_reports(id, reporter_id, subject_user_id, session_id NULL,
      category, description, status, assigned_to, resolved_at)
ai_interactions(id, user_id, feature, model_id, input_tokens, output_tokens,
      cached_tokens, cost_micros, latency_ms, created_at)     -- partitioned
feature_flags(key PK, description, rollout JSONB, updated_at)
idempotency_keys(key PK, user_id, request_hash, response JSONB, created_at)
webhook_events(id, provider, provider_event_id UQ, payload JSONB, processed_at)
```

### 10.2 Indexes

```sql
-- Discovery (the marketplace query: subject × time × location)
CREATE INDEX ON tutor_subjects (subject_id, curriculum_id, grade_min, grade_max);
CREATE INDEX ON tutor_availability (tutor_id, weekday, start_time);
CREATE INDEX ON tutor_locations USING GIST (geog);
CREATE INDEX ON profiles_tutor USING GIN (to_tsvector('simple', display_name || ' ' || headline));

-- Hot paths
CREATE INDEX ON class_sessions (tutor_id, scheduled_start_utc);
CREATE INDEX ON class_sessions (batch_id, scheduled_start_utc);
CREATE INDEX ON enrollments (student_id) WHERE status = 'active';   -- partial
CREATE INDEX ON attendance (student_id, joined_at DESC);
CREATE INDEX ON submissions (assignment_id, student_id);

-- Money
CREATE INDEX ON subscriptions (user_id) WHERE status IN ('active','trialing','grace');
CREATE INDEX ON subscriptions (current_period_end) WHERE status = 'active';
CREATE UNIQUE INDEX ON transactions (provider, provider_ref);

-- RAG
CREATE INDEX ON material_chunks USING hnsw (embedding vector_cosine_ops);

-- Time-series (cheap on append-only tables)
CREATE INDEX ON audit_logs USING BRIN (created_at);
CREATE INDEX ON ai_interactions USING BRIN (created_at);
```

### 10.3 Constraints & integrity rules

- `class_sessions`: exactly one of `batch_id` / `booking_id` (CHECK).
- `enrollments`: unique `(batch_id, student_id)`; capacity enforced in a transaction with `SELECT … FOR UPDATE` on the batch row.
- `transactions`: unique `(provider, provider_ref)` — the idempotency backbone for webhooks.
- `parent_child_links`: unique `(parent_id, child_id)`; a link is inert until `consent_status = 'verified'`.
- `audit_logs`: **append-only**, enforced by revoking UPDATE/DELETE at the role level.
- **Double-entry ledger.** Every money movement writes balanced `ledger_entries`. In a marketplace with escrow, take rates, refunds, and payouts, a single-table `transactions` log will not reconcile and you will not be able to answer "where is this tutor's money?" Do this from day one; retrofitting it is agony.
- Soft-delete users (`deleted_at`), hard-delete PII on a scheduled job after the legal retention window.

---

## 11. API design

REST, JSON, `/v1` in the path. Contract-first: **OpenAPI 3.1 is the source of truth**; the Dart client and server DTOs are both generated from it.

| Concern | Approach |
|---|---|
| **Versioning** | URL path (`/v1/…`). Additive changes only within a version; breaking changes mint `/v2` with a 6-month overlap. |
| **Auth** | `Authorization: Bearer <access JWT>` (15 min). `POST /v1/auth/refresh` rotates a device-bound refresh token. Revocation via Redis `jti` denylist. |
| **Authorization** | RBAC (role) + ABAC (relationship). "Is this tutor teaching this student?" is a relationship check, not a role check. Enforced in the service layer **and** Postgres RLS. |
| **Validation** | `class-validator` DTOs at the boundary; reject unknown fields; all limits explicit. |
| **Errors** | RFC 9457 Problem Details: `{type, title, status, detail, instance, errors[]}`. Stable machine-readable `type` URIs — the client branches on `type`, never on `detail`. |
| **Pagination** | **Cursor-based** (`?cursor=&limit=`) returning `{data, next_cursor}`. Never offset — it breaks under concurrent writes and degrades on deep pages. |
| **Idempotency** | `Idempotency-Key` header **required** on every POST that moves money or creates a booking. Stored 24h, replays the original response. |
| **Rate limiting** | Redis sliding window. Anonymous 30/min · authenticated 300/min · OTP send **5/hour/phone + 20/hour/IP** · AI endpoints 20/min + monthly token budget. `429` with `Retry-After`. |
| **Filtering/sorting** | Allowlisted fields only. Never interpolate user input into SQL ordering. |

**Representative endpoints**
```
POST   /v1/auth/otp/request           POST /v1/auth/otp/verify
POST   /v1/auth/refresh               POST /v1/auth/logout
GET    /v1/me                         PATCH /v1/me
POST   /v1/tutors/me/verification     GET  /v1/tutors/me/availability
PUT    /v1/tutors/me/availability
GET    /v1/discover/tutors?subject=&day=&from=&to=&lat=&lng=&cursor=
POST   /v1/batches                    GET  /v1/batches/:id
POST   /v1/batches/:id/invite         POST /v1/batches/:id/enroll
GET    /v1/sessions?from=&to=         POST /v1/sessions/:id/join      -> LiveKit token
POST   /v1/sessions/:id/attendance
POST   /v1/materials/upload-url       GET  /v1/batches/:id/materials
POST   /v1/assignments                POST /v1/assignments/:id/submissions
POST   /v1/quizzes/generate           POST /v1/quizzes/:id/publish
POST   /v1/quizzes/:id/attempts
GET    /v1/students/:id/progress      GET  /v1/parents/me/digest
POST   /v1/ai/doubt                   (SSE stream)
GET    /v1/billing/plans              POST /v1/billing/subscribe
POST   /v1/billing/coupons/validate   GET  /v1/billing/entitlements
POST   /v1/bookings                   POST /v1/bookings/:id/pay
POST   /v1/webhooks/revenuecat        POST /v1/webhooks/stripe
POST   /v1/reports/safeguarding
DELETE /v1/me                         (account deletion — Apple requirement)
```

Webhooks: signature-verified, stored in `webhook_events` with a unique provider event ID, processed asynchronously, idempotent by construction.

---

## 12. Security & child safety

**Safeguarding is the #1 existential risk in this product — above scaling, above cost, above competition.** A global marketplace connecting adult strangers to minors has killed companies. Treat this section as Phase 1, not Phase 6.

### 12.1 Encryption
TLS 1.3 everywhere, HSTS, certificate pinning in the Flutter client. AES-256 at rest via managed KMS. Application-level envelope encryption for the sensitive column set (DOB, identity documents, payout details). Secrets in a managed secret store — never in env files in the repo.

### 12.2 Authentication & session security
Phone OTP with 5/hour/phone rate limit, 6 digits, 5-minute expiry, 3 attempts, constant-time compare. **OTPs never appear in logs.** Anti-SMS-pumping: geo-block high-fraud prefixes, monitor cost-per-verification per country. Short-lived access tokens + rotating device-bound refresh tokens. Optional biometric app lock.

### 12.3 Authorization
RBAC + relationship-based ABAC, enforced twice (service layer + Postgres RLS). Default deny. Every endpoint has an explicit policy; a route with no policy fails CI.

### 12.4 Protecting minors — the specific controls

1. **Age gate at signup.** DOB captured, routed by jurisdiction: COPPA (US, <13), GDPR-K (EU, 13–16 varies by member state), UK Age Appropriate Design Code, India DPDP Act 2023 (**parental consent for all under-18s** — the strictest, and it will shape your global default), Australia. `consent_records` stores proof with policy version.
2. **No unmonitored adult↔minor messaging, ever.** Tutor↔student messages live in a thread the linked parent can view. This is why free-form chat is out of the MVP.
3. **All 1:1 sessions involving a minor are recorded** with pre-session consent from every participant, retained 90 days, accessible to Trust & Safety.
4. **Tutor verification before any student contact.** Government ID + qualification. Background checks via a regional provider where available (Checkr/Sterling in supported markets), disclosed in the tutor profile where it is not.
5. **Report button on every session, profile, and message thread.** Routes to a Trust & Safety queue with an SLA.
6. **Parents cannot read their child's AI doubt-solver chats.** Deliberate. Students must have a safe place to admit they don't understand something; surveillance destroys that. Parents see aggregate topics and frequency, never transcripts. Safeguarding-flagged content still escalates to Trust & Safety.

### 12.5 Privacy & data rights
Data minimisation. Purpose limitation. In-app export (JSON + media) and in-app deletion. Regional data residency where legally required (EU users' data in EU). Analytics PII-free by construction. DPIA before launch. Named DPO.

### 12.6 Payments
**Never touch card data.** Native Stripe SDK / RevenueCat only — this keeps you at PCI SAQ-A. Webhook signature verification. Ledger reconciliation job runs nightly and alerts on any imbalance.

### 12.7 Fraud detection
Trial abuse (device fingerprint + payment instrument + phone hash → deny repeat trials). Referral rings (graph analysis on referrer→referee edges; reward only on referee qualification). Chargeback handling with automatic entitlement revocation. Fake tutor profiles (verification + behavioural signals). Account takeover (impossible-travel detection, notify on new device).

### 12.8 Backup & recovery
Postgres PITR with 30-day retention. Nightly cross-region snapshots. R2 versioning + lifecycle policy. **Quarterly restore drills — an untested backup is not a backup.** Documented RTO 4h / RPO 15min.

### 12.9 Assurance
SAST + dependency scanning + secret scanning in CI. Third-party penetration test **before public launch, not after**. Bug bounty from Phase 6. Annual security review.

---

## 13. Monetization

### 13.1 Plans

| Plan | Audience | Interval | Rail | Notes |
|---|---|---|---|---|
| Tutor Pro | Tutor | Monthly / Quarterly / Annual | IAP | Unlimited batches, live classes, AI quiz generator, analytics |
| Student Premium | Student | Monthly / Quarterly / Annual | IAP | AI doubt solver, offline downloads, full analytics |
| Family | Parent | Annual only | IAP | Up to 4 children — *Phase 5* |
| Institution | Org | Annual, invoiced | Off-platform | Seats, branding, admin roles — *Phase 6* |
| 1:1 Booking | Student | Per-session | **Stripe (exempt)** | Highest margin — see §2.3 |

Annual is discounted ~30% vs monthly and is the plan to push: better retention, better cash flow, and it clears Apple's 15% reduced rate after year one.

### 13.2 Trial Policy Engine

```
trial_policies(role, region, cohort, duration_days, features, reminder_days[], active)
```
Ships as specified — **90 days, all premium features unlocked, reminders at 30/14/7/3/1 days**. Every value is server-driven and changeable per role/region/cohort without an app release. Client renders whatever the server returns; it never assumes a duration.

Entitlements resolve from a single source of truth:
```
entitlement = trial (if active) OR subscription (if active/grace) OR admin_grant OR none
```
One function, one cache, one answer. Never scatter `if (user.isPremium)` logic through the codebase.

### 13.3 Trial UX (as specified)

- Persistent, non-intrusive remaining-days indicator in Settings and on the profile header.
- Push + in-app + email at **30 / 14 / 7 / 3 / 1** days. Respect quiet hours and notification preferences.
- At 7 days: switch messaging from "trial ending" to "here's what you've achieved."
- At expiry: premium features lock; **account, profile, learning history, certificates, and payment history all remain intact and visible**, exactly as you specified. Renew from anywhere, any time, one tap.

### 13.4 Converting trials without harming UX

1. **Value-recap paywall.** Show accumulated evidence — classes attended, assignments submitted, score movement — not a countdown. Evidence converts; pressure churns.
2. **Convert the payer, not the user.** For students, the paywall targets the linked parent with the weekly digest as the argument. Parents renew on visible progress.
3. **Anchor on annual.** Default selection = annual with the saving shown as a per-month figure.
4. **Never gate the core loop.** Attending class, seeing the timetable, and submitting homework stay free forever. Gate AI, offline, deep analytics, and unlimited history. A student who cannot attend class does not convert — they uninstall.
5. **Convert at the moment of joy.** Paywall and referral prompts fire after a good report or a completed milestone, never on cold app-open.
6. **Tutor-led offers.** Let a tutor extend a discount to their own students. Tutors are your best sales channel and it costs you a coupon.
7. **Win-back.** 14 / 45 / 90 days post-expiry with a genuine offer, then stop. Three attempts, not thirty.
8. **Grace period.** 7-day billing-failure grace with in-app card-update prompt. **Involuntary churn from failed payments is typically 20–40% of all churn** and is almost entirely recoverable.

### 13.5 Referral

Give-a-month / get-a-month between parents. **Reward on referee qualification** (first paid period *or* 3 attended classes), never on signup. Fraud controls per §12.7. Surface the prompt after a positive progress report.

### 13.6 Coupons & campaigns

Percentage / fixed / free-days. Global or per-plan or per-region. Max redemptions, per-user limit, validity window, campaign attribution. Issued from the admin dashboard with a full audit trail. Cohort-tracked so you can see whether a campaign actually paid back.

---

## 14. Design system & UI

### 14.1 Design system — "Slate"

Premium in this category means **calm, fast, and legible**, not decorative. Restrained palette, one accent, generous whitespace, real typographic hierarchy, motion that explains.

**Tokens** (three layers: primitive → semantic → component)
- **Spacing:** 4pt base, 8pt rhythm — `4 8 12 16 24 32 48 64`
- **Type scale:** 12 / 14 / 16 / 20 / 24 / 32 / 40. Body 16 minimum. Scales to 200% without layout breakage.
- **Colour:** semantic tokens only (`surface`, `surface-raised`, `content-primary`, `content-secondary`, `accent`, `success`, `warning`, `danger`). Full light and dark sets. **No component references a hex value.**
- **Radius:** 8 (controls) / 12 (cards) / 20 (sheets) / full (avatars, pills)
- **Elevation:** 4 levels, subtle
- **Motion:** 120ms (micro) / 200ms (standard) / 320ms (transition), `easeOutCubic`. All disabled under `prefers-reduced-motion`.

**Component library:** Button (5 variants × 4 states), Input, Select, DatePicker, Card, ListTile, Avatar, Badge, Chip, Tab, BottomSheet, Dialog, Toast, Skeleton, EmptyState, ErrorState, ProgressRing, Calendar, SessionCard, MaterialTile, QuizQuestion, PaywallSheet.

**Accessibility (WCAG 2.2 AA, enforced not aspirational):** 4.5:1 text contrast · 44×44pt minimum touch targets · every interactive element has a semantic label · logical focus order · TalkBack/VoiceOver tested on every MVP screen · dynamic type to 200% · reduce-motion honoured · RTL layouts · no colour-only information.

**Premium feel checklist:** skeletons that match the final layout (never spinners) · optimistic UI on every mutation · haptics on meaningful confirmations · shared-element transitions between list and detail · nothing blocks >400ms without progress · empty states that teach rather than apologise.

### 14.2 Screen inventory (MVP)

**Onboarding (7):** Splash · Role select · Phone entry · OTP · Profile setup · Permissions primer · Invite-link landing
**Tutor (14):** Today · Batch list · Batch detail · Create batch · Schedule · Session detail · Live class · Attendance · Materials · Upload · Assignment create · Grading · Earnings · Profile/verification
**Student (12):** Today · Class detail · Live class · Materials · Material viewer · Assignments · Submit · Quiz list · Quiz player · Quiz result · Progress · AI doubt solver
**Parent (6):** Home/digest · Child detail · Attendance · Results · Payments · Subscription
**Shared (9):** Search · Notifications · Messages · Conversation · Calendar · Settings · Help · Feedback · Paywall

### 14.3 Screen spec template (applies to every screen)

Each screen is specified with: **Purpose** (one sentence) · **Layout** (grid, safe areas, scroll behaviour) · **Components** (from the library) · **Navigation** (entry points, exits, deep link) · **Empty state** (illustration + one-line explanation + one primary action) · **Loading state** (skeleton matching final layout) · **Error state** (what happened, what to do, retry affordance) · **Offline state** (cached content + queued-action indicator) · **Accessibility** (labels, focus order, contrast, target sizes) · **Animations** (entry, transition, micro-interactions) · **Interactions** (tap, long-press, swipe, pull-to-refresh) · **Analytics events**.

### 14.4 Four worked examples

**A. Today (student home) — the most important screen in the app**
- *Purpose:* answer "what do I need to do right now?" in under one second.
- *Layout:* greeting + date header; **Next Class** hero card with a live countdown and a Join button that activates 10 min before start; horizontally-scrolling "Due soon" assignment chips; "Continue where you left off"; recent materials.
- *Empty:* "No classes today — here's a 5-question practice quiz." Never a blank screen.
- *Loading:* three skeleton cards matching final dimensions exactly.
- *Error:* cached content with an offline banner; retry pill.
- *Offline:* fully functional from Drift cache; queued submissions badged.
- *A11y:* hero card is a single semantic node reading "Physics with Mr Khan, starts in 24 minutes, double-tap to join."
- *Motion:* staggered 40ms card entry; Join button pulses once when it activates.

**B. Live class**
- *Purpose:* attend reliably on a bad network.
- *Layout:* speaker view + filmstrip; bottom control bar (mic, camera, hand, chat, leave); persistent connection-quality pill.
- *Degradation:* auto-steps down the §9.6 ladder with a non-alarming toast ("Switched to audio to keep you connected").
- *Error:* reconnect with exponential backoff, up to 60s, then "Class recorded — watch later."
- *A11y:* captions where supported; all controls labelled; hand-raise announced.
- *Interactions:* double-tap to pin speaker; swipe down to minimise into a floating window.

**C. AI Doubt Solver**
- *Purpose:* unstick a student at 10pm without doing the work for them.
- *Layout:* chat thread; camera button to photograph a problem; source-material chips under each answer; "Ask my tutor" escalation always visible.
- *Behaviour:* Socratic — asks what the student has tried before guiding. Server-side attempt gate, not just a prompt instruction.
- *Loading:* token-by-token SSE stream (perceived latency ≈ 0).
- *Error:* "I'm having trouble — here's the relevant page from your notes instead," with the RAG citation as the fallback.
- *Budget state:* soft warning at 80% of monthly token budget; graceful degradation, never a hard cut mid-answer.

**D. Paywall (value-recap)**
- *Purpose:* convert on evidence.
- *Layout:* achievement summary (classes attended, assignments submitted, score movement) → plan selector, **annual pre-selected** with per-month saving → single primary CTA → "Keep free access" secondary, always visible and never dark-patterned.
- *A11y:* plan comparison readable as a list, not only as a table.
- *Never:* countdown timers, fake scarcity, hidden dismiss buttons. They convert marginally better this month and cost you the App Store relationship and the parent's trust.

---

## 15. Roadmap

Assumed team: 1 PM · 1 designer · 2 Flutter · 2 backend · 1 QA · 0.5 DevOps · 0.5 data. Scale timelines proportionally.

### Phase 1 — Product research (4 weeks)
**Objectives:** validate the Tutor-OS wedge; choose the pilot city; map payment/compliance per candidate market.
**Deliverables:** 20 tutor + 15 parent + 15 student interviews · competitive teardown · pilot city decision with density model · payment/legal matrix per market · pricing research (van Westendorp) · signed LOIs from 10 pilot tutors.
**Risks:** interviewing enthusiasts instead of the median tutor; choosing a market on convenience rather than density.
**Success:** ≥10 tutors commit to the pilot; pricing band validated; pilot city chosen with a written rationale.

### Phase 2 — UX/UI design (5 weeks)
**Objectives:** design system + all MVP screens + a clickable prototype validated with real users.
**Deliverables:** Slate design system in Figma (tokens, components, light/dark) · all 48 MVP screens with full state coverage · clickable prototype · 8 usability sessions (tutor, student, parent) · accessibility audit · localisation-ready copy deck.
**Risks:** designing for the demo instead of the daily loop; overlooking low-end Android rendering.
**Success:** tutor completes "create batch → invite students" unaided in <3 min; student joins a class unaided in <30s; zero critical a11y findings.

### Phase 3 — MVP development (14 weeks)
**Objectives:** ship the §5.1 scope to a production standard.
**Sequence:**
- *Wks 1–2:* infra, CI/CD, auth, RBAC, design system in Flutter
- *Wks 3–5:* tutor profile, verification, batches, scheduling, invite links
- *Wks 6–8:* live classes, attendance, materials, offline sync
- *Wks 9–10:* assignments, quizzes, progress, parent digest
- *Wks 11–12:* billing (RevenueCat + Stripe), trial engine, entitlements, paywall
- *Wks 13–14:* the two AI features, admin dashboard, hardening
**Risks:** live-video integration overruns (highest); offline sync conflict handling underestimated; store review surprises on billing (§2.3).
**Success:** all P0 tests green · crash-free sessions >99.5% · cold start <2s on a mid-range Android · app size <40MB · security review passed.

### Phase 4 — Closed beta (6 weeks)
**Objectives:** 10 tutors and ~200 of their real students running real classes in one city.
**Deliverables:** TestFlight + Play internal track · weekly feedback cycles · instrumented funnels · bug triage SLA · pen test · store listing assets and ASO.
**Risks:** tutors reverting to WhatsApp (the true competitor); video quality failures destroying trust early.
**Success:** ≥70% of scheduled classes actually run in-app · tutor W4 retention ≥60% · student W4 retention ≥40% · crash-free >99.7% · zero P1 security findings · NPS >30.

### Phase 5 — Public launch (4 weeks)
**Objectives:** open the pilot city; prove the tutor-led acquisition loop.
**Deliverables:** store launch (both platforms) · tutor referral programme · support playbooks · on-call rota · status page · dashboards for the §16 KPIs.
**Risks:** app review rejection on billing; support volume outrunning headcount; unit economics inverting on video cost.
**Success:** 100 active tutors · 1,500 active students · trial→paid ≥12% (tutors) · COGS ≤25% of ARPU · store rating ≥4.3.

### Phase 6 — Growth & scaling (ongoing)
**Objectives:** second and third cities; switch on open discovery; expand AI; institution plans.
**Deliverables:** discovery search + ranking (Proof-of-Teaching score) · verified reviews · family plans · institution plans · certificates · remaining AI features · custom Next.js admin · AWS migration · bug bounty · SOC 2 readiness.
**Risks:** discovery unlocked before density (kills retention); AI costs scaling faster than revenue; safeguarding incident.
**Success:** 3 cities above density threshold · marketplace bookings ≥20% of revenue · net revenue retention >100% · NPS >45.

**Total to public launch: ~29 weeks (~7 months).**

---

## 16. KPIs

### North Star
**Weekly Student-Hours Taught** — supply × demand × delivered value in a single number.

### Acquisition & activation
| Metric | Definition | Launch target |
|---|---|---|
| Tutor activation | Ran 1 session with ≥3 students | ≥55% of signups |
| Student activation | Attended 1 class + submitted 1 assignment in 7d | ≥60% |
| Students per tutor | Median invited-and-activated | ≥12 |
| Invite conversion | Link opened → activated student | ≥45% |
| Trial activation rate | Signups that start a trial | ≥90% |

### Engagement & retention
| Metric | Target |
|---|---|
| DAU / MAU | ≥25% (student), ≥50% (tutor) |
| Tutor W4 / M6 retention | ≥60% / ≥40% |
| Student W4 / M6 retention | ≥40% / ≥25% |
| Avg session duration | 8–15 min (excluding class time) |
| Class attendance rate | ≥80% of enrolled |
| Assignment completion | ≥65% |

### Revenue
| Metric | Target |
|---|---|
| Trial→paid (tutor) | ≥25% |
| Trial→paid (student/parent) | ≥12% |
| Annual plan mix | ≥40% of new subs |
| Subscription renewal rate | ≥85% annual, ≥75% monthly |
| Involuntary churn recovered | ≥50% via grace + dunning |
| ARPU / LTV / CAC | LTV:CAC ≥ 3:1 by month 12 |
| Gross margin | ≥75% (COGS ≤25% of ARPU) |
| Marketplace take rate | 15–20% on 1:1 bookings |

### Quality & platform
| Metric | Target |
|---|---|
| Crash-free sessions | >99.7% |
| Cold start (mid-range Android) | <2s |
| API p95 latency | <300ms |
| Live class join success | >98% |
| App size | <40MB download |
| Store rating | ≥4.5 |
| NPS | >45 by Phase 6 |
| Support tickets / 100 MAU | <3 |

### Trust & safety
Safeguarding report response time <4h · verification SLA <24h · zero unresolved P1 safety incidents · content moderation queue <2h.

### AI economics
Cost per active student per month ≤ $0.15 · doubt-solver resolution rate ≥70% · cache hit rate ≥60% on RAG prefixes · batch API usage ≥80% of digest/report volume.

---

## 17. Top risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Marketplace cold start | **Critical** | Tutor-OS wedge + invite-driven demand + geo-gated discovery (§2.1) |
| 2 | Child safety incident | **Critical** | §12.4 in full, from Phase 1 — not deferred |
| 3 | App Store billing rejection or margin shock | **High** | §2.3 split rails; legal review before build; RevenueCat |
| 4 | Video COGS exceeds revenue | **High** | Low-bandwidth ladder; per-tenant cost instrumentation; group-class default |
| 5 | Tutors revert to WhatsApp | **High** | Obsess over the tutor daily loop; measure "% of classes actually run in-app" |
| 6 | Global compliance surface | **High** | Launch one city; expand per market with a legal checklist gate |
| 7 | Timezone/DST bugs on recurring classes | **Medium** | UTC + IANA + RRULE; dedicated DST regression suite |
| 8 | Payout coverage limits "global" | **Medium** | Tier 1 / Tier 2 country model, stated openly to tutors |
| 9 | AI cost or quality regression | **Medium** | Model routing, caching, batch API, hard budgets, server-side model config |
| 10 | Trial abuse | **Medium** | Device + payment + phone fingerprinting (§12.7) |

---

## 18. Verification

Because this deliverable is a plan rather than code, "verification" means proving the assumptions before build starts, then proving the build before launch.

**Before Phase 3 (validate the plan):**
1. Confirm the App Store / Play billing split (§2.3) with counsel **in writing**. This one answer can change the business model.
2. Confirm Stripe Connect payout coverage for the pilot country. Produce the Tier 1 / Tier 2 map.
3. Confirm minor-consent obligations for the pilot jurisdiction (DPDP / GDPR-K / COPPA as applicable).
4. Price-test LiveKit and Cloudflare Stream against a modelled 1,000-student month. If COGS >25% of modelled ARPU, revisit before writing code.
5. Run one Sonnet 5 doubt-solver prototype against real tutor materials to validate RAG quality and measure actual cost per interaction.

**During Phase 3 (verify the build):**
- Unit + widget tests on every domain rule; golden tests on every design-system component.
- Integration tests on the four money paths: subscribe · renew · fail-and-grace · refund.
- **DST regression suite** — recurring classes across a spring-forward and a fall-back boundary in three timezones.
- Offline suite — airplane mode → queue submissions → reconnect → verify sync and conflict resolution.
- Load test: 10k concurrent users, 500 concurrent live participants.
- Accessibility: TalkBack + VoiceOver pass on all 48 MVP screens; automated contrast check in CI.
- Performance budgets enforced in CI: app size <40MB, cold start <2s on a reference mid-range Android.
- Security: SAST + dependency + secret scanning per PR; third-party pen test before Phase 5.

**Phase 4 (verify the product):**
Real classes, real tutors, real students, one city. The metric that matters is **"% of scheduled classes that actually ran in the app."** If that number is below 70%, the product is not ready regardless of what the other dashboards say.

---

## 19. Immediate next steps

1. **Answer the five Phase-1 verification questions above** — particularly the billing one. It is the only item that can invalidate the business model.
2. **Pick the pilot city** and recruit 10 tutors.
3. **Approve or amend the MVP cut in §5.** If you want anything moved from OUT to IN, tell me now — each item has a known cost and I'll re-baseline the 14-week estimate rather than let it silently slip.
4. On approval, the natural first build artefacts are: OpenAPI 3.1 spec · SQL migrations for §10 · Slate design tokens as JSON · the Flutter app shell with routing, theming, and auth.
