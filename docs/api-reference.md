# API Reference

Every backend REST endpoint, grouped by module. No global route prefix — routes are mounted at root (`/auth`, not `/api/auth`). Fastify adapter, port 3001 by default (`backend/src/main.ts`). Unless noted **public**, all routes require a JWT (`Authorization: Bearer <token>`); role-restricted routes are noted.

For request/response shapes see the DTOs under each module's `dto/` folder — this doc covers method, path, and purpose only.

## identity

**auth** (`/auth`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Request an OTP for `identifier` (phone number **or** email). Always delivered via Telegram — 403 with `telegramLinkRequired: true` if that account has no Telegram connected. `phoneE164` still accepted as a deprecated alias for `identifier` |
| POST | `/auth/otp/verify` | Verify OTP, issue JWT tokens (creates account on first verify; needs `signupRole`, plus `phoneForSignup` when signing up with an email, since `users.phone_e164` is NOT NULL) |
| POST | `/auth/telegram/link/start` | **Public** — start connecting Telegram for an identifier with no account yet; returns `{token, deepLink}`. 409s for an existing account (see note below) |
| GET | `/auth/telegram/link/:token/status` | **Public** — `{linked: bool}`; polled while the user is in Telegram. Never returns the chat id |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke this device's refresh token (public — the refresh token itself is the credential, same as `/auth/refresh`) |
| POST | `/auth/google` | Google Sign-In (web), verifies ID token |
| GET | `/auth/me` | Get current authenticated user |
| POST | `/auth/contact` | Step 1 of setting/updating own `email` (an alternate login identifier) — sends an OTP to the new address. Nothing is written yet |
| POST | `/auth/contact/verify` | Step 2 — verifies the OTP sent to the new address (`email` + `code`), then applies the change and revokes every refresh-token session for the account (caller must log in again on every device but this one's still-live access token). Two-step so a signed-in account can't claim an email it doesn't control. Cannot set `telegram_chat_id` — that only ever comes from Telegram itself |

**Telegram linking.** A Telegram bot can't message anyone who hasn't messaged it first, so every account connects once before it can receive codes. `link/start` deliberately refuses identifiers that already have an account: otherwise anyone could enter someone else's phone/email, attach their own Telegram, and receive that account's login codes. Accounts predating Telegram sign-in must be connected out-of-band. See handover.md §6.7.

**profiles** (`/profiles`)
| Method | Path | Purpose |
|---|---|---|
| PUT | `/profiles/tutor` | Upsert own tutor profile |
| GET | `/profiles/tutor/me` | Get own tutor profile |
| GET | `/profiles/tutor/:slug` | **Public** — tutor profile by slug |
| PUT | `/profiles/student` | Upsert own student profile |
| GET | `/profiles/student/me` | Get own student profile |

## catalog

**availability** (`/availability`, tutor)
| Method | Path | Purpose |
|---|---|---|
| GET | `/availability/me` | List own weekly availability rules |
| POST | `/availability` | Create a rule |
| DELETE | `/availability/:id` | Delete a rule |
| GET | `/availability/exceptions/me` | List own exceptions (days off) |
| POST | `/availability/exceptions` | Create an exception |
| DELETE | `/availability/exceptions/:id` | Delete an exception |

**reference** (`/catalog`, public)
| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog/curricula` | List curricula (CBSE/State Board/ICSE) |
| GET | `/catalog/curricula/:id/grade-levels` | List grade levels for a curriculum |
| GET | `/catalog/subjects` | List subjects |

**tutor-subjects** (`/tutor-subjects`, tutor)
| Method | Path | Purpose |
|---|---|---|
| GET | `/tutor-subjects/me` | List subjects/rates the tutor teaches |
| POST | `/tutor-subjects` | Add a subject/rate offering |
| DELETE | `/tutor-subjects/:id` | Remove an offering |

## scheduling

**batches** (`/batches`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/batches/me` | Tutor lists own batches |
| GET | `/batches/enrolled` | Student lists enrolled batches |
| POST | `/batches` | Tutor creates a batch (requires active subscription) |
| GET | `/batches/:id` | Tutor gets an owned batch |
| POST | `/batches/:id/archive` | Tutor archives a batch |
| GET | `/batches/:id/students` | Tutor lists enrollments |
| DELETE | `/batches/:id/students/:studentId` | Tutor removes a student |

**sessions** (`/sessions`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/sessions` | Tutor creates a session (single or recurring, RRULE) |
| GET | `/sessions/me` | Tutor's upcoming schedule window |
| GET | `/sessions/upcoming` | Student's "Today" view window |
| GET | `/sessions/batch/:batchId` | Tutor lists sessions for a batch |
| POST | `/sessions/:id/cancel` | Cancel a session (optionally whole recurring series) |
| POST | `/sessions/:id/complete` | Mark a session complete |

**attendance** (`/attendance`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/attendance/session/:sessionId` | Tutor lists attendance for a session |
| POST | `/attendance/session/:sessionId/mark` | Tutor manually marks attendance |
| POST | `/attendance/session/:sessionId/join` | Student join-tap records attendance |
| GET | `/attendance/summary/batch/:batchId` | Student's attendance summary for a batch |

**invites** (`/invites`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/invites/batch/:batchId` | Tutor creates a batch invite link |
| GET | `/invites/batch/:batchId` | Tutor lists invites for a batch |
| GET | `/invites/:token` | **Public** — preview an invite (join landing page) |
| POST | `/invites/:token/redeem` | Student redeems an invite |

## delivery

**materials** (`/materials`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/materials/upload-url` | Tutor requests an upload URL |
| GET | `/materials/batch/:batchId` | List materials for a batch |
| GET | `/materials/:id/download-url` | Get a download URL |
| DELETE | `/materials/:id` | Tutor deletes a material |
| PUT | `/materials/local-upload/:objectKey` | Dev-only local-disk upload target (stands in for Supabase Storage presigned PUT) |
| GET | `/materials/local-download/:objectKey` | Dev-only local-disk download target |

**announcements** (`/announcements`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/announcements/batch/:batchId` | Tutor posts an announcement to a batch |
| GET | `/announcements/batch/:batchId` | List announcements for a batch |

## assessment

**assignments** (`/assignments`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/assignments` | Tutor creates a homework assignment |
| GET | `/assignments/batch/:batchId` | Tutor lists assignments for a batch |
| GET | `/assignments/me` | Student lists assignments across all their batches |
| DELETE | `/assignments/:id` | Tutor deletes an assignment |
| POST | `/assignments/:id/upload-url` | Student requests a submission upload URL |
| POST | `/assignments/:id/submit` | Student submits an assignment |
| GET | `/assignments/:id/submissions` | Tutor lists submissions for an assignment |
| GET | `/assignments/:id/my-submission` | Student views their own submission |
| POST | `/assignments/submissions/:submissionId/grade` | Tutor grades a submission |
| GET | `/assignments/submissions/:submissionId/download-urls` | Tutor gets presigned download URLs for every file in a submission |
| GET | `/assignments/summary/batch/:batchId` | Student's submission summary for a batch |

**quizzes — student-facing** (`/quizzes`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/quizzes/:draftId/publish` | Tutor publishes an approved AI draft as a live, immutable quiz |
| GET | `/quizzes/batch/:batchId` | Student lists quizzes for a batch |
| GET | `/quizzes/attempts/me` | Student lists own quiz attempts |
| GET | `/quizzes/:quizId/take` | Student fetches a quiz to take |
| POST | `/quizzes/:quizId/submit` | Student submits answers (auto-graded) |
| GET | `/quizzes/:quizId/attempts` | Tutor lists all attempts for a quiz |

## billing

**fees** (`/fees`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/fees/batch/:batchId/generate` | Tutor generates a fee period for a batch |
| GET | `/fees/period` | Tutor's monthly "who hasn't paid" view |
| GET | `/fees/period/totals` | Tutor's period fee totals |
| GET | `/fees/me` | Student's own fee ledger |
| GET | `/fees/student/:studentId` | Parent's view of a consented child's fee history (403 without active consent) |
| POST | `/fees/:id/record-payment` | Tutor records a manual payment |
| POST | `/fees/:id/waive` | Tutor waives a fee |

**payments** (`/payments`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/payments/fee/:feeLedgerId/order` | Create Razorpay order for a fee ledger row |
| POST | `/payments/subscription/order` | Tutor's own subscription purchase order |
| POST | `/payments/parent-premium/order` | Parent's premium purchase order |
| POST | `/payments/booking/:bookingId/order` | Student's 1:1 booking payment order |
| POST | `/payments/booking/:bookingId/refund` | Settle refund for a cancelled booking |
| POST | `/payments/:paymentId/simulate-capture` | Dev/test-only forced capture |
| POST | `/payments/webhook` | **Public** (HMAC-verified) — Razorpay webhook |

**payouts** (`/payouts`, tutor)
| Method | Path | Purpose |
|---|---|---|
| GET | `/payouts/me` | Tutor lists own payouts |
| POST | `/payouts/generate` | Generate a payout for a period |
| POST | `/payouts/:payoutId/simulate-complete` | Dev/test-only forced completion |

**subscriptions / recap** (`/subscriptions`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/subscriptions/recap` | Trial-end value recap (paywall numbers) |
| GET | `/subscriptions/plans` | Tutor subscription pricing plans |

**parent-premium** (`/parent-premium`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/parent-premium/me` | Parent's premium subscription status |
| GET | `/parent-premium/plans` | Pricing plans |

## ai

**quizzes — tutor authoring** (`/quizzes`, tutor)
| Method | Path | Purpose |
|---|---|---|
| POST | `/quizzes/material/:materialId/generate` | AI-generate a draft quiz (MCQs) from a material PDF |
| GET | `/quizzes/me` | Tutor lists own quiz drafts |
| GET | `/quizzes/:id` | Get a draft quiz with its questions |
| PATCH | `/quizzes/:id/questions/:questionId` | Edit a draft question |
| POST | `/quizzes/:id/approve` | Approve a draft |
| POST | `/quizzes/:id/reject` | Reject a draft |

**digests** (`/digests`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/digests/me` | Parent lists their weekly AI digests |
| POST | `/digests/student/:studentId/generate` | Manual trigger, stands in for the Sunday-evening batch job |

**doubt-solver** (`/doubt-solver`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/doubt-solver/materials/:materialId/index` | Tutor indexes a material into embeddings (RAG ingestion) |
| POST | `/doubt-solver/ask` | Student asks a doubt (parent-premium-gated); returns a Socratic hint, not the answer |
| POST | `/doubt-solver/:hintId/attempt` | Student submits their own attempt to unlock the full answer |
| GET | `/doubt-solver/batch/:batchId/history` | Student's doubt-solver history for a batch |

## trust

**verifications** (`/verifications`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/verifications/upload-url` | Tutor requests upload URL for a verification document |
| GET | `/verifications/me` | Tutor lists own verification submissions |
| GET | `/verifications/queue` | Reviewer queue (trust_safety/superadmin), SLA <24h |
| GET | `/verifications/:id/download-url` | Download a doc (owning tutor or reviewer) |
| POST | `/verifications/:id/review` | Reviewer approves/rejects |

**consent** (`/consent`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/consent` | Record a DPDP Act 2023 consent grant |
| GET | `/consent/me` | List own consent records |

**audit** (`/audit-logs`, support/trust_safety/finance/growth/superadmin)
| Method | Path | Purpose |
|---|---|---|
| GET | `/audit-logs` | Query the audit trail (writes are in-process only, never over HTTP) |

## parents

`/parent-links`
| Method | Path | Purpose |
|---|---|---|
| POST | `/parent-links/invite` | Student creates a parent-invite link |
| POST | `/parent-links/redeem` | Parent redeems an invite token |
| POST | `/parent-links/:id/consent` | Parent grants DPDP consent for the link |
| GET | `/parent-links/me` | Parent lists linked children |
| GET | `/parent-links/my-parents` | Student lists linked parents |

## messaging

`/messages` — monitored, thread-based adult↔minor messaging, thread keyed by `(batch_id, student_id)`
| Method | Path | Purpose |
|---|---|---|
| GET | `/messages/mine` | List every thread the caller is part of |
| GET | `/messages/batch/:batchId/student/:studentId` | List a thread's messages |
| POST | `/messages/batch/:batchId/student/:studentId` | Send a message in a thread |

## notifications

`/notifications`
| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications` | List in-app notifications |
| GET | `/notifications/unread-count` | Unread count |
| POST | `/notifications/:id/read` | Mark one read |
| POST | `/notifications/read-all` | Mark all read |
| POST | `/notifications/device-tokens` | Register a push device token |

## progress

| Method | Path | Purpose |
|---|---|---|
| GET | `/progress/me` | Student's own attendance/assignment/quiz trend |
| GET | `/progress/student/:studentId` | Parent's view of a consented child's trend (403 without active consent) |

## account

| Method | Path | Purpose |
|---|---|---|
| GET | `/account/export` | Export caller's own data (DPDP data-portability) |
| DELETE | `/account/me` | Delete own account |

## marketplace (Phase 4)

**locations** (`/marketplace/locations`, tutor)
| Method | Path | Purpose |
|---|---|---|
| GET | `/marketplace/locations/me` | Tutor's own location |
| PUT | `/marketplace/locations` | Upsert city/area/lat/lng (PostGIS geography) |

**proof-of-teaching** (`/marketplace/proof-of-teaching`, tutor)
| Method | Path | Purpose |
|---|---|---|
| GET | `/marketplace/proof-of-teaching/me` | Tutor's own Proof-of-Teaching score |

**bookings** (`/marketplace/bookings`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/marketplace/bookings` | Student creates a 1:1 booking |
| GET | `/marketplace/bookings/me` | Student lists own bookings |
| GET | `/marketplace/bookings/tutor` | Tutor lists bookings |
| POST | `/marketplace/bookings/:id/reschedule` | Either party requests reschedule (min-notice/max-reschedule policy) |
| POST | `/marketplace/bookings/:id/cancel` | Either party cancels (refund % 0/50/100 by policy) |
| POST | `/marketplace/bookings/:id/complete` | Tutor marks complete |
| POST | `/marketplace/bookings/:id/no-show` | Tutor marks student no-show |

**waitlists** (`/marketplace/waitlists`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/marketplace/waitlists` | Student joins a waitlist for a tutor+subject offering |
| GET | `/marketplace/waitlists/me` | Student lists own waitlist entries |
| DELETE | `/marketplace/waitlists/:id` | Student leaves a waitlist |
| POST | `/marketplace/waitlists/tutor/:tutorSubjectId/notify` | Tutor manually pings their waitlist |

**reviews** (`/marketplace/reviews`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/marketplace/reviews` | Student submits a review (verified-session-only) |
| GET | `/marketplace/reviews/tutor/:tutorId` | **Public** — reviews for a tutor |
| GET | `/marketplace/reviews/me` | Student lists own reviews |
| DELETE | `/marketplace/reviews/:id` | Student deletes own review |

**discovery** (`/marketplace/discovery`, public)
| Method | Path | Purpose |
|---|---|---|
| GET | `/marketplace/discovery/tutors` | Search/rank verified tutors by Proof-of-Teaching score; curated fallback below the density gate |
| GET | `/marketplace/discovery/tutors/:slug` | Public SEO tutor page data (profile + offerings + location + PoT score + review aggregate) — consumed by the web app's `/t/[slug]` server-rendered page |
| GET | `/marketplace/discovery/gate-status` | Whether the ≥25-tutor/≥250-student density gate is open |

## health

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | DB + Redis liveness check |

---

## Web routes

Next.js 14 App Router, `web/src/app/` — 29 routes. Students stay mobile-only by design (no student-facing web routes); everything below is public, tutor, or parent.

**Public**
| Route | Renders |
|---|---|
| `/` | Public marketing landing page — hero, trial-recap preview, feature modules, trust strip, pricing teaser, "Find a tutor" link |
| `/login` | Phone/OTP + Google sign-in form; signup role picker offers tutor/student/parent |
| `/join/[token]` | Public invite preview + join-batch flow (redirects to `/login?next=...` if unauthenticated) |
| `/discover` | Public tutor search — subject/curriculum/grade filters, density-gate curated fallback |
| `/t/[slug]` | Public SEO tutor profile page (server-rendered, `generateMetadata` for SEO) — profile, location, Proof-of-Teaching score, offerings, reviews, "Book a session" CTA |
| `/book/[slug]` | Booking + checkout flow — redirects to `/login?next=...` if unauthenticated; picks an offering/time/duration, creates the booking, runs Razorpay checkout, offers a waitlist join if the slot doesn't work |
| `/bookings` | "My bookings" — reschedule, cancel, leave a review once completed (redirects to login if unauthenticated) |

**Tutor dashboard** (`/dashboard/**`, auth-gated via `dashboard-shell.tsx`)
| Route | Renders |
|---|---|
| `/dashboard` | "Today" home — today's sessions + active batches, mark-complete action |
| `/dashboard/batches` | List batches + create-batch form |
| `/dashboard/batches/[id]` | Batch detail — students (+ "Message" link per student) / sessions / materials (+ "Generate quiz" and "Index for AI" on PDFs) / homework / announcements tabs |
| `/dashboard/sessions/[id]` | Per-session attendance marking |
| `/dashboard/assignments/[id]` | Submissions list + grading form + file viewer |
| `/dashboard/fees` | Fee ledger by period, record-payment form, totals |
| `/dashboard/availability` | Weekly availability rules + exceptions |
| `/dashboard/subjects` | Subjects/curricula/grade-range/rate offerings, waitlist notify |
| `/dashboard/verification` | ID + qualification document upload, status |
| `/dashboard/billing` | Trial recap, subscription plan checkout, payouts list |
| `/dashboard/marketplace` | Location, Proof-of-Teaching score, 1:1 bookings management (complete/no-show) |
| `/dashboard/messages` | Thread list |
| `/dashboard/messages/[batchId]/[studentId]` | Message thread |
| `/dashboard/quizzes` | AI quiz draft list |
| `/dashboard/quizzes/[id]` | Question editing, approve/reject, publish, attempts view |
| `/dashboard/profile` | Tutor profile edit + data export / account deletion |

**Parent portal** (`/parent/**`, auth-gated via `parent-shell.tsx`)
| Route | Renders |
|---|---|
| `/parent` | Linked children list + latest digest summary per child |
| `/parent/link` | Redeem a child's invite token, DPDP consent step |
| `/parent/child/[studentId]` | Progress trend, weekly digests, fee history |
| `/parent/messages` | Thread list |
| `/parent/messages/[batchId]/[studentId]` | Message thread |
| `/parent/premium` | Plan picker + Razorpay checkout, status view |

Both authenticated shells also render a shared `NotificationsBell` (header dropdown, unread badge) — not a route, a component (`web/src/components/notifications-bell.tsx`).

## Mobile features

Flutter, `mobile/lib/features/`:

| Feature | Screens/functionality |
|---|---|
| `auth` | Phone entry (+91 fixed) → 6-digit OTP verify with signup-role picker |
| `today` | Student home — today's sessions, join-tap attendance, deep-link-aware |
| `batches` | Data provider only (no screen), consumed by Today/Materials |
| `assignments` | View homework, submit via photo capture or PDF pick |
| `materials` | List/download batch materials, offline reading cache, local bookmarks |
| `progress` | Attendance % and assignment-completion trend |
| `notifications` | Background FCM device-token registration (no screen) |
| `settings` | Account settings, data export, account deletion |
| `invites` | Redeem a batch invite via deep link (`tuitionapp://join/TOKEN`) or manual paste |
