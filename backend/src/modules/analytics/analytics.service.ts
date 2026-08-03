import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_PROVIDER } from './analytics.interface';
import type { AnalyticsProvider } from './analytics.interface';

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(ANALYTICS_PROVIDER) private readonly provider: AnalyticsProvider,
  ) {}

  capture(
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
  ): void {
    this.provider.capture(distinctId, event, properties);
  }
}
