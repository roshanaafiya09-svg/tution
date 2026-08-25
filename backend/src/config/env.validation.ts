import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z
    .string()
    .url()
    .describe(
      'Postgres connection string, e.g. postgres://user:pass@localhost:5432/tuition_dev',
    ),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // --- CSRF (web refresh-cookie protection) — signs a synchronizer
  // token derived from each refresh token's jti, returned once in the
  // login/refresh JSON body and echoed back as X-CSRF-Token on
  // /auth/refresh and /auth/logout. Needed because the refresh cookie
  // itself is SameSite=None (web and API are on different domains), so
  // SameSite alone gives no CSRF protection. See CsrfGuard. ---
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .describe('Comma-separated list of allowed origins for the web dashboard'),

  // --- Email OTP (Brevo HTTPS API) — the ONLY OTP delivery channel,
  // full stop. Optional at the schema level only because local dev is
  // allowed to fall back to a console-logging provider when these are
  // intentionally absent (see ConsoleOtpProvider) — IdentityModule's
  // OTP_PROVIDER factory enforces both vars as hard-required the moment
  // NODE_ENV=production, throwing at startup rather than silently
  // downgrading. Render's free tier blocks outbound SMTP ports
  // entirely, so this is HTTPS-based, not SMTP — see
  // email-otp-migration-plan.md. ---
  BREVO_API_KEY: z.string().optional(),

  // --- SMTP_* — kept for now (deliberately not read for sending
  // anymore; EmailOtpProvider uses Brevo). SMTP_USER's value is still
  // read, as the sender identity for Brevo sends, not for SMTP itself.
  // Removal deferred — the owner's call, not this change's. ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // --- Google Sign-In (web) — optional; endpoint 400s until set. ---
  GOOGLE_CLIENT_ID: z.string().optional(),

  // --- Object storage (Supabase Storage, via its S3-compatible API) —
  // optional; falls back to local disk for dev when unset. Chosen over
  // Cloudflare R2/Firebase Storage because both now require a linked
  // billing account/credit card just to create a bucket, even on their
  // free tiers. See blueprint §6. ---
  SUPABASE_PROJECT_REF: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
  SUPABASE_STORAGE_REGION: z.string().optional(),
  SUPABASE_STORAGE_ACCESS_KEY_ID: z.string().optional(),
  SUPABASE_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),

  // --- Local storage provider dev override — the URL the API is
  // reachable at from the *client* (mobile emulator, physical device),
  // which is not always http://localhost:<port>. ---
  LOCAL_STORAGE_BASE_URL: z.string().url().optional(),

  // --- Push notifications (Firebase Cloud Messaging, Android only for
  // now) — optional; falls back to a console-logging dev provider when
  // unset. See blueprint §6. ---
  FCM_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),

  // --- PostHog (server-side event capture) — optional; events are
  // dropped with a warning when unset. See blueprint §4 Platform row. ---
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default('https://us.i.posthog.com'),

  // --- Sentry (error tracking) — optional; read directly from
  // process.env in main.ts since Sentry.init() must run before Nest's
  // DI container exists. ---
  SENTRY_DSN: z.string().optional(),

  // --- Claude (AI weekly digest, quiz generator) — optional; falls
  // back to a templated mock provider (real stats, templated prose)
  // when unset, so these features are fully testable pre-
  // commercialization. See blueprint §8. ---
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  ANTHROPIC_FAST_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  AI_DOUBT_SOLVER_MONTHLY_TOKEN_CAP: z.coerce
    .number()
    .int()
    .positive()
    .default(200_000),

  // --- Voyage AI (doubt-solver embeddings) — optional; falls back to a
  // deterministic hashed mock embedding when unset, so RAG retrieval is
  // fully testable pre-commercialization. Claude has no embeddings
  // endpoint; Voyage is Anthropic's recommended embeddings partner. ---
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_MODEL: z.string().default('voyage-3'),

  // --- Razorpay (fee collection, Route split, tutor payouts) —
  // optional; falls back to a mock provider that fakes order
  // creation/capture so the payment flow is fully testable before a
  // real Razorpay account exists. See blueprint §6, §10 Phase 2. ---
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // --- Platform commission on tuition fee collection — optional,
  // defaults to 0 (pure pass-through). Not a number the blueprint
  // commits to anywhere; the tutor subscription is the actual revenue
  // model. See razorpayConfig's comment in configuration.ts. ---
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(100).default(0),

  // --- Setu (Academy KYC — PAN + GSTIN verification) — optional; falls
  // back to a mock KYC provider so the verification flow is fully
  // testable before a real Setu account exists. See setuConfig's
  // comment in configuration.ts for the per-product-instance-id
  // override shape. ---
  SETU_CLIENT_ID: z.string().optional(),
  SETU_CLIENT_SECRET: z.string().optional(),
  SETU_PRODUCT_INSTANCE_ID: z.string().optional(),
  SETU_PAN_PRODUCT_INSTANCE_ID: z.string().optional(),
  SETU_GSTIN_PRODUCT_INSTANCE_ID: z.string().optional(),
  SETU_WEBHOOK_SECRET: z.string().optional(),

  // --- Marketplace (blueprint §5/§10 Phase 4): the 1:1 booking take
  // rate (blueprint gives 15-20%, unset — defaults to the upper bound,
  // same resolution as parent premium's ₹149 pricing) and the density
  // gate that switches Discover between a curated/waitlist view and
  // open ranked search. ---
  MARKETPLACE_TAKE_RATE_PERCENT: z.coerce.number().min(0).max(100).default(20),
  MARKETPLACE_DENSITY_GATE_TUTORS: z.coerce.number().int().min(0).default(25),
  MARKETPLACE_DENSITY_GATE_STUDENTS: z.coerce
    .number()
    .int()
    .min(0)
    .default(250),
  MARKETPLACE_WAITLIST_WINDOW_HOURS: z.coerce.number().int().min(1).default(24),
});

export type EnvConfig = z.infer<typeof envSchema>;

// The exact placeholder strings from .env.example — a config that still
// has these means someone copied the file without generating a real
// secret. Length alone wouldn't catch this (both placeholders happen to
// clear the 32-char minimum above).
const EXAMPLE_ACCESS_SECRET = 'replace-with-a-random-32+-char-secret';
const EXAMPLE_REFRESH_SECRET =
  'replace-with-a-different-random-32+-char-secret';

/** A 32+ char string of one repeated character (or a short repeating
 *  pattern) clears the length check but has near-zero real entropy —
 *  cheap enough to brute-force that the length requirement is moot.
 *  Not a full entropy calculation, just enough to reject the obviously
 *  degenerate case. */
function hasMinimalVariety(secret: string): boolean {
  return new Set(secret).size >= 8;
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  // A stray leading/trailing space or newline from a dashboard copy-paste
  // (Render, Vercel, etc.) turns a valid URL into a same-message "Invalid
  // URL" zod error indistinguishable from an actually-missing value —
  // trim every string value up front so that class of mistake can't happen.
  const trimmed = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  );
  const parsed = envSchema.safeParse(trimmed);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CSRF_SECRET } = parsed.data;
  const secretIssues: string[] = [];
  if (JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
    secretIssues.push(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be the same value — a leaked access token secret would also forge refresh tokens.',
    );
  }
  if (CSRF_SECRET === JWT_ACCESS_SECRET || CSRF_SECRET === JWT_REFRESH_SECRET) {
    secretIssues.push(
      'CSRF_SECRET must differ from JWT_ACCESS_SECRET/JWT_REFRESH_SECRET — a leaked JWT secret should not also let an attacker forge CSRF tokens.',
    );
  }
  if (
    JWT_ACCESS_SECRET === EXAMPLE_ACCESS_SECRET ||
    JWT_REFRESH_SECRET === EXAMPLE_REFRESH_SECRET
  ) {
    secretIssues.push(
      'JWT_ACCESS_SECRET/JWT_REFRESH_SECRET still hold the placeholder value from .env.example — generate real secrets (e.g. `openssl rand -base64 48`).',
    );
  }
  if (!hasMinimalVariety(JWT_ACCESS_SECRET)) {
    secretIssues.push(
      'JWT_ACCESS_SECRET has too little character variety to be a real random secret.',
    );
  }
  if (!hasMinimalVariety(JWT_REFRESH_SECRET)) {
    secretIssues.push(
      'JWT_REFRESH_SECRET has too little character variety to be a real random secret.',
    );
  }
  if (!hasMinimalVariety(CSRF_SECRET)) {
    secretIssues.push(
      'CSRF_SECRET has too little character variety to be a real random secret.',
    );
  }
  if (secretIssues.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${secretIssues.map((m) => `  - ${m}`).join('\n')}`,
    );
  }

  return parsed.data;
}
