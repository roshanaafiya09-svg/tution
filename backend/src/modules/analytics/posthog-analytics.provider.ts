import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';
import { AnalyticsProvider } from './analytics.interface';

/**
 * Always instantiated by Nest (declared in analytics.module.ts's
 * providers: []) even when the factory doesn't select it — so client
 * construction happens lazily on first capture(), not in the
 * constructor, mirroring FcmPushProvider's getApp() pattern.
 */
@Injectable()
export class PosthogAnalyticsProvider
  implements AnalyticsProvider, OnModuleDestroy
{
  private readonly logger = new Logger('Analytics (PostHog)');
  private client: PostHog | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): PostHog {
    if (this.client) return this.client;
    this.client = new PostHog(
      this.config.getOrThrow<string>('posthog.apiKey'),
      { host: this.config.getOrThrow<string>('posthog.host') },
    );
    return this.client;
  }

  capture(
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
  ): void {
    this.getClient().capture({ distinctId, event, properties });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client._shutdown();
    } catch (err) {
      this.logger.warn(
        `PostHog shutdown flush failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
