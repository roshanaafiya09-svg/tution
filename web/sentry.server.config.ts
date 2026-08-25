import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/lib/sentry-scrub";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // SEC-10: explicit, reviewable PII policy (see src/lib/sentry-scrub.ts)
    // rather than relying implicitly on the SDK's own default redaction.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });
}
