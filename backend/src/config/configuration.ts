import { registerAs } from '@nestjs/config';
import { EnvConfig } from './env.validation';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
  port: Number(process.env.PORT ?? 3001),
  // :3000 is the Next.js tutor dashboard, :5000 is `flutter run -d
  // web-server` for previewing the mobile app without an Android SDK.
  corsOrigins: (
    process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5000'
  )
    .split(',')
    .map((origin) => origin.trim()),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL as string,
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL as string,
}));

export const telegramConfig = registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  // Needed to build the t.me/<username>?start=<token> deep link the
  // linking flow hands to the user — the Bot API never exposes the
  // bot's own username on the send path, so it has to be configured.
  botUsername: process.env.TELEGRAM_BOT_USERNAME,
}));

export const emailConfig = registerAs('email', () => ({
  // Brevo (HTTPS email API) — the active OTP delivery mechanism.
  // Render's free tier blocks outbound SMTP ports entirely (25/465/587),
  // which is why this exists alongside the SMTP_* vars below rather than
  // replacing them outright — see email-otp-migration-plan.md's Brevo
  // follow-up. Sender identity is deliberately reused from SMTP_USER
  // (see EmailOtpProvider) rather than a new env var, since that's the
  // address already verified as this app's sender.
  brevoApiKey: process.env.BREVO_API_KEY,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM,
}));

export const googleAuthConfig = registerAs('googleAuth', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
}));

export const storageConfig = registerAs('storage', () => ({
  projectRef: process.env.SUPABASE_PROJECT_REF,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
  region: process.env.SUPABASE_STORAGE_REGION,
  accessKeyId: process.env.SUPABASE_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.SUPABASE_STORAGE_SECRET_ACCESS_KEY,
  localBaseUrl: process.env.LOCAL_STORAGE_BASE_URL,
}));

export const fcmConfig = registerAs('fcm', () => ({
  // Base64 of the full Firebase service-account JSON (its private_key
  // field has literal newlines that don't survive a single .env line).
  serviceAccountJsonBase64: process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64,
}));

export const posthogConfig = registerAs('posthog', () => ({
  apiKey: process.env.POSTHOG_API_KEY,
  host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
}));

export const aiConfig = registerAs('ai', () => ({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Blueprint §8: "mid model (workhorse)" for digests/quiz generation —
  // model IDs live here, never hardcoded deep in a provider or client.
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  // Blueprint §8: "small/fast model" for moderation/PII/intent routing
  // — the doubt solver's abuse pre-screen uses this, not the workhorse.
  fastModel: process.env.ANTHROPIC_FAST_MODEL ?? 'claude-haiku-4-5-20251001',
  // Blueprint §5 unit-economics guardrail: "AI cost creep... server-
  // side budgets." A flat per-student monthly token ceiling on the
  // doubt solver specifically — hard-stopped in DoubtSolverService, not
  // advisory. Tune once real usage/pricing data exists.
  doubtSolverMonthlyTokenCap: Number(
    process.env.AI_DOUBT_SOLVER_MONTHLY_TOKEN_CAP ?? '200000',
  ),
}));

export const embeddingsConfig = registerAs('embeddings', () => ({
  // Voyage AI, not Anthropic — Claude has no embeddings endpoint;
  // Voyage is Anthropic's own recommended embeddings partner. Same
  // env-gated shape as every other provider here: unset -> deterministic
  // mock (hashed bag-of-words, real cosine-similarity behaviour, not
  // real semantic search), set -> real Voyage calls. No code changes.
  apiKey: process.env.VOYAGE_API_KEY,
  model: process.env.VOYAGE_MODEL ?? 'voyage-3',
}));

export const razorpayConfig = registerAs('razorpay', () => ({
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  // Blueprint §5: the tutor's flat/per-student subscription is the
  // actual revenue model — tuition fee collection is pass-through by
  // default. A per-transaction cut on tuition itself isn't part of the
  // committed pricing anywhere in the blueprint, so this defaults to 0
  // rather than guessing a number; set it only if that changes.
  platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? '0'),
}));

export const marketplaceConfig = registerAs('marketplace', () => ({
  // Blueprint §5/§10 Phase 4: 1:1 booking take rate, 15-20% range left
  // unset — shipped at the upper bound, same resolution as parent
  // premium's ₹149 pricing (blueprint gave a ₹99-149 range).
  takeRatePercent: Number(process.env.MARKETPLACE_TAKE_RATE_PERCENT ?? '20'),
  // Blueprint §10: "≥25 active tutors + 250 active students in the
  // metro" gates open ranked Discover search vs. a curated/waitlist view.
  densityGateTutors: Number(
    process.env.MARKETPLACE_DENSITY_GATE_TUTORS ?? '25',
  ),
  densityGateStudents: Number(
    process.env.MARKETPLACE_DENSITY_GATE_STUDENTS ?? '250',
  ),
  // How long a waitlist notification holds a slot exclusively before it
  // lapses back to the general waitlist — invented, no blueprint anchor.
  waitlistWindowHours: Number(
    process.env.MARKETPLACE_WAITLIST_WINDOW_HOURS ?? '24',
  ),
}));

export const authConfig = registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  accessTokenTtl: '15m',
}));
