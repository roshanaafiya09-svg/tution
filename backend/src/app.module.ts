import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  appConfig,
  authConfig,
  databaseConfig,
  redisConfig,
  whatsappConfig,
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        redisConfig,
        whatsappConfig,
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
