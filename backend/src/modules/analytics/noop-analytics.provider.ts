import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsProvider } from './analytics.interface';

@Injectable()
export class NoopAnalyticsProvider implements AnalyticsProvider {
  private readonly logger = new Logger('Analytics (noop)');
  private warned = false;

  capture(): void {
    if (!this.warned) {
      this.logger.warn(
        'POSTHOG_API_KEY not set — analytics events will be dropped',
      );
      this.warned = true;
    }
  }
}
