export const ANALYTICS_PROVIDER = 'ANALYTICS_PROVIDER';

export interface AnalyticsProvider {
  capture(
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
  ): void;
}
