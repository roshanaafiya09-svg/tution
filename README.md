# Tuition App

A tutor-first teaching business OS for the Chennai / Tamil Nadu tuition market — batches, scheduling, attendance, materials, homework, and fee tracking, with students/parents on a companion mobile app. See [`BLUEPRINT 2.md`](BLUEPRINT%202.md) for the full product spec (source of truth for scope).

**Status:** Phases 1–4 (Tutor OS, closed network, student/parent depth, marketplace) implemented — see [`handover.md`](handover.md) for what's shipped vs. what still needs manual setup/deploy steps.

## Monorepo structure

```
tuition-app/
├── backend/     NestJS modular monolith (Fastify) — API for web + mobile
├── web/         Next.js 14 (App Router) — tutor dashboard + public SEO pages + web checkout
├── mobile/      Flutter — student/parent app, tutor on-the-go companion
├── shared/
│   └── design-tokens/   Single source of truth for color/type/spacing (see docs/design-system.md)
├── docs/        Architecture notes, design system, ADRs
├── docker-compose.yml   Local Postgres 16 + Redis
└── BLUEPRINT 2.md       Product spec (do not deviate without an explicit decision)
```

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Docker Desktop (for local Postgres + Redis)
- Flutter SDK ≥ 3.x, Dart ≥ 3.x (mobile app)

## Running locally

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Backend (NestJS API) — http://localhost:3001
cd backend
cp .env.example .env
npm install
npm run start:dev

# 3. Web (Next.js tutor dashboard) — http://localhost:3000
cd web
cp .env.example .env.local
npm install
npm run dev

# 4. Mobile (Flutter)
cd mobile
flutter pub get
flutter run
```

## Scope discipline

Anything moved between the blueprint's IN/OUT lists needs an explicit decision — the blueprint is the contract, not this file.

## Documentation

- [`handover.md`](handover.md) — full-blueprint status, manual setup steps, known gaps
- [`docs/architecture.md`](docs/architecture.md) — module map, tech stack, deployment
- [`docs/api-reference.md`](docs/api-reference.md) — every REST endpoint + web route + mobile screen
- [`docs/database-schema.md`](docs/database-schema.md) — every migration, Phase 1–4
- [`docs/design-system.md`](docs/design-system.md) — design tokens (`shared/design-tokens/tokens.json`), mirrored into Tailwind (web) and Flutter `ThemeData` (mobile)
