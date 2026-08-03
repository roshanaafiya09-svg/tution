import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';
import { ANALYTICS_PROVIDER } from './analytics.interface';
import { NoopAnalyticsProvider } from './noop-analytics.provider';
import { PosthogAnalyticsProvider } from './posthog-analytics.provider';

const analyticsLogger = new Logger('AnalyticsModule');

/**
 * Bounded context: server-side product analytics (PostHog). Global so
 * every feature module can inject AnalyticsService without importing
 * this module explicitly, same as DatabaseModule/RedisModule.
 */
@Global()
@Module({
  providers: [
    NoopAnalyticsProvider,
    PosthogAnalyticsProvider,
    {
      provide: ANALYTICS_PROVIDER,
      inject: [ConfigService, NoopAnalyticsProvider, PosthogAnalyticsProvider],
      useFactory: (
        config: ConfigService,
        noopProvider: NoopAnalyticsProvider,
        posthogProvider: PosthogAnalyticsProvider,
      ) => {
        const configured = Boolean(config.get<string>('posthog.apiKey'));
        if (configured) {
          analyticsLogger.log('PostHog configured — capturing events');
          return posthogProvider;
        }
        analyticsLogger.warn(
          'POSTHOG_API_KEY not set — analytics events will be dropped',
        );
        return noopProvider;
      },
    },
    AnalyticsService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
