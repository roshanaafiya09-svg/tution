import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  appConfig,
  authConfig,
  databaseConfig,
  redisConfig,
  emailConfig,
  googleAuthConfig,
  storageConfig,
  fcmConfig,
  posthogConfig,
  aiConfig,
  embeddingsConfig,
  razorpayConfig,
  marketplaceConfig,
} from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './database/redis.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AdminModule } from './modules/admin/admin.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { BillingModule } from './modules/billing/billing.module';
import { AiModule } from './modules/ai/ai.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TrustModule } from './modules/trust/trust.module';
import { AccountModule } from './modules/account/account.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ParentsModule } from './modules/parents/parents.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { DigestsModule } from './modules/ai/digests/digests.module';
import { QuizzesModule } from './modules/ai/quizzes/quizzes.module';
import { DoubtSolverModule } from './modules/ai/doubt-solver/doubt-solver.module';
import { ProgressModule } from './modules/progress/progress.module';
import { TutorLocationsModule } from './modules/marketplace/locations/tutor-locations.module';
import { ProofOfTeachingModule } from './modules/marketplace/proof-of-teaching/proof-of-teaching.module';
import { ReviewsModule } from './modules/marketplace/reviews/reviews.module';
import { DiscoveryModule } from './modules/marketplace/discovery/discovery.module';
import { AcademyMembershipsModule } from './modules/marketplace/academy-memberships/academy-memberships.module';
import { AcademyReviewsModule } from './modules/marketplace/academy-reviews/academy-reviews.module';
import { AcademiesModule } from './modules/marketplace/academies/academies.module';

/**
 * Dev-only Super Admin auto-login (see src/dev/dev-auto-login.controller.ts).
 * The production Docker image deletes dist/dev entirely after build
 * (see Dockerfile) — it never ships. A static `import` here would
 * still compile src/dev into dist/ locally (tsc compiles anything a
 * root file imports), which is fine since the Docker stage strips it
 * regardless, but using Node's plain `require()` avoids that local
 * compile step too and keeps tsc from ever treating this as a real
 * dependency of AppModule. try/catch covers the case where dist/dev
 * genuinely isn't present (the production image, or any dist/ build
 * run without NODE_ENV=production set) — module absent means nothing
 * to load, not a boot crash.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const devModuleImports: any[] = [];
if (process.env.NODE_ENV !== 'production') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dev = require('./dev/dev.module') as { DevModule: unknown };
    devModuleImports.push(dev.DevModule);
  } catch {
    // Compiled without src/dev — nothing to load.
  }
}

@Module({
  imports: [
    ...devModuleImports,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        redisConfig,
        emailConfig,
        googleAuthConfig,
        storageConfig,
        fcmConfig,
        posthogConfig,
        aiConfig,
        embeddingsConfig,
        razorpayConfig,
        marketplaceConfig,
      ],
    }),
    // Coarse, generous global safety net — not a substitute for
    // OtpService's own tighter, Redis-backed request/attempt limits,
    // which stay independent and unaffected. Sized to comfortably clear
    // a dashboard page load (several parallel GETs on mount) while still
    // blocking scraping/brute-force against unauthenticated endpoints
    // like the public marketplace search and /auth/refresh — nothing in
    // this app's own usage pattern is anywhere close to 300 req/min from
    // one client. Relies on trustProxy (see main.ts) to key correctly on
    // the real client IP behind Render's proxy, not shared infra IPs.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    RedisModule,
    AnalyticsModule,
    HealthModule,
    IdentityModule,
    AdminModule,
    CatalogModule,
    SchedulingModule,
    DeliveryModule,
    AssessmentModule,
    BillingModule,
    AiModule,
    NotificationsModule,
    TrustModule,
    AccountModule,
    ParentsModule,
    MessagingModule,
    DigestsModule,
    QuizzesModule,
    DoubtSolverModule,
    ProgressModule,
    TutorLocationsModule,
    ProofOfTeachingModule,
    ReviewsModule,
    DiscoveryModule,
    AcademyMembershipsModule,
    AcademyReviewsModule,
    AcademiesModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
