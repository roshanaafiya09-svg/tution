import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/lib/sentry-scrub";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // SEC-10: see sentry.server.config.ts's identical comment.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });
}
