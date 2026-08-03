import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {};

// Source-map upload only fires when SENTRY_AUTH_TOKEN is set (Vercel's
// project dashboard in production; unset locally, where it silently
// no-ops per @sentry/nextjs's own documented behavior).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
