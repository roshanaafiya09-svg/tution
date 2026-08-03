import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Safe to reference even when Sentry.init() never ran — the SDK's own
// functions no-op without an active client.
export const onRequestError = Sentry.captureRequestError;
