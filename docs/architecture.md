# Architecture

Reference doc for how the Tuition App is built. Product scope lives in [`BLUEPRINT 2.md`](../BLUEPRINT%202.md); this file is the technical map. See also [`api-reference.md`](api-reference.md) (every REST endpoint) and [`database-schema.md`](database-schema.md) (every table/migration).

## Monorepo layout

```
tuition-app/
├── backend/     NestJS modular monolith (Fastify) — API for web + mobile
├── web/         Next.js 14 (App Router) — tutor dashboard + public landing + web checkout
├── mobile/      Flutter — student/parent app, tutor on-the-go companion
├── shared/
│   └── design-tokens/   Single source of truth for color/type/spacing
├── docs/        This directory
├── docker-compose.yml   Local Postgres 16 (PostGIS + pgvector) + Redis
└── BLUEPRINT 2.md       Product spec
```

## Backend — NestJS modular monolith

Fastify adapter, no global route prefix (routes are `/auth`, not `/api/auth`), port 3001 by default. Bounded-context modules under `backend/src/modules/`, each with its own controller(s)/service(s)/repository(ies) and no cross-module DB access:

| Module | Responsibility |
|---|---|
| `identity` | Auth (WhatsApp OTP + Google Sign-In), JWT/refresh tokens, tutor/student profiles, users |
| `catalog` | Curricula/subjects/grade levels (reference data), tutor subject offerings, tutor availability |
| `scheduling` | Batches, enrollments, class sessions (RRULE recurrence), attendance, invite links |
| `delivery` | Materials (R2-backed uploads), announcements |
| `assessment` | Assignments + submissions + grading, student quiz-taking (auto-graded) |
| `billing` | Fee ledger, Razorpay payments/payouts, tutor subscriptions, parent-premium subscriptions, trial-end recap |
| `ai` | Claude-backed weekly parent digests, RAG doubt-solver (Socratic gate), tutor-facing AI quiz drafting, embeddings provider |
| `trust` | Tutor verification queue, DPDP consent records, immutable audit log |
| `parents` | Parent↔student linking (invite + consent) |
| `messaging` | Monitored, thread-based adult↔minor messaging |
| `notifications` | In-app notifications, push device tokens, FCM delivery |
| `progress` | Attendance/assignment/quiz trend aggregation for student + parent views |
| `marketplace` | Phase 4: tutor locations (PostGIS), 1:1 bookings + take rate, reschedule/cancellation policy, waitlists, reviews, Proof-of-Teaching score, discovery search/ranking |
| `analytics` | PostHog event-capture wrapper (internal, no endpoints) |
| `account` | Self-service data export + account deletion (DPDP) |
| `health` | DB + Redis liveness check |

Async/scheduled work (OTP delivery, digest generation, reminders) runs through the module's own service layer today; BullMQ/Redis-backed queues are provisioned (Redis is already a docker-compose service) but a generic job-queue module has not been extracted yet — check each module's service for how it currently triggers async work before assuming a shared queue exists.

Auth: access JWT (short-lived) + rotating refresh token, `jti`-based revocation, OTP challenges and refresh tokens stored in Redis (migrations 0007/0008 show this moved off Postgres). AuthZ via `@Roles()` guards at the controller layer.

Every module's provider-backed integrations (payments, payouts, push, OTP delivery, storage, AI, embeddings, analytics) follow the same pattern: an interface + a real provider (Razorpay, FCM, WhatsApp Cloud API, R2, Claude, Voyage, PostHog) + a mock/console/local provider for dev — swap via env config, never a code change.

## Web — Next.js 14 (App Router)

Server components, Tailwind. Routes: public landing (`/`), login (`/login`), invite-join (`/join/[token]`), and the tutor dashboard (`/dashboard/**`) — batches, sessions/attendance, assignments/grading, fees, profile. Full route table in [`api-reference.md`](api-reference.md#web-routes).

**Known gap:** the backend's public discovery/SEO endpoints (`GET /marketplace/discovery/tutors/:slug`, `GET /profiles/tutor/:slug`) have no consuming Next.js page yet — commit `f3acf4b` shipped the API side of "public SEO tutor pages" only. A route like `app/t/[slug]/page.tsx` is unbuilt. Anyone picking up marketplace-facing frontend work should start there.

## Mobile — Flutter

Riverpod + go_router. Features under `mobile/lib/features/`: `auth`, `today` (student home), `batches` (shared data provider, no screen of its own), `assignments`, `materials` (offline cache), `progress`, `notifications` (background FCM registration), `settings`, `invites` (deep-link join flow `tuitionapp://join/TOKEN`). English + Tamil localization (`l10n/`). Design tokens mirrored from `shared/design-tokens/`.

The mobile app does not sell subscriptions (web-only checkout, keeps it outside app-store IAP requirements per blueprint §2).

## Data layer

| Component | Choice |
|---|---|
| Primary DB | PostgreSQL 16, custom image (`docker/postgres.Dockerfile`) layering **PostGIS** (marketplace geo-search) + **pgvector** (RAG doubt-solver embeddings) on `postgis/postgis:16-3.4` |
| Cache | Redis 7 (also OTP/refresh-token store) |
| Object storage | Cloudflare R2 in production; local-disk provider for dev (`materials/local-upload/local-download` routes) |
| Search | Postgres FTS / PostGIS `geography` queries for marketplace discovery; no separate search service yet |

Money = integer minor units + currency code. Timestamps = UTC + IANA zone. IDs = app-generated UUIDv7 (migration `0001_extensions_and_helpers.ts`).

## Deployment / infra

- **Local dev:** `docker-compose.yml` runs Postgres (PostGIS+pgvector image) and Redis. Backend and web run via `npm run start:dev` / `npm run dev`; mobile via `flutter run`.
- **Web:** deploys via Vercel directly from git (no in-repo CI pipeline) — see [`handover.md`](../handover.md) §3 for required env vars.
- **Backend:** targeted at Fly.io + managed Postgres (Neon at MVP) per blueprint §6; containerized. No deploy pipeline is wired up in this repo yet.
- **Mobile:** no release keystore configured yet (see [`handover.md`](../handover.md)); Android release builds currently fall back to debug signing.
- **Observability:** Sentry (3 projects: backend/web/mobile) + PostHog, both env-gated (absent key = silently disabled, never a hard failure).
- **Admin:** Retool, connected via the read-only `retool_readonly` Postgres role (migration `0011`), password set manually per environment — never committed.

## Full endpoint / schema reference

- [`api-reference.md`](api-reference.md) — every REST endpoint, by module
- [`database-schema.md`](database-schema.md) — every migration, in order, Phase 1 through Phase 4
