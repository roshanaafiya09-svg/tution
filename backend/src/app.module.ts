import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
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
      ],
    }),
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
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
