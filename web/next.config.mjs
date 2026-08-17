import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

function safeOrigin(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const apiOrigin = safeOrigin(process.env.NEXT_PUBLIC_API_URL);
const posthogOrigin =
  safeOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST) ?? "https://us.i.posthog.com";

// Every third-party origin this app's browser code actually talks to —
// Google Identity (sign-in button + its own XHR), Razorpay Checkout.js
// (script + the iframe/XHR it opens), PostHog and Sentry (both bundled
// via npm, so they only ever need connect-src for their own XHR/beacon
// calls, never script-src).
const connectSrc = [
  "'self'",
  apiOrigin,
  posthogOrigin,
  "https://*.ingest.sentry.io",
  "https://accounts.google.com",
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
]
  .filter(Boolean)
  .join(" ");

// script-src keeps 'unsafe-inline' — not by default, but because
// Next.js's own statically-prerendered pages bake their RSC-hydration
// bootstrap script into the HTML at build time, before any per-request
// nonce could exist, so a nonce-based CSP (tried first) 403'd Next's
// own hydration payload on every static route. A per-route allowlist
// this app has never needed anything else inline for (grepped clean of
// dangerouslySetInnerHTML/innerHTML/eval across web/src) — the
// meaningful protection this CSP still carries is the *host* allowlist
// below: an injected inline script still can't load a further external
// payload or exfiltrate data anywhere outside these named origins.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-src https://accounts.google.com https://checkout.razorpay.com https://api.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Applied on every route, dev included — none of these affect webpack's
// dev-mode eval/HMR runtime.
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
];

// Production-only: `next dev`'s webpack HMR runtime needs eval() for
// React Fast Refresh, which CSP would otherwise block, and HSTS should
// never be sent from a plain-HTTP local dev server.
const productionOnlyHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: isProd
          ? [...baseSecurityHeaders, ...productionOnlyHeaders]
          : baseSecurityHeaders,
      },
    ];
  },
};

// Source-map upload only fires when SENTRY_AUTH_TOKEN is set (Vercel's
// project dashboard in production; unset locally, where it silently
// no-ops per @sentry/nextjs's own documented behavior).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
