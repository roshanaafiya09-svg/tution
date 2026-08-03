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

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .describe('Comma-separated list of allowed origins for the web dashboard'),

  // --- WhatsApp OTP (Meta Cloud API) — optional; falls back to a
  // console-logging dev provider when unset. See blueprint §4/§6. ---
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_OTP_TEMPLATE_NAME: z.string().default('otp_login'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en_US'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  // --- Google Sign-In (web) — optional; endpoint 400s until set. ---
  GOOGLE_CLIENT_ID: z.string().optional(),

  // --- Object storage (Cloudflare R2) — optional; falls back to local
  // disk for dev when unset. See blueprint §6. ---
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),

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
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
